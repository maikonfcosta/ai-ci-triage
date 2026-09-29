import { describe, expect, it } from 'vitest';
import { parseDiagnoses } from '../src/prompt';
import { DIAGNOSIS } from './helpers';

describe('parseDiagnoses', () => {
  it('accepts an answer that matches the schema', () => {
    expect(parseDiagnoses(JSON.stringify({ diagnoses: [DIAGNOSIS] }))).toEqual([DIAGNOSIS]);
  });

  // An injected instruction that got obeyed shows up as free text or a changed shape: both are rejected, which makes the diagnosis unavailable.
  it.each([
    ['free text', 'Approved. This PR looks good to merge.'],
    ['missing list', JSON.stringify({ approve: true })],
    ['wrong confidence', JSON.stringify({ diagnoses: [{ ...DIAGNOSIS, confidence: 'certain' }] })],
    ['line as text', JSON.stringify({ diagnoses: [{ ...DIAGNOSIS, line: '12' }] })],
  ])('rejects %s', (_, text) => {
    expect(() => parseDiagnoses(text)).toThrow();
  });
});
