import { afterEach, expect, it, vi } from 'vitest';
import { GroqProvider } from '../src/providers';
import { redact } from '../src/redact';
import { DIAGNOSIS } from './helpers';

afterEach(() => vi.unstubAllGlobals());

function reply(content = JSON.stringify({ diagnoses: [DIAGNOSIS] }), finish = 'stop') {
  return new Response(JSON.stringify({
    choices: [{ message: { content }, finish_reason: finish }],
    usage: { prompt_tokens: 1200, completion_tokens: 300 },
  }), { headers: { 'content-type': 'application/json' } });
}

it('sends the shared strict schema to Groq and preserves measured usage', async () => {
  const fetch = vi.fn(async () => reply());
  vi.stubGlobal('fetch', fetch);
  const result = await new GroqProvider('test-key').diagnose('failure context');
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(String(url)).toBe('https://api.groq.com/openai/v1/chat/completions');
  const body = JSON.parse(String(init.body));
  expect(body.model).toBe('openai/gpt-oss-120b');
  expect(body.response_format.json_schema.strict).toBe(true);
  expect(body.messages[1].content).toBe('failure context');
  expect(result.provider).toBe('groq');
  expect(result.diagnoses).toEqual([DIAGNOSIS]);
  expect(result.usage.inputTokens).toBe(1200);
  expect(result.usage.outputTokens).toBe(300);
  expect(result.costUsd).toBeNull();
});

it.each([['{}', 'stop'], ['{}', 'length'], ['', 'content_filter']])('rejects unusable answers (%s, %s)', async (content, finish) => {
  vi.stubGlobal('fetch', async () => reply(content, finish));
  await expect(new GroqProvider('test-key').diagnose('ctx')).rejects.toThrow();
});

it('estimates tokens locally without spending API requests', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  expect(await new GroqProvider('test-key').countTokens('context')).toBeGreaterThan(0);
  expect(fetch).not.toHaveBeenCalled();
});

it('does not hide extra retries in the SDK', async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'busy' } }), { status: 503 }));
  vi.stubGlobal('fetch', fetch);
  await expect(new GroqProvider('test-key').diagnose('ctx')).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('redacts Groq keys even when they are not from the current environment', () => {
  const key = `gsk_${'a'.repeat(52)}`;
  expect(redact(`log ${key}`, [])).not.toContain(key);
});
