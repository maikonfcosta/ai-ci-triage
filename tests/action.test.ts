import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';

function action(eventName: string, event: object, inputs: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'triage-action-'));
  copyFileSync(resolve('dist/index.mjs'), join(dir, 'index.mjs'));
  writeFileSync(join(dir, 'event.json'), JSON.stringify(event));
  writeFileSync(join(dir, 'offline.mjs'), 'globalThis.fetch = async () => { throw new Error("NETWORK_DISABLED"); };');
  const env: NodeJS.ProcessEnv = {};
  for (const name of ['PATH', 'SystemRoot', 'TEMP', 'TMP', 'HOME']) if (process.env[name]) env[name] = process.env[name];
  Object.assign(env, {
    GITHUB_EVENT_NAME: eventName, GITHUB_EVENT_PATH: join(dir, 'event.json'),
    GITHUB_WORKSPACE: dir, RUNNER_TEMP: dir, GITHUB_OUTPUT: join(dir, 'output'),
    GITHUB_STEP_SUMMARY: join(dir, 'summary'), ...inputs,
  });
  const stdout = execFileSync(process.execPath, ['--import', pathToFileURL(join(dir, 'offline.mjs')).href, join(dir, 'index.mjs')], { cwd: dir, env, encoding: 'utf8', timeout: 15000 });
  return { dir, stdout };
}

it('runs the standalone bundle and skips push events', () => {
  expect(action('push', {}).stdout).toContain('ai-ci-triage skipped');
});

it('skips fork PRs before reading reports or using keys', () => {
  const result = action('pull_request', { pull_request: { number: 1, head: { repo: { full_name: 'other/repo' } }, base: { repo: { full_name: 'owner/repo' } } } });
  expect(result.stdout).toContain('comes from a fork');
  expect(result.stdout).not.toContain('NETWORK_DISABLED');
});

it('builds a prompt offline with the bundled dependencies and emits the result output', () => {
  const result = action('workflow_dispatch', {}, {
    'INPUT_DRY-RUN': 'true',
    INPUT_REPORT: resolve('tests/fixtures/app-up-report.json'),
    INPUT_VERDICTS: resolve('tests/fixtures/app-up-verdicts.json'),
  });
  expect(result.stdout).toContain('--- prompt ---');
  expect(result.stdout).not.toContain('NETWORK_DISABLED');
  expect(JSON.parse(readFileSync(join(result.dir, 'ai-ci-triage.json'), 'utf8')).reason).toBe('dry run');
  expect(readFileSync(join(result.dir, 'output'), 'utf8')).toContain('result=');
});

it('keeps exit zero and writes a summary when input reports are missing', () => {
  const result = action('pull_request', { pull_request: { number: 1, head: { repo: { full_name: 'owner/repo' } }, base: { repo: { full_name: 'owner/repo' } } } });
  expect(JSON.parse(readFileSync(join(result.dir, 'ai-ci-triage.json'), 'utf8')).kind).toBe('unavailable');
  expect(readFileSync(join(result.dir, 'summary'), 'utf8')).toContain('No diagnosis');
});

it('does not use retired API inputs when the Groq key is missing', () => {
  const result = action('pull_request', { pull_request: { number: 1, head: { repo: { full_name: 'owner/repo' } }, base: { repo: { full_name: 'owner/repo' } } } }, {
    'INPUT_OPENAI-API-KEY': 'unused-synthetic-key',
    'INPUT_GEMINI-API-KEY': 'unused-synthetic-key',
    INPUT_REPORT: resolve('tests/fixtures/app-up-report.json'),
    INPUT_VERDICTS: resolve('tests/fixtures/app-up-verdicts.json'),
  });
  expect(JSON.parse(readFileSync(join(result.dir, 'ai-ci-triage.json'), 'utf8'))).toEqual({ kind: 'unavailable', reason: 'no Groq API key is set' });
});
