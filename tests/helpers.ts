import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Failure } from '../src/failures';
import type { Diagnosis } from '../src/prompt';
import type { Answer, Provider } from '../src/providers';

export function failure(overrides: Partial<Failure> = {}): Failure {
  return {
    test: 'product: article shows the wrong author',
    project: 'chromium',
    location: 'e2e/article.spec.ts:12',
    category: 'product',
    confidence: 'high',
    reason: 'a business assertion failed on a healthy app',
    message: 'Error: expect(locator).toHaveText(expected) failed\n    at /repo/tests/e2e/article.spec.ts:12:5',
    frames: [{ file: '/repo/tests/e2e/article.spec.ts', line: 12, column: 5 }],
    ...overrides,
  };
}

export function repoWith(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'triage-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

export const DIAGNOSIS: Diagnosis = {
  test: 'product: article shows the wrong author',
  cause: 'the API response rewrites the author',
  file: 'tests/e2e/article.spec.ts',
  line: 12,
  confidence: 'high',
  check_first: 'the route handler above line 12',
};

type Fake = Provider & { diagnosed: number };

/** A provider that answers, or throws, without any network. Counts tokens as 1 per 4 characters. */
export function fakeProvider(name: string, behaviour: 'answer' | Error = 'answer'): Fake {
  const fake: Fake = {
    name,
    model: `${name}-model`,
    diagnosed: 0,
    countTokens: async (text) => Math.ceil(text.length / 4),
    diagnose: async (): Promise<Answer> => {
      fake.diagnosed++;
      if (behaviour instanceof Error) throw behaviour;
      return {
        provider: name,
        model: `${name}-model`,
        diagnoses: [DIAGNOSIS],
        usage: { inputTokens: 1000, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 100 },
        costUsd: 0.001,
      };
    },
  };
  return fake;
}
