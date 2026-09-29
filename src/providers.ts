// Groq-only client. The model diagnoses failures; it never controls the gate.
import { DIAGNOSES_SCHEMA, INSTRUCTIONS, parseDiagnoses, SCHEMA_NAME, type Diagnosis } from './prompt';

export type Usage = { inputTokens: number; cachedTokens: number; cacheWriteTokens: number; outputTokens: number };
export type Answer = { provider: string; model: string; diagnoses: Diagnosis[]; usage: Usage; costUsd: number | null };

export interface Provider {
  readonly name: string;
  readonly model: string;
  countTokens(context: string): Promise<number>;
  diagnose(context: string): Promise<Answer>;
}

export const DEFAULT_MODELS = { groq: 'openai/gpt-oss-120b' } as const;
const TIMEOUT_MS = 120_000;

export function estimateTokens(context: string): number {
  return Math.ceil(Buffer.byteLength(INSTRUCTIONS + context + JSON.stringify(DIAGNOSES_SCHEMA), 'utf8') / 3) + 32;
}

type Completion = {
  choices?: { message: { content?: string | null; refusal?: string | null }; finish_reason: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
};

export class GroqProvider implements Provider {
  readonly name = 'groq';
  constructor(private readonly apiKey: string, readonly model: string = DEFAULT_MODELS.groq) {}

  async countTokens(context: string): Promise<number> {
    return estimateTokens(context);
  }

  async diagnose(context: string): Promise<Answer> {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'system', content: INSTRUCTIONS }, { role: 'user', content: context }],
        response_format: { type: 'json_schema', json_schema: { name: SCHEMA_NAME, strict: true, schema: DIAGNOSES_SCHEMA } },
        max_completion_tokens: 2048,
      }),
    });
    if (!response.ok) {
      // Do not echo error bodies: a provider may repeat submitted content or credentials.
      const retry = response.headers.get('retry-after');
      const delay = retry && /^\d+(?:\.\d+)?$/.test(retry) ? `; retry in ${retry}s` : '';
      throw new Error(`groq HTTP ${response.status}${delay}`);
    }
    const res = await response.json() as Completion;
    const choice = res.choices?.[0];
    if (choice?.message.refusal) throw new Error('groq refused the diagnosis');
    if (choice?.finish_reason !== 'stop') throw new Error(`groq stopped with ${choice?.finish_reason ?? 'no candidate'}`);
    const usage: Usage = {
      inputTokens: res.usage?.prompt_tokens ?? 0,
      cachedTokens: res.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      cacheWriteTokens: 0,
      outputTokens: res.usage?.completion_tokens ?? 0,
    };
    return { provider: this.name, model: this.model, diagnoses: parseDiagnoses(choice.message.content ?? ''), usage, costUsd: null };
  }
}
