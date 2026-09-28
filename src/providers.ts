// Two thin clients over the same prompt and schema, plus the fallback between them.
// Neither client decides anything: they return diagnoses or throw.

import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { DIAGNOSES_SCHEMA, INSTRUCTIONS, parseDiagnoses, SCHEMA_NAME, type Diagnosis } from './prompt';

export type Usage = { inputTokens: number; cachedTokens: number; cacheWriteTokens: number; outputTokens: number };
export type Answer = { provider: string; model: string; diagnoses: Diagnosis[]; usage: Usage; costUsd: number | null };

export interface Provider {
  readonly name: string;
  readonly model: string;
  countTokens(context: string): Promise<number>;
  diagnose(context: string): Promise<Answer>;
}

// USD per 1M tokens, from the providers' pricing pages on 28/Sep/2026.
// gemini-3.8-flash is at an introductory price until 31/Dec/2026; it doubles on 1/Jan/2027.
const PRICES: Record<string, { input: number; cached: number; cacheWrite: number; output: number }> = {
  'gpt-6-sol': { input: 2, cached: 0.2, cacheWrite: 2.5, output: 10 },
  'gemini-3.8-flash': { input: 0.75, cached: 0.075, cacheWrite: 0.75, output: 3.75 },
};

/** Null when the model is not in the table: an unknown price is reported as unknown, never as zero. */
export function cost(model: string, u: Usage): number | null {
  const p = PRICES[model];
  if (!p) return null;
  const uncached = u.inputTokens - u.cachedTokens - u.cacheWriteTokens;
  return (uncached * p.input + u.cachedTokens * p.cached + u.cacheWriteTokens * p.cacheWrite + u.outputTokens * p.output) / 1e6;
}

/** Dry runs only know the input side; output cost is known after a real answer. */
export function inputCost(model: string, inputTokens: number): number | null {
  const p = PRICES[model];
  return p ? (inputTokens * p.input) / 1e6 : null;
}

export const DEFAULT_MODELS = { openai: 'gpt-6-sol', gemini: 'gemini-3.8-flash' } as const;
const TIMEOUT_MS = 120_000;

export class OpenAIProvider implements Provider {
  readonly name = 'openai';
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    readonly model: string = DEFAULT_MODELS.openai,
  ) {
    this.client = new OpenAI({ apiKey, timeout: TIMEOUT_MS, maxRetries: 2 });
  }

  private format() {
    return { format: { type: 'json_schema' as const, name: SCHEMA_NAME, strict: true, schema: { ...DIAGNOSES_SCHEMA } } };
  }

  async countTokens(context: string): Promise<number> {
    const res = await this.client.responses.inputTokens.count({
      model: this.model,
      instructions: INSTRUCTIONS,
      input: context,
      text: this.format(),
    });
    return res.input_tokens;
  }

  async diagnose(context: string): Promise<Answer> {
    const res = await this.client.responses.create({
      model: this.model,
      instructions: INSTRUCTIONS,
      input: context,
      text: this.format(),
    });
    for (const item of res.output) {
      if (item.type !== 'message') continue;
      for (const part of item.content) {
        if (part.type === 'refusal') throw new Error(`openai refused: ${part.refusal}`);
      }
    }
    if (res.status !== 'completed') throw new Error(`openai response ${res.status}: ${res.incomplete_details?.reason ?? 'no reason given'}`);
    const usage: Usage = {
      inputTokens: res.usage?.input_tokens ?? 0,
      cachedTokens: res.usage?.input_tokens_details.cached_tokens ?? 0,
      cacheWriteTokens: res.usage?.input_tokens_details.cache_write_tokens ?? 0,
      outputTokens: res.usage?.output_tokens ?? 0,
    };
    return { provider: this.name, model: this.model, diagnoses: parseDiagnoses(res.output_text), usage, costUsd: cost(this.model, usage) };
  }
}

export class GeminiProvider implements Provider {
  readonly name = 'gemini';
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    readonly model: string = DEFAULT_MODELS.gemini,
  ) {
    this.client = new GoogleGenAI({ apiKey, httpOptions: { timeout: TIMEOUT_MS, retryOptions: { attempts: 3 } } });
  }

  async countTokens(context: string): Promise<number> {
    const res = await this.client.models.countTokens({
      model: this.model,
      contents: context,
      config: { systemInstruction: INSTRUCTIONS },
    });
    return res.totalTokens ?? 0;
  }

  async diagnose(context: string): Promise<Answer> {
    const res = await this.client.models.generateContent({
      model: this.model,
      contents: context,
      config: {
        systemInstruction: INSTRUCTIONS,
        responseMimeType: 'application/json',
        responseJsonSchema: DIAGNOSES_SCHEMA,
      },
    });
    const blocked = res.promptFeedback?.blockReason;
    if (blocked) throw new Error(`gemini blocked the prompt: ${blocked}`);
    const finish = res.candidates?.[0]?.finishReason;
    if (finish !== 'STOP') throw new Error(`gemini stopped with ${finish ?? 'no candidate'}`);
    const m = res.usageMetadata;
    const usage: Usage = {
      inputTokens: m?.promptTokenCount ?? 0,
      cachedTokens: m?.cachedContentTokenCount ?? 0,
      cacheWriteTokens: 0,
      outputTokens: (m?.candidatesTokenCount ?? 0) + (m?.thoughtsTokenCount ?? 0),
    };
    return { provider: this.name, model: this.model, diagnoses: parseDiagnoses(res.text ?? ''), usage, costUsd: cost(this.model, usage) };
  }
}

export type Result = Answer & { fallbackReason?: string };

/** The fallback answers only when the primary could not: error, timeout, refusal or an answer off the schema. */
export async function diagnoseWithFallback(context: string, primary: Provider, fallback?: Provider): Promise<Result> {
  try {
    return await primary.diagnose(context);
  } catch (err) {
    if (!fallback) throw err;
    const reason = `${primary.name} failed: ${err instanceof Error ? err.message : String(err)}`;
    return { ...(await fallback.diagnose(context)), fallbackReason: reason };
  }
}
