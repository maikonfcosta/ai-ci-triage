// Gathers what the model reads, by plain code: errors, source around the failing lines, and the PR diff.
// When it does not fit the token budget, the least useful parts go first and the drop is reported.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Failure, Frame } from './failures';
import { redact } from './redact';

const WINDOW = 20; // lines of source on each side of a frame

// Lower number = more useful. Priority 0 is never dropped.
// A changed line in a failing file usually is the cause, so it outranks the source around the failure.
enum Priority {
  Error = 0,
  DiffNearFailure = 1,
  FailingSource = 2,
  OtherSource = 3,
  OtherDiff = 4,
}

type Piece = { kind: 'error' | 'source' | 'diff'; priority: Priority; label: string; text: string };

export type Context = { text: string; tokens: number; dropped: string[] };
export type CountTokens = (text: string) => Promise<number>;

export type ContextInput = {
  failures: Failure[];
  diff: string;
  repoRoot: string;
  secrets: string[];
  maxTokens: number;
  countTokens: CountTokens;
};

export async function buildContext(input: ContextInput): Promise<Context> {
  const pieces = collect(input);
  let kept = pieces;
  const dropped: string[] = [];

  // Counting is an API call, so estimate per piece from one real count and recount only after dropping.
  for (let attempt = 0; attempt < 5; attempt++) {
    const text = redact(render(kept), input.secrets);
    const tokens = await input.countTokens(text);
    if (tokens <= input.maxTokens) return { text, tokens, dropped };

    const perChar = tokens / text.length;
    let estimate = tokens;
    const order = kept.filter((p) => p.priority !== Priority.Error).sort((a, b) => b.priority - a.priority);
    for (const piece of order) {
      if (estimate <= input.maxTokens * 0.95) break;
      kept = kept.filter((p) => p !== piece);
      dropped.push(piece.label);
      estimate -= piece.text.length * perChar;
    }
    if (order.length === 0) {
      throw new Error(`the errors alone take ${tokens} tokens, over the ${input.maxTokens} limit`);
    }
  }
  throw new Error(`context still over ${input.maxTokens} tokens after dropping ${dropped.length} parts`);
}

function collect({ failures, diff, repoRoot }: ContextInput): Piece[] {
  const pieces: Piece[] = [];
  const touched = new Set<string>();
  const seen = new Set<string>();

  failures.forEach((failure, i) => {
    pieces.push({
      kind: 'error',
      priority: Priority.Error,
      label: `error ${i + 1}`,
      text: `<error test="${failure.test}" project="${failure.project}" location="${failure.location}" classifier="${failure.category}, ${failure.confidence}: ${failure.reason}">\n${failure.message}\n</error>`,
    });
    const frames = failure.frames.map((f) => ({ ...f, file: toRepoPath(f, repoRoot) })).filter((f) => f.file !== null);
    frames.forEach((frame, depth) => {
      const file = frame.file as string;
      touched.add(file);
      const key = `${file}:${frame.line}`;
      if (seen.has(key)) return;
      seen.add(key);
      const source = window(repoRoot, file, frame.line);
      if (source === null) return;
      pieces.push({
        kind: 'source',
        priority: depth === 0 ? Priority.FailingSource : Priority.OtherSource,
        label: `source ${key}`,
        text: `<source file="${file}" around="${frame.line}">\n${source}\n</source>`,
      });
    });
  });

  for (const hunk of diffHunks(diff)) {
    pieces.push({
      kind: 'diff',
      priority: touched.has(hunk.file) ? Priority.DiffNearFailure : Priority.OtherDiff,
      label: `diff ${hunk.file} ${hunk.header}`,
      text: `<diff file="${hunk.file}">\n${hunk.text}\n</diff>`,
    });
  }
  return pieces;
}

// Keeps the reading order stable (errors, source, diff) whatever was dropped.
function render(pieces: Piece[]): string {
  const rank = { error: 0, source: 1, diff: 2 };
  return [...pieces].sort((a, b) => rank[a.kind] - rank[b.kind]).map((p) => p.text).join('\n\n');
}

/** Frames come as absolute CI paths, or with the `<suite>` root Playwright writes in reports. Outside the repo means library code. */
export function toRepoPath(frame: Frame, repoRoot: string): string | null {
  const root = repoRoot.replace(/\\/g, '/').replace(/\/$/, '');
  let file = frame.file.replace(/\\/g, '/');
  if (file.startsWith('<suite>/')) file = file.slice('<suite>/'.length);
  else if (file.startsWith(`${root}/`)) file = file.slice(root.length + 1);
  else if (file.startsWith('/') || /^[A-Za-z]:\//.test(file)) return null;
  if (file.includes('node_modules/')) return null;
  return file;
}

function window(repoRoot: string, file: string, line: number): string | null {
  const path = join(repoRoot, file);
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, 'utf8').split('\n');
  const start = Math.max(1, line - WINDOW);
  const end = Math.min(lines.length, line + WINDOW);
  const out: string[] = [];
  for (let n = start; n <= end; n++) out.push(`${n === line ? '>' : ' '}${String(n).padStart(5)} | ${lines[n - 1]}`);
  return out.join('\n');
}

export function diffHunks(diff: string): { file: string; header: string; text: string }[] {
  const hunks: { file: string; header: string; text: string }[] = [];
  for (const section of diff.split(/^diff --git /m).slice(1)) {
    const file = /^\+\+\+ b\/(.+)$/m.exec(section)?.[1] ?? /^a\/\S+ b\/(\S+)/.exec(section)?.[1];
    if (!file) continue;
    const parts = section.split(/^(?=@@ )/m).slice(1);
    for (const part of parts) {
      hunks.push({ file, header: part.split('\n')[0].replace(/ @@.*$/, ' @@'), text: part.trimEnd() });
    }
  }
  return hunks;
}
