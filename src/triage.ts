// The whole run, with every outside dependency passed in. It never throws: whatever goes wrong
// becomes a line in the comment, and the job result stays with the test gate.

import { buildContext } from './context';
import { renderComment, type Outcome } from './comment';
import type { Failure } from './failures';
import { estimateTokens, type Provider } from './providers';

export type TriageInput = {
  failures: () => Failure[];
  diff: () => Promise<string>;
  repoRoot: string;
  secrets: string[];
  maxTokens: number;
  provider?: Provider;
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
      const provider = input.provider;
      if (!provider && !input.dryRun) {
        outcome = { kind: 'unavailable', reason: 'no Groq API key is set' };
      } else {
        const context = await buildContext({
          failures,
          diff: await input.diff(),
          repoRoot: input.repoRoot,
          secrets: input.secrets,
          maxTokens: input.maxTokens,
          countTokens: provider ? (text) => provider.countTokens(text) : async (text) => estimateTokens(text),
        });
        prompt = context.text;
        if (input.dryRun) {
          const model = provider?.model ?? 'none';
          input.log(`dry run: ${failures.length} failures, ${context.tokens} input tokens for ${model}`);
          input.log('dry run: input cost unknown; token counts are local estimates');
          if (context.dropped.length) input.log(`dry run: left out ${context.dropped.join('; ')}`);
          input.log(`--- prompt ---\n${context.text}\n--- end of prompt ---`);
          return { outcome: { kind: 'nothing', reason: 'dry run' }, comment: '', prompt, published: false };
        }
        const result = await (provider as Provider).diagnose(context.text);
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
