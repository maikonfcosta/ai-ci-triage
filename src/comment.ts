// Renders the PR comment from structured data. The model never writes markdown that lands on the PR.

import type { Answer } from './providers';

export const MARKER = '<!-- ai-ci-triage -->';

export type Outcome =
  | { kind: 'diagnosed'; result: Answer; dropped: string[] }
  | { kind: 'nothing'; reason: string }
  | { kind: 'unavailable'; reason: string };

export function renderComment(outcome: Outcome): string {
  const lines = [MARKER, '## AI triage of the failed tests', ''];

  if (outcome.kind === 'nothing') {
    lines.push(`Nothing to diagnose: ${outcome.reason}`);
  } else if (outcome.kind === 'unavailable') {
    lines.push(`No diagnosis this run: ${cell(outcome.reason)}`, '', 'The merge decision is not affected. It stays with the test gate.');
  } else {
    const { result, dropped } = outcome;
    lines.push('Opinion only: the merge decision stays with the test gate.', '');
    lines.push('| Test | Likely cause | Where | Confidence | Check first |', '|---|---|---|---|---|');
    for (const d of result.diagnoses) {
      const where = d.file ? `\`${d.file}${d.line ? `:${d.line}` : ''}\`` : 'not found';
      lines.push(`| ${cell(d.test)} | ${cell(d.cause)} | ${where} | ${d.confidence} | ${cell(d.check_first)} |`);
    }
    const u = result.usage;
    const cost = result.costUsd === null ? 'unknown (billing tier not reported)' : `$${result.costUsd.toFixed(4)}`;
    lines.push('', `<sub>${result.provider} \`${result.model}\` Â· ${u.inputTokens} input tokens (${u.cachedTokens} cached) Â· ${u.outputTokens} output tokens Â· ${cost}</sub>`);
    if (dropped.length) lines.push('', `<sub>Left out to fit the token limit: ${dropped.map(cell).join('; ')}</sub>`);
  }
  return lines.join('\n');
}

// Model text goes into table cells: no pipes, no line breaks, no HTML.
function cell(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
