import { describe, expect, it } from 'vitest';
import { MARKER } from '../src/comment';
import { triage, type TriageInput } from '../src/triage';
import { failure, fakeProvider } from './helpers';

function run(overrides: Partial<TriageInput> = {}) {
  const published: string[] = [];
  const logs: string[] = [];
  const input: TriageInput = {
    failures: () => [failure()],
    diff: async () => '',
    repoRoot: '/repo',
    secrets: [],
    maxTokens: 30_000,
    provider: fakeProvider('groq'),
    dryRun: false,
    publish: async (c) => {
      published.push(c);
    },
    log: (l) => logs.push(l),
    ...overrides,
  };
  return { published, logs, done: triage(input) };
}

describe('triage', () => {
  it('diagnoses and publishes one comment', async () => {
    const { published, done } = run();
    const report = await done;

    expect(report.outcome.kind).toBe('diagnosed');
    expect(published).toHaveLength(1);
    expect(published[0].startsWith(MARKER)).toBe(true);
    expect(published[0]).toContain('`tests/e2e/article.spec.ts:12`');
  });

  describe('never fails the job', () => {
    it('Groq unavailable: comment says so, nothing thrown', async () => {
      const { published, done } = run({ provider: fakeProvider('groq', new Error('down')) });
      const report = await done;

      expect(report.outcome).toEqual({ kind: 'unavailable', reason: 'down' });
      expect(published[0]).toContain('No diagnosis this run: down');
      expect(published[0]).toContain('The merge decision is not affected');
    });

    it('no API key set', async () => {
      const { published, done } = run({ provider: undefined });
      await done;

      expect(published[0]).toContain('no Groq API key is set');
    });

    it('unreadable report', async () => {
      const { published, done } = run({
        failures: () => {
          throw new Error('results.json is not a Playwright JSON report');
        },
      });
      await done;

      expect(published[0]).toContain('is not a Playwright JSON report');
    });

    it('comment cannot be published', async () => {
      const { logs, done } = run({
        publish: async () => {
          throw new Error('403 Resource not accessible by integration');
        },
      });
      const report = await done;

      expect(report.published).toBe(false);
      expect(logs.join('\n')).toContain('could not publish the comment: 403');
    });
  });

  it('skips the call when nothing needs a diagnosis', async () => {
    const provider = fakeProvider('groq');
    const { published, done } = run({ failures: () => [], provider });
    await done;

    expect(provider.diagnosed).toBe(0);
    expect(published[0]).toContain('Nothing to diagnose');
  });

  it('dry run: builds and prints the prompt, calls no model and posts nothing', async () => {
    const provider = fakeProvider('groq');
    const { published, logs, done } = run({ provider, dryRun: true });
    const report = await done;

    expect(provider.diagnosed).toBe(0);
    expect(published).toEqual([]);
    expect(report.prompt).toContain('<error test="product: article shows the wrong author"');
    expect(logs.join('\n')).toMatch(/dry run: 1 failures, \d+ input tokens for groq-model/);
    expect(logs.join('\n')).toContain('--- prompt ---');
  });

  it('dry run works without any key, on an estimate', async () => {
    const { logs, done } = run({ provider: undefined, dryRun: true });
    await done;

    expect(logs.join('\n')).toContain('input tokens for none');
    expect(logs.join('\n')).toContain('input cost unknown');
  });
});
