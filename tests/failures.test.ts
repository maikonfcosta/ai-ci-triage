import { describe, expect, it } from 'vitest';
import { parseFrames, selectFailures } from '../src/failures';

const REPORT = 'tests/fixtures/app-up-report.json';
const VERDICTS = 'tests/fixtures/app-up-verdicts.json';

describe('selectFailures', () => {
  // Real run from failure-classifier's dataset: 3 outages, 3 low-confidence test verdicts, 6 product verdicts.
  it('keeps what failure-classifier could not settle and drops the outages', () => {
    const failures = selectFailures(REPORT, VERDICTS);

    expect(failures).toHaveLength(9);
    expect(failures.some((f) => f.category === 'environment')).toBe(false);
  });

  it('carries the full error and the frame that failed', () => {
    const author = selectFailures(REPORT, VERDICTS).find((f) => f.test === 'product: article shows the wrong author');

    expect(author?.message).toContain('Received: " someone-else "');
    expect(author?.frames).toEqual([{ file: '<suite>/tests/e2e/dataset/product.spec.ts', line: 39, column: 49 }]);
  });

  it('refuses a file that is not a Playwright report', () => {
    expect(() => selectFailures(VERDICTS, VERDICTS)).toThrow(/not a Playwright JSON report/);
  });
});

describe('parseFrames', () => {
  it('reads both stack frame shapes', () => {
    const message = ['Error: boom', '    at /repo/tests/a.spec.ts:3:7', '    at helper (/repo/src/pages/b.page.ts:10:2)'].join('\n');

    expect(parseFrames(message)).toEqual([
      { file: '/repo/tests/a.spec.ts', line: 3, column: 7 },
      { file: '/repo/src/pages/b.page.ts', line: 10, column: 2 },
    ]);
  });
});
