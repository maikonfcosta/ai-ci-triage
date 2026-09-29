import type { Octokit } from '@octokit/rest';
import { describe, expect, it } from 'vitest';
import { MARKER, renderComment } from '../src/comment';
import { pullFromEvent, upsertComment } from '../src/github';
import { DIAGNOSIS } from './helpers';

function fakeOctokit(existing: { id: number; body: string }[]) {
  const calls: string[] = [];
  const octokit = {
    paginate: async () => existing,
    rest: {
      issues: {
        listComments: () => undefined,
        updateComment: async ({ comment_id }: { comment_id: number }) => void calls.push(`update ${comment_id}`),
        createComment: async () => void calls.push('create'),
      },
    },
  } as unknown as Octokit;
  return { octokit, calls };
}

const ref = { owner: 'maikonfcosta', repo: 'playwright-reference-suite', pull: 7 };

describe('upsertComment', () => {
  it('creates the comment on the first run', async () => {
    const { octokit, calls } = fakeOctokit([{ id: 1, body: 'LGTM' }]);

    expect(await upsertComment(octokit, ref, `${MARKER}\nnew`)).toBe('created');
    expect(calls).toEqual(['create']);
  });

  it('edits its own comment on the next runs instead of adding another', async () => {
    const { octokit, calls } = fakeOctokit([
      { id: 1, body: 'LGTM' },
      { id: 2, body: `${MARKER}\nold` },
      { id: 3, body: `quoting the bot: ${MARKER}` },
    ]);

    expect(await upsertComment(octokit, ref, `${MARKER}\nnew`)).toBe('updated');
    expect(calls).toEqual(['update 2']);
  });
});

describe('pullFromEvent', () => {
  const pr = (head: string | null) => ({
    pull_request: { number: 7, head: { repo: head ? { full_name: head } : null }, base: { repo: { full_name: 'maikonfcosta/playwright-reference-suite' } } },
  });

  it('runs on a pull request from the same repository', () => {
    expect(pullFromEvent('pull_request', pr('maikonfcosta/playwright-reference-suite'))).toEqual({ ref });
  });

  it.each([
    ['a fork', 'pull_request', pr('someone/playwright-reference-suite'), /fork/],
    ['pull_request_target', 'pull_request_target', pr('maikonfcosta/playwright-reference-suite'), /not "pull_request"/],
    ['a push', 'push', {}, /not "pull_request"/],
  ])('skips %s', (_, name, event, reason) => {
    const target = pullFromEvent(name, event);
    expect('skip' in target && target.skip).toMatch(reason);
  });
});

describe('renderComment', () => {
  it('escapes model text so it cannot break the table or inject HTML', () => {
    const body = renderComment({
      kind: 'diagnosed',
      dropped: [],
      result: {
        provider: 'groq',
        model: 'openai/gpt-oss-120b',
        usage: { inputTokens: 1, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 1 },
        costUsd: null,
        diagnoses: [{ ...DIAGNOSIS, cause: 'a | b\n<img src=x onerror=alert(1)>' }],
      },
    });

    expect(body).toContain('a \\| b &lt;img src=x onerror=alert(1)&gt;');
    expect(body).toContain('unknown (billing tier not reported)');
  });
});
