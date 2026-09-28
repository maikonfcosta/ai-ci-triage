import { describe, expect, it } from 'vitest';
import { buildContext } from '../src/context';
import { redact, secretValues } from '../src/redact';
import { failure, repoWith } from './helpers';

// One of each kind the spec names, planted where a real run could carry them: the error, the diff and a source file.
const PLANTED = {
  bearer: 'Authorization: Bearer abcDEF1234567890ghiJKL',
  jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiZGF0YXNldCJ9.c2lnbmF0dXJlLXZhbHVlLWhlcmU',
  githubToken: `ghp_${'A1b2C3d4E5'.repeat(4)}`,
  githubPat: `github_pat_${'11AAAA0000'.repeat(4)}`,
  openaiKey: `sk-proj-${'x9Y8z7W6v5'.repeat(3)}`,
  // Google keys are always AIza + 35 characters.
  googleKey: `AIza${'SyD0123456789abcdefghijklmnopqrstuv'}`,
  googleKeyNew: `AQ.${'Ab12Cd34Ef56Gh78_-'.repeat(3)}`,
  awsKey: 'AKIAIOSFODNN7EXAMPLE',
  privateKey: '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA0000\n-----END RSA PRIVATE KEY-----',
  envSecret: 'value-of-a-repo-secret-42',
};
const secretOnly = (s: string) => (s.startsWith('Authorization') ? s.split('Bearer ')[1] : s.startsWith('-----') ? 'MIIEpAIBAAKCAQEA0000' : s);

describe('redaction', () => {
  it('no planted secret reaches the built prompt', async () => {
    const all = Object.values(PLANTED).join('\n');
    const repo = repoWith({ 'tests/e2e/article.spec.ts': `// fixture\n${all}\n`.repeat(3) });
    const context = await buildContext({
      failures: [failure({ message: `Error: request failed\n${all}\n    at ${repo}/tests/e2e/article.spec.ts:3:1`, frames: [{ file: `${repo}/tests/e2e/article.spec.ts`, line: 3, column: 1 }] })],
      diff: ['diff --git a/src/x.ts b/src/x.ts', '--- a/src/x.ts', '+++ b/src/x.ts', '@@ -1,1 +1,1 @@', ...all.split('\n').map((l) => `+${l}`)].join('\n'),
      repoRoot: repo,
      secrets: secretValues({ DEPLOY_TOKEN: PLANTED.envSecret }),
      maxTokens: 100_000,
      countTokens: async (t) => Math.ceil(t.length / 4),
    });

    for (const [kind, value] of Object.entries(PLANTED)) {
      expect(context.text, kind).not.toContain(secretOnly(value));
    }
    expect(context.text).toContain('<source file="tests/e2e/article.spec.ts"');
  });

  it('takes secret values from env names that look secret, including action inputs', () => {
    const values = secretValues({
      'INPUT_OPENAI-API-KEY': 'sk-live-0000000000',
      GITHUB_TOKEN: 'ghs_short_but_real_1',
      DATABASE_PASSWORD: 'hunter2hunter2',
      NODE_ENV: 'production-value',
      CI_TOKEN: 'true',
    });

    expect(values.sort()).toEqual(['ghs_short_but_real_1', 'hunter2hunter2', 'sk-live-0000000000'].sort());
  });

  it('leaves ordinary text alone', () => {
    const text = 'Expected: 200 Received: 502 at tests/api/articles.spec.ts:40:7';
    expect(redact(text, [])).toBe(text);
  });
});
