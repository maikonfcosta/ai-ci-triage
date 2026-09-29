# Groq-only remote demo

- Run: https://github.com/maikonfcosta/playwright-reference-suite/actions/runs/36621159222
- P1 head: `8d58618a45125e0451c77021c21d3a29f7b4ecfb` on `demo/ai-ci-triage`.
- Action SHA confirmed in the run log: `9705cd79a826b265c04fe1967c2d177340c551b6`.
- Action CI: https://github.com/maikonfcosta/ai-ci-triage/actions/runs/36620895379 (success; 56 tests).
- Playwright: 16 passed, 1 intentionally failed, 0 flaky, 0 skipped; 18.6 seconds. Health probe: healthy.
- Static job succeeded. `Classify failures` failed; `Explain failures (advisory only)` and `Save triage result` succeeded. The critical job and overall run remained failed.
- Diagnosis: the test compares the article heading with `draft.body` instead of `draft.title`, in `tests/e2e/publish-article.spec.ts:14`.
- Saved artifact: `ai-ci-triage-result`, artifact ID `11058855402`; its unmodified `ai-ci-triage.json` is beside this document.
- Provider/model: Groq / `openai/gpt-oss-120b`; 1,745 input tokens, 429 output tokens, zero cached tokens. Billing cost is unknown (`costUsd: null`).
- Log records `comment updated` at 2026-09-29 19:44:11 UTC (16:44:11 GMT-3).
- Comments API returned exactly one comment containing `<!-- ai-ci-triage -->`: ID `5896070196`, updated at 2026-09-29 19:44:11 UTC.
- Comment: https://github.com/maikonfcosta/playwright-reference-suite/pull/1#issuecomment-5896070196

This run validates diagnosis and update of an existing comment with the Groq-only implementation. Comment creation was validated by the historical v0.1.0 demo; this is not a new two-run creation/update experiment. The deliberately failing demo PR must not be merged. Independent human review of the ten evaluation causes remains pending.

Read-only verification commands:

```powershell
gh run view 36621159222 --repo maikonfcosta/playwright-reference-suite
gh run view 36621159222 --repo maikonfcosta/playwright-reference-suite --log
gh api repos/maikonfcosta/playwright-reference-suite/issues/1/comments
```
