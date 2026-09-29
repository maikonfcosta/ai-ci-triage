// Offline scoring only: no SDK, environment file, Git command or network request.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseDiagnoses } from '../src/prompt';
import { scoreDiagnosis } from './scoring';

const provider = process.argv[2];
if (!provider || !['groq', 'gemini', 'openai'].includes(provider)) throw new Error('usage: npm run eval:score -- groq|gemini|openai');
const root = resolve('eval');
const names = readdirSync(join(root, 'cases'));
const cases = readFileSync(join(root, 'CASES.md'), 'utf8').split('\n').filter((l) => /^\| \d\d \|/.test(l));
const lines = [
  `# Offline evaluation review: ${provider}`,
  '',
  'Scoring rules revised after inspecting this run. This is a post-hoc review, not a new model run or a replacement for the original score.',
  'Cause correctness requires separate review against CASES.md. File hits do not validate line numbers or additional diagnoses.',
  '',
  '| Case | Original hit | Exact file after title matching | Patch/source equivalent | Title match | Pointed at | Diagnosis |',
  '|---|---|---|---|---|---|---|',
];
let answered = 0, original = 0, exact = 0, equivalent = 0;
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
for (const row of cases) {
  const cells = row.split('|').map((c) => c.trim());
  const id = cells[1];
  const patchName = names.find((n) => n.startsWith(`${id}-`) && n.endsWith('.patch'));
  if (!patchName) throw new Error(`missing patch for ${id}`);
  const file = join(root, 'results', patchName.slice(0, -6), `answer-${provider}.json`);
  if (!existsSync(file)) {
    lines.push(`| ${id} | n/a | n/a | n/a | no saved answer | | |`);
    continue;
  }
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  if ('error' in saved.answer) {
    lines.push(`| ${id} | n/a | n/a | n/a | provider error | | |`);
    continue;
  }
  const diagnoses = parseDiagnoses(JSON.stringify(saved.answer));
  const tests: string[] = saved.tests;
  const title = cells[4].startsWith('several') ? tests[0] : cells[4];
  const score = scoreDiagnosis(diagnoses, title, tests, cells[5].replace(/`/g, ''), readFileSync(join(root, 'cases', patchName), 'utf8'));
  answered++;
  original += Number(score.originalHit);
  exact += Number(score.exactFileHit);
  equivalent += Number(score.equivalentFileHit);
  const d = score.diagnosis;
  lines.push(`| ${id} | ${score.originalHit} | ${score.exactFileHit} | ${score.equivalentFileHit} | ${score.match} | ${cell(d ? `${d.file}:${d.line}` : '-')} | ${cell(d?.cause ?? 'no unambiguous diagnosis')} |`);
}
lines.push('', `Answered cases: ${answered}/${cases.length}.`, `Original file hits: ${original}/${cases.length}.`, `Exact file hits after title matching: ${exact}/${cases.length}.`, `Patch/source equivalent hits: ${equivalent}/${cases.length}.`, '', 'Missing answers and provider errors remain visible in the denominator. No API calls were made.');
const report = `${lines.join('\n')}\n`;
writeFileSync(join(root, 'results', `REVIEW-${provider}.md`), report);
console.log(report);
