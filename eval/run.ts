// Runs the evaluation: for each case, the CI artifacts of its branch on playwright-reference-suite,
// the branch diff and a checkout of the branch, through the same context builder the action uses.
//
//   npm run eval -- ../playwright-reference-suite            dry run: prompts, tokens, estimated cost
//   npm run eval -- ../playwright-reference-suite --run      calls both providers, writes eval/results/
//
// Keys come from OPENAI_API_KEY and GEMINI_API_KEY in the shell, never from a file in this repo.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildContext } from '../src/context';
import { selectFailures, type Failure } from '../src/failures';
import type { Diagnosis } from '../src/prompt';
import { DEFAULT_MODELS, GeminiProvider, inputCost, OpenAIProvider, type Answer, type Provider } from '../src/providers';
import { secretValues } from '../src/redact';

const MAX_TOKENS = 30_000;
const CI_ROOT = '/home/runner/work/playwright-reference-suite/playwright-reference-suite';
const here = resolve('eval');
const results = join(here, 'results');

type Case = { id: string; name: string; test: string; file: string };

function cases(): Case[] {
  const names = readdirSync(join(here, 'cases')).filter((f) => f.endsWith('.patch')).map((f) => f.replace(/\.patch$/, ''));
  const rows = readFileSync(join(here, 'CASES.md'), 'utf8').split('\n').filter((l) => /^\| \d\d \|/.test(l));
  return rows.map((row) => {
    const cells = row.split('|').map((c) => c.trim());
    const id = cells[1];
    const name = names.find((n) => n.startsWith(`${id}-`));
    if (!name) throw new Error(`case ${id} has no patch`);
    return { id, name, test: cells[4], file: cells[5].replace(/`/g, '') };
  });
}

function sh(cmd: string, args: string[], cwd?: string): string {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Artifacts of the latest CI run on the case branch. */
function download(c: Case, suite: string): string {
  const dir = join(results, c.name, 'input');
  if (existsSync(join(dir, 'verdicts.json'))) return dir;
  const branch = `eval/${c.name}`;
  const runs = JSON.parse(sh('gh', ['run', 'list', '--workflow', 'ci.yml', '--branch', branch, '-L', '1', '--json', 'databaseId,status'], suite));
  if (!runs.length || runs[0].status !== 'completed') throw new Error(`${branch}: CI run not finished yet`);
  mkdirSync(dir, { recursive: true });
  sh('gh', ['run', 'download', String(runs[0].databaseId), '-n', 'triage-input', '-D', dir], suite);
  writeFileSync(join(dir, 'run-id'), String(runs[0].databaseId));
  return dir;
}

/** The action runs in the CI checkout; here the same files come from a local worktree of the branch. */
function localize(failures: Failure[], worktree: string): Failure[] {
  const root = worktree.replace(/\\/g, '/');
  return failures.map((f) => ({ ...f, frames: f.frames.map((fr) => ({ ...fr, file: fr.file.replace(CI_ROOT, root) })) }));
}

// Without a key, a dry run still works on a 4-characters-per-token estimate, labeled as such.
function estimator(name: string, model: string): Provider {
  return {
    name: `${name} (estimated, no key)`,
    model,
    countTokens: async (t) => Math.ceil(t.length / 4),
    diagnose: async () => {
      throw new Error(`${name}: no API key in the environment`);
    },
  };
}

function providers(): Record<string, Provider> {
  const { OPENAI_API_KEY: o, GEMINI_API_KEY: g } = process.env;
  return {
    openai: o ? new OpenAIProvider(o) : estimator('openai', DEFAULT_MODELS.openai),
    gemini: g ? new GeminiProvider(g) : estimator('gemini', DEFAULT_MODELS.gemini),
  };
}

function pick(diagnoses: Diagnosis[], c: Case, failures: Failure[]): Diagnosis | undefined {
  // Case 10 breaks several tests; it is scored on the first failure, as CASES.md says.
  const title = c.test.startsWith('several') ? failures[0]?.test : c.test;
  return diagnoses.find((d) => d.test === title) ?? diagnoses.find((d) => title && d.test.endsWith(title));
}

async function main() {
  const [suiteArg, flag] = process.argv.slice(2);
  if (!suiteArg) throw new Error('usage: npm run eval -- <path to playwright-reference-suite> [--run]');
  const suite = resolve(suiteArg);
  const real = flag === '--run';
  const models = providers();
  sh('git', ['fetch', '-q', 'origin'], suite);

  const rows: string[] = [];
  let total = 0;
  for (const c of cases()) {
    const input = download(c, suite);
    const worktree = join(results, c.name, 'checkout');
    rmSync(worktree, { recursive: true, force: true });
    sh('git', ['-c', 'core.autocrlf=false', 'worktree', 'add', '-q', '--detach', worktree, `origin/eval/${c.name}`], suite);
    try {
      const failures = localize(selectFailures(join(input, 'results.json'), join(input, 'verdicts.json')), worktree);
      const diff = sh('git', ['diff', `origin/main...origin/eval/${c.name}`], suite);
      const tests = failures.map((f) => f.test);

      for (const [name, provider] of Object.entries(models)) {
        const context = await buildContext({
          failures,
          diff,
          repoRoot: worktree,
          secrets: secretValues(process.env),
          maxTokens: MAX_TOKENS,
          countTokens: (t) => provider.countTokens(t),
        });
        const estimate = inputCost(provider.model, context.tokens) ?? 0;
        if (!real) total += estimate;
        writeFileSync(join(results, c.name, `prompt-${name}.txt`), context.text);

        if (!real) {
          rows.push(`| ${c.id} | ${provider.name} | ${failures.length} | ${context.tokens} | $${estimate.toFixed(4)} | ${context.dropped.length} |`);
          continue;
        }
        let answer: Answer | { error: string };
        try {
          answer = await provider.diagnose(context.text);
        } catch (err) {
          answer = { error: err instanceof Error ? err.message : String(err) };
        }
        writeFileSync(join(results, c.name, `answer-${name}.json`), JSON.stringify({ tests, dropped: context.dropped, answer }, null, 1));
        if ('error' in answer) {
          rows.push(`| ${c.id} | ${name} | error | | | ${answer.error.replace(/\|/g, '\\|')} |`);
          continue;
        }
        const d = pick(answer.diagnoses, c, failures);
        const hit = d?.file === c.file ? 'yes' : 'no';
        const cost = answer.costUsd ?? 0;
        total += cost;
        rows.push(`| ${c.id} | ${name} | ${hit} | \`${d?.file ?? '-'}:${d?.line ?? ''}\` | $${cost.toFixed(4)} | ${(d?.cause ?? 'no diagnosis for the scored test').replace(/\|/g, '\\|')} |`);
      }
    } finally {
      sh('git', ['worktree', 'remove', '--force', worktree], suite);
    }
  }

  const header = real
    ? ['| Case | Provider | File hit | Pointed at | Cost | Cause (scored by hand against CASES.md) |', '|---|---|---|---|---|---|']
    : ['| Case | Provider | Failures | Input tokens | Input cost | Parts dropped |', '|---|---|---|---|---|---|'];
  const report = [...header, ...rows, '', `${real ? 'Total cost' : 'Estimated input cost'}: $${total.toFixed(4)}`].join('\n');
  writeFileSync(join(results, real ? 'SCORES.md' : 'DRY-RUN.md'), `${report}\n`);
  console.log(report);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
