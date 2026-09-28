// The whole run, with every outside dependency passed in. It never throws: whatever goes wrong
// becomes a line in the comment, and the job result stays with the test gate.

import { buildContext, type CountTokens } from './context';
import { renderComment, type Outcome } from './comment';
import type { Failure } from './failures';
import { diagnoseWithFallback, inputCost, type Provider } from './providers';

export type TriageInput = {
  failures: () => Failure[];
  diff: () => Promise<string>;
  repoRoot: string;
  secrets: string[];
  maxTokens: number;
  primary?: Provider;
  fallback?: Provider;
  dryRun: boolean;
  publish: (comment: string) => Promise<void>;
  log: (line: string) => void;
};

export type TriageReport = { outcome: Outcome; comment: string; prompt?: string; published: boolean };

export async function triage(input: TriageInput): Promise<TriageReport> {
  let outcome: Outcome;
  let prompt: string | undefined;
  try {
    const failures = input.failures();
    if (failures.length === 0) {
      outcome = { kind: 'nothing', reason: 'no failure needs a diagnosis (outages and confident test verdicts are skipped)' };
    } else {
      const [primary, fallback] = [input.primary, input.fallback].filter((p): p is Provider => p !== undefined);
      if (!primary && !input.dryRun) {
        outcome = { kind: 'unavailable', reason: 'no model API key is set' };
      } else {
        const context = await buildContext({
          failures,
          diff: await input.diff(),
          repoRoot: input.repoRoot,
          secrets: input.secrets,
          maxTokens: input.maxTokens,
          countTokens: counter(input.log, primary, fallback),
        });
        prompt = context.text;
        if (input.dryRun) {
          const model = primary?.model ?? 'none';
          const estimate = inputCost(model, context.tokens);
          input.log(`dry run: ${failures.length} failures, ${context.tokens} input tokens for ${model}`);
          input.log(`dry run: input cost ${estimate === null ? 'unknown' : `$${estimate.toFixed(4)}`}; output cost is known only after a real call`);
          if (context.dropped.length) input.log(`dry run: left out ${context.dropped.join('; ')}`);
          input.log(`--- prompt ---\n${context.text}\n--- end of prompt ---`);
          return { outcome: { kind: 'nothing', reason: 'dry run' }, comment: '', prompt, published: false };
        }
        const result = await diagnoseWithFallback(context.text, primary as Provider, fallback);
        outcome = { kind: 'diagnosed', result, dropped: context.dropped };
      }
    }
  } catch (err) {
    outcome = { kind: 'unavailable', reason: err instanceof Error ? err.message : String(err) };
  }

  const comment = renderComment(outcome);
  try {
    await input.publish(comment);
    return { outcome, comment, prompt, published: true };
  } catch (err) {
    input.log(`could not publish the comment: ${err instanceof Error ? err.message : String(err)}`);
    return { outcome, comment, prompt, published: false };
  }
}

// Counting is a network call too. If both providers fail to count, a rough estimate keeps the run going.
function counter(log: (line: string) => void, ...providers: (Provider | undefined)[]): CountTokens {
  return async (text) => {
    for (const p of providers) {
      if (!p) continue;
      try {
        return await p.countTokens(text);
      } catch (err) {
        log(`${p.name} could not count tokens: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return Math.ceil(text.length / 4);
  };
}
