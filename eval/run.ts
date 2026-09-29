// Runs the evaluation: for each case, the CI artifacts of its branch on playwright-reference-suite,
// the branch diff and a checkout of the branch, through the same context builder the action uses.
//
//   npm run eval -- ../playwright-reference-suite            dry run: prompts, tokens, estimated cost
//   npm run eval -- ../playwright-reference-suite --run      calls both providers, writes eval/results/
//   add --only groq (or gemini, openai) to evaluate a single provider
//
// Keys come from the environment or the git-ignored .env loaded by npm run eval.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildContext } from '../src/context';
import { selectFailures, type Failure } from '../src/failures';
import { scoreDiagnosis } from './scoring';
import { DEFAULT_MODELS, GeminiProvider, GroqProvider, inputCost, OpenAIProvider, type Answer, type Provider } from '../src/providers';
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

// A key with a control character (a paste that did not paste) makes the SDK report "Connection error." instead of 401.
function checkKey(name: string, key: string | undefined): void {
  if (key === undefined) return;
  if (!/^[\x21-\x7e]{20,}$/.test(key)) throw new Error(`${name} does not look like an API key (${key.length} characters, or has spaces/control characters)`);
}

function providers(only?: string): Record<string, Provider> {
  const { OPENAI_API_KEY: rawO, GEMINI_API_KEY: rawG, GROQ_API_KEY: rawQ } = process.env;
  const o = (!only || only === 'openai') ? rawO?.trim() || undefined : undefined;
  const g = (!only || only === 'gemini') ? rawG?.trim() || undefined : undefined;
  const q = (!only || only === 'groq') ? rawQ?.trim() || undefined : undefined;
  checkKey('OPENAI_API_KEY', o);
  checkKey('GEMINI_API_KEY', g);
  checkKey('GROQ_API_KEY', q);
  return {
    openai: o ? new OpenAIProvider(o) : estimator('openai', DEFAULT_MODELS.openai),
    // The harness paces and retries itself; SDK retries would spend quota without waiting for it.
    gemini: g ? new GeminiProvider(g, undefined, { attempts: 1 }) : estimator('gemini', DEFAULT_MODELS.gemini),
    groq: q ? new GroqProvider(q) : estimator('groq', DEFAULT_MODELS.groq),
  };
}

// The free tier of the Gemini API allows 5 requests per minute per model, and a busy model answers 503.
const GAP_MS = 13_000;
let lastCall = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function paced(call: () => Promise<Answer>, label: string, gap = GAP_MS): Promise<Answer | { error: string }> {
  for (let attempt = 1; ; attempt++) {
    await sleep(Math.max(0, lastCall + gap - Date.now()));
    lastCall = Date.now();
    try {
      return await call();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // A daily quota does not come back in a minute: stop instead of burning more requests.
      if (/PerDay/.test(message)) throw new Error(`${label}: daily quota exhausted, stopping. Answers saved so far are kept.`);
      const busy = /\b(429|503)\b|RESOURCE_EXHAUSTED|UNAVAILABLE/.test(message);
      if (!busy || attempt === 4) return { error: message };
      // Use the delay the API asks for when it gives one.
      const wait = Number(/retry in ([\d.]+)s/.exec(message)?.[1] ?? 30) * 1000 + 1000;
      console.error(`${label}: ${message.match(/"code":\s*(\d+)/)?.[1] ?? 'busy'}, waiting ${Math.round(wait / 1000)}s (attempt ${attempt}/4)`);
      await sleep(wait);
    }
  }
}

