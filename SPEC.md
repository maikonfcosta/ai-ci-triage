# Spec

## Goal

Explain selected Playwright failures with Groq using the error, PR diff and nearby source. Publish one advisory comment per PR. The deterministic failure-classifier gate keeps control of the job outcome.

## Scope decision (29/Sep/2026)

Maikon requested Groq as the only model API. OpenAI/Gemini clients, keys as inputs, SDKs, provider fallback and their comparison requirement are removed from the current scope. Published v0.1.0 and stored historical evidence describe that earlier implementation; they are not rewritten. The `openai/` prefix in `openai/gpt-oss-120b` is Groq's model identifier, not an OpenAI API connection.

## Inputs and output

- Inputs: Playwright JSON report, failure-classifier verdicts, PR diff and source around stack frames.
- Select product/unknown failures and low-confidence test failures; skip environment outages and flaky results.
- Output: structured diagnoses with test, cause, file, line, confidence and next check; one PR comment updated on rerun, Job Summary and JSON result.
- Run on same-repository pull_request events. Do not use pull_request_target.

## Groq client

- Native Node 24 fetch to https://api.groq.com/openai/v1/chat/completions.
- Default model: `openai/gpt-oss-120b`; strict JSON Schema shared with the parser.
- Only `groq-api-key` / `GROQ_API_KEY` is used. No other provider is contacted on failure.
- Request timeout 120 seconds; no hidden client retries. Evaluation owns retry pacing (65 seconds between attempts).
- Count input tokens locally using the instructions, schema and context. This is an estimate, not a tokenizer measurement. Store actual response usage when available.
- Billing cost is unknown, never inferred as zero from a free-tier assumption. HTTP errors expose status and retry timing, not response bodies that could repeat credentials.
- Before sending, redact known credential patterns and current secret environment values. Keep legacy secret patterns: logs may contain credentials unrelated to the inference provider.
- No agent loop, model tools, auto-fix, merge approval or model-controlled gate.

## Evaluation

Ten constructed cases from playwright-reference-suite, specified before inference in eval/CASES.md. Preserve original score, title-matched exact-file score and patch/source-equivalent score separately. Equivalence was introduced post-hoc; do not claim it improved model output. Cause matching needs independent human review; a ten-case constructed dataset is not a production benchmark.

`npm run eval -- ../playwright-reference-suite --run` uses Groq only. `--only groq` remains accepted for existing commands; other providers are rejected before Git/network work. `npm run eval:score -- groq` rebuilds the saved-answer review offline. Saved answers and prompts are evidence, not freshly generated results.

## Delivery and CI

TypeScript, Node 24, GitHub Action bundled in dist/index.mjs. Only the GitHub SDK remains a runtime package; Groq uses the native HTTP client. Run lint, typecheck, build consistency and Vitest tests in CI with no API keys. Tests execute the bundle outside the project with network stubs. Consumers pin reviewed commits.

## Done when

- A real PR run creates then updates the same comment without duplication (v0.1.0 evidence exists).
- Redaction and missing-key/provider-error paths are tested without failing the advisory job.
- Current Groq-only bundle matches source, tests pass and a new remote demo validates the refactor before claiming remote acceptance for this version.
- Evaluation reports expose denominators and limitations. Independent human cause review remains pending.

## References

- https://console.groq.com/docs/api-reference
- https://console.groq.com/docs/structured-outputs
- https://console.groq.com/docs/rate-limits
