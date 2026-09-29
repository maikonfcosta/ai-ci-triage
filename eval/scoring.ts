import type { Diagnosis } from '../src/prompt';

function related(a: string, b: string): boolean {
  return a === b || a.endsWith(` > ${b}`) || b.endsWith(` > ${a}`);
}

export function scoreDiagnosis(diagnoses: Diagnosis[], title: string, tests: string[], expectedFile: string, patch: string) {
  // Preserve the original evaluator verbatim as a separate metric.
  const original = diagnoses.find((d) => d.test === title) ?? diagnoses.find((d) => title && d.test.endsWith(title));
  const exact = diagnoses.filter((d) => d.test === title);
  let diagnosis = exact.length === 1 ? exact[0] : undefined;
  let match = diagnosis ? 'exact' : 'missing or ambiguous';
  if (!exact.length) {
    const candidates = diagnoses.filter((d) => related(d.test, title)
      && tests.filter((t) => related(d.test, t)).length === 1);
    if (candidates.length === 1) {
      diagnosis = candidates[0];
      match = 'shortened';
    }
  }

  const sources: string[] = [];
  let inExpectedPatch = false;
  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith('diff --git ')) inExpectedPatch = line === `diff --git a/${expectedFile} b/${expectedFile}`;
    if (inExpectedPatch && line.startsWith('++++ b/')) sources.push(line.slice('++++ b/'.length));
  }
  const exactFileHit = diagnosis?.file === expectedFile;
  return {
    diagnosis, match, sources,
    originalHit: original?.file === expectedFile,
    exactFileHit,
    equivalentFileHit: exactFileHit || (diagnosis !== undefined && sources.includes(diagnosis.file)),
  };
}