async function main() {
  const [suiteArg, ...flags] = process.argv.slice(2);
  if (!suiteArg) throw new Error('usage: npm run eval -- <path to playwright-reference-suite> [--run]');
  const suite = resolve(suiteArg);
  const real = flags.includes('--run');
  // --only gemini: evaluate one provider, e.g. when the other one's key is not usable.
  const only = flags.includes('--only') ? flags[flags.indexOf('--only') + 1] : undefined;
  const models = Object.fromEntries(Object.entries(providers(only)).filter(([name]) => !only || name === only));
  if (only && Object.keys(models).length === 0) throw new Error(`--only ${only}: no such provider`);
  if (only === 'groq' && real && !process.env.GROQ_API_KEY?.trim()) throw new Error('GROQ_API_KEY is required for --run --only groq');
  if ('groq' in models) console.log('Groq: input tokens are a local estimate; billing cost is unknown (free-tier use has no API charge).');
  sh('git', ['fetch', '-q', 'origin'], suite);

  const rows: string[] = [];
  let total = 0;
  let unknownCost = false;
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
        const estimate = inputCost(provider.model, context.tokens);
        if (!real) { total += estimate ?? 0; unknownCost ||= estimate === null; }
        writeFileSync(join(results, c.name, `prompt-${name}.txt`), context.text);

        if (!real) {
          rows.push(`| ${c.id} | ${provider.name} | ${failures.length} | ${context.tokens}${name === 'groq' ? ' (estimated)' : ''} | ${estimate === null ? 'unknown' : `$${estimate.toFixed(4)}`} | ${context.dropped.length} |`);
          continue;
        }
        const file = join(results, c.name, `answer-${name}.json`);
        const saved = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')).answer as Answer | { error: string }) : undefined;
        // A case already answered is not paid for again; a saved error is retried.
        const answer = saved && !('error' in saved) ? saved : await paced(() => provider.diagnose(context.text), `${c.id} ${name}`, name === 'groq' ? 65_000 : GAP_MS);
        writeFileSync(file, JSON.stringify({ tests, dropped: context.dropped, answer }, null, 1));
        if ('error' in answer) {
          rows.push(`| ${c.id} | ${name} | error | | | | | ${answer.error.replace(/\|/g, '\\|')} |`);
          continue;
        }
        const title = c.test.startsWith('several') ? tests[0] : c.test;
        const score = scoreDiagnosis(answer.diagnoses, title, tests, c.file, readFileSync(join(here, 'cases', `${c.name}.patch`), 'utf8'));
        const d = score.diagnosis;
        const hit = score.originalHit ? 'yes' : 'no';
        const cost = answer.costUsd ?? 0;
        unknownCost ||= answer.costUsd === null;
        total += cost;
        rows.push(`| ${c.id} | ${name} | ${hit} | ${score.exactFileHit} | ${score.equivalentFileHit} | \`${d?.file ?? '-'}:${d?.line ?? ''}\` | ${answer.costUsd === null ? 'unknown' : `$${cost.toFixed(4)}`} | ${(d?.cause ?? 'no diagnosis for the scored test').replace(/\|/g, '\\|')} |`);
        console.log(`${c.id} ${name}: saved, file hit ${hit}`);
      }
    } finally {
      sh('git', ['worktree', 'remove', '--force', worktree], suite);
    }
  }

  const header = real
    ? ['| Case | Provider | Original file hit | Exact file after title matching | Patch/source equivalent | Pointed at | Cost | Cause (requires review against CASES.md) |', '|---|---|---|---|---|---|---|---|']
    : ['| Case | Provider | Failures | Input tokens | Input cost | Parts dropped |', '|---|---|---|---|---|---|'];
  const report = [...header, ...rows, '', `${real ? 'Total cost' : 'Estimated input cost'}: ${unknownCost ? 'unknown (one or more prices unavailable)' : `$${total.toFixed(4)}`}`].join('\n');
  const reportName = real ? 'SCORES-v2' : 'DRY-RUN';
  writeFileSync(join(results, `${reportName}${only === 'groq' ? '-groq' : ''}.md`), `${report}\n`);
  console.log(report);
}

main().catch((err) => {
  const cause = err instanceof Error && err.cause instanceof Error ? ` (cause: ${err.cause.message})` : '';
  console.error(`${err instanceof Error ? err.message : err}${cause}`);
  process.exit(1);
});
