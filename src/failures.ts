// Picks the failures worth a diagnosis: the ones failure-classifier could not settle.
// Reads its verdicts (--json output) and pulls the full error of each one from the Playwright JSON report.

import { readFileSync } from 'node:fs';

export type Category = 'product' | 'environment' | 'test' | 'unknown';
export type Confidence = 'high' | 'low';

export type Verdict = {
  test: string;
  project: string;
  location: string;
  status: 'unexpected' | 'flaky';
  category: Category;
  confidence: Confidence;
  reason: string;
  error: string;
};

export type Frame = { file: string; line: number; column: number };

export type Failure = {
  test: string;
  project: string;
  location: string;
  category: Category;
  confidence: Confidence;
  reason: string;
  message: string;
  frames: Frame[];
};

type PwError = { message?: string };
type PwResult = { status: string; errors?: PwError[] };
type PwTest = { projectName: string; status: string; results: PwResult[] };
type PwSpec = { title: string; file: string; line: number; tests: PwTest[] };
type PwSuite = { title: string; specs?: PwSpec[]; suites?: PwSuite[] };

const ANSI = /\x1b\[[0-9;]*m/g;
const FRAME = /^\s*at (?:.*? \()?(.+?):(\d+):(\d+)\)?\s*$/;

/** An environment outage has nothing to explain in the code, and a confident `test` verdict already says what to fix. */
export function needsDiagnosis(v: Verdict): boolean {
  if (v.status !== 'unexpected') return false;
  return v.category === 'product' || v.category === 'unknown' || (v.category === 'test' && v.confidence === 'low');
}

export function selectFailures(reportPath: string, verdictsPath: string): Failure[] {
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as { suites?: PwSuite[] };
  const verdicts = JSON.parse(readFileSync(verdictsPath, 'utf8')) as Verdict[];
  if (!Array.isArray(report.suites)) throw new Error(`${reportPath} is not a Playwright JSON report (no 'suites' key)`);

  const messages = new Map<string, string>();
  for (const { key, message } of failedTests(report.suites, [])) messages.set(key, message);

  return verdicts.filter(needsDiagnosis).map((v) => {
    const message = messages.get(keyOf(v.project, v.location, v.test));
    if (message === undefined) throw new Error(`verdict for "${v.test}" [${v.project}] has no matching test in ${reportPath}`);
    return {
      test: v.test,
      project: v.project,
      location: v.location,
      category: v.category,
      confidence: v.confidence,
      reason: v.reason,
      message,
      frames: parseFrames(message),
    };
  });
}

export function parseFrames(message: string): Frame[] {
  return message.split('\n').flatMap((line) => {
    const m = FRAME.exec(line);
    return m ? [{ file: m[1].replace(/\\/g, '/'), line: Number(m[2]), column: Number(m[3]) }] : [];
  });
}

function keyOf(project: string, location: string, title: string): string {
  return `${project}|${location}|${title}`;
}

// Titles are built the way failure-classifier builds them, so verdicts and tests match one to one.
function* failedTests(suites: PwSuite[], path: string[]): Generator<{ key: string; message: string }> {
  for (const suite of suites) {
    const here = !suite.title || suite.title.endsWith('.ts') ? path : [...path, suite.title];
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        if (test.status !== 'unexpected' && test.status !== 'flaky') continue;
        const attempt = test.results.find((r) => r.status !== 'passed');
        // A timed-out test reports "Test timeout" first; the error that says where it hung comes after it.
        const message = (attempt?.errors ?? []).map((e) => e.message ?? '').filter(Boolean).join('\n\n');
        const title = [...here, spec.title].join(' > ');
        yield { key: keyOf(test.projectName, `${spec.file}:${spec.line}`, title), message: message.replace(ANSI, '') };
      }
    }
    yield* failedTests(suite.suites ?? [], here);
  }
}
