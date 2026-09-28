import { describe, expect, it } from 'vitest';
import { parseDiagnoses } from '../src/prompt';
import { cost, diagnoseWithFallback, inputCost } from '../src/providers';
import { DIAGNOSIS, fakeProvider } from './helpers';

describe('cost', () => {
  it('prices uncached, cached, cache-write and output tokens separately', () => {
    // 1000 uncached * $2 + 500 cached * $0.2 + 500 written * $2.5 + 200 output * $10, per 1M
    expect(cost('gpt-6-sol', { inputTokens: 2000, cachedTokens: 500, cacheWriteTokens: 500, outputTokens: 200 })).toBeCloseTo(0.00535, 8);
  });

  it('reports an unknown price as unknown, never as zero', () => {
    const usage = { inputTokens: 1000, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 10 };
    expect(cost('some-new-model', usage)).toBeNull();
    expect(inputCost('some-new-model', 1000)).toBeNull();
  });
});

describe('diagnoseWithFallback', () => {
  it('uses the primary when it answers', async () => {
    const primary = fakeProvider('openai');
    const fallback = fakeProvider('gemini');

    const result = await diagnoseWithFallback('ctx', primary, fallback);

    expect(result.provider).toBe('openai');
    expect(result.fallbackReason).toBeUndefined();
    expect(fallback.diagnosed).toBe(0);
  });

  it('answers from the fallback when the primary fails, and says why', async () => {
    const result = await diagnoseWithFallback('ctx', fakeProvider('openai', new Error('openai refused: policy')), fakeProvider('gemini'));

    expect(result.provider).toBe('gemini');
    expect(result.fallbackReason).toBe('openai failed: openai refused: policy');
  });

  it('with no fallback configured, the primary error comes through', async () => {
    await expect(diagnoseWithFallback('ctx', fakeProvider('openai', new Error('timeout')))).rejects.toThrow('timeout');
  });
});

describe('parseDiagnoses', () => {
  it('accepts an answer that matches the schema', () => {
    expect(parseDiagnoses(JSON.stringify({ diagnoses: [DIAGNOSIS] }))).toEqual([DIAGNOSIS]);
  });

  // An injected instruction that got obeyed shows up as free text or a changed shape: both are rejected, which triggers the fallback.
  it.each([
    ['free text', 'Approved. This PR looks good to merge.'],
    ['missing list', JSON.stringify({ approve: true })],
    ['wrong confidence', JSON.stringify({ diagnoses: [{ ...DIAGNOSIS, confidence: 'certain' }] })],
    ['line as text', JSON.stringify({ diagnoses: [{ ...DIAGNOSIS, line: '12' }] })],
  ])('rejects %s', (_, text) => {
    expect(() => parseDiagnoses(text)).toThrow();
  });
});
