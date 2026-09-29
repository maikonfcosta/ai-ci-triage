// Action entry point: reads the inputs, wires the real clients and always exits 0.

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Octokit } from '@octokit/rest';
import { selectFailures } from './failures';
import { pullDiff, pullFromEvent, upsertComment } from './github';
import { GroqProvider } from './providers';
import { secretValues } from './redact';
import { triage } from './triage';

// GitHub exposes `with:` inputs as INPUT_<NAME>, upper-cased, hyphens kept.
function input(name: string, fallback = ''): string {
  return (process.env[`INPUT_${name.toUpperCase()}`] ?? '').trim() || fallback;
}

async function main(): Promise<void> {
  const env = process.env;
  const dryRun = input('dry-run', 'false') === 'true';
  const maxTokens = Number(input('max-input-tokens', '30000'));
  const groqKey = input('groq-api-key');

  const target = pullFromEvent(env.GITHUB_EVENT_NAME ?? '', JSON.parse(readFileSync(env.GITHUB_EVENT_PATH ?? '', 'utf8')));
  if ('skip' in target && !dryRun) {
    console.log(`ai-ci-triage skipped: ${target.skip}`);
    return;
  }
  const ref = 'ref' in target ? target.ref : undefined;
  const octokit = new Octokit({ auth: input('github-token') });

  const report = await triage({
    failures: () => selectFailures(input('report'), input('verdicts')),
    diff: async () => (ref ? pullDiff(octokit, ref) : ''),
    repoRoot: env.GITHUB_WORKSPACE ?? process.cwd(),
    secrets: secretValues(env),
    maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 30000,
    provider: groqKey ? new GroqProvider(groqKey, input('groq-model') || undefined) : undefined,
    dryRun,
    publish: async (comment) => {
      if (!ref) throw new Error('no pull request to comment on');
      console.log(`comment ${await upsertComment(octokit, ref, comment)}`);
    },
    log: (line) => console.log(line),
  });

  if (report.comment && env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${report.comment}\n`);
  const out = join(env.RUNNER_TEMP ?? '.', 'ai-ci-triage.json');
  writeFileSync(out, JSON.stringify(report.outcome, null, 1));
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `result=${out}\n`);
}

main().catch((err) => {
  // Design rule 1: this tool never fails the job.
  console.log(`::warning::ai-ci-triage did not run: ${err instanceof Error ? err.message : String(err)}`);
});
