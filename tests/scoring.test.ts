import { expect, it } from 'vitest';
import { scoreDiagnosis } from '../eval/scoring';
import { DIAGNOSIS } from './helpers';

it('associates a shortened title only when it identifies one input test', () => {
  const score = scoreDiagnosis([{ ...DIAGNOSIS, test: 'signs in' }], 'auth > signs in', ['auth > signs in'], DIAGNOSIS.file, '');
  expect(score.originalHit).toBe(false);
  expect(score.exactFileHit).toBe(true);
  expect(score.match).toBe('shortened');
});

it('rejects ambiguous short titles and duplicate diagnoses', () => {
  const d = { ...DIAGNOSIS, test: 'signs in' };
  expect(scoreDiagnosis([d], 'auth > signs in', ['auth > signs in', 'admin > signs in'], d.file, '').diagnosis).toBeUndefined();
  expect(scoreDiagnosis([d, d], 'signs in', ['signs in'], d.file, '').diagnosis).toBeUndefined();
});

it('does not accept a partial word suffix', () => {
  expect(scoreDiagnosis([{ ...DIAGNOSIS, test: 'in' }], 'signs in', ['signs in'], DIAGNOSIS.file, '').diagnosis).toBeUndefined();
});

it('accepts only source paths from the expected embedded patch', () => {
  const patch = 'diff --git a/fix.patch b/fix.patch\n+++ b/fix.patch\n++++ b/server/login.ts\ndiff --git a/other.patch b/other.patch\n++++ b/server/other.ts';
  const d = { ...DIAGNOSIS, file: 'server/login.ts' };
  const score = scoreDiagnosis([d], d.test, [d.test], 'fix.patch', patch);
  expect(score.originalHit).toBe(false);
  expect(score.exactFileHit).toBe(false);
  expect(score.equivalentFileHit).toBe(true);
  expect(scoreDiagnosis([{ ...d, file: 'server/other.ts' }], d.test, [d.test], 'fix.patch', patch).equivalentFileHit).toBe(false);
});

it('retains the original score for unchanged exact matches', () => {
  const score = scoreDiagnosis([DIAGNOSIS], DIAGNOSIS.test, [DIAGNOSIS.test], DIAGNOSIS.file, '');
  expect(score.originalHit).toBe(true);
  expect(score.match).toBe('exact');
  expect(score.equivalentFileHit).toBe(true);
});
