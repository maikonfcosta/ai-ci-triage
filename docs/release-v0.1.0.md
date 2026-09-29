# ai-ci-triage v0.1.0 (preview)

This preview explains selected Playwright failures in a single PR comment using the report, failure-classifier verdicts, PR diff and nearby source. It reports a likely cause, location, confidence and token usage while leaving the deterministic gate unchanged.

Groq is validated on ten constructed cases and a two-run public demo. The second run updated the existing comment without duplication; the intentionally failing classifier job stayed red. The implementation also includes OpenAI and Gemini clients and fallback tests.

Validation: 62 tests passed in CI; the standalone Node 24 bundle is checked against its source. See the [demo](https://github.com/maikonfcosta/playwright-reference-suite/pull/1#issuecomment-5896070196) and the repository's evaluation reports for evidence.

Limitations: original file score 5/10, 6/10 after title matching, 10/10 after post-hoc patch/source equivalence. The cause review was performed by an assistant, not independently validated by a human. Two additional diagnoses in case 03 missed the root cause. Groq billing cost is unknown; the OpenAI/Gemini comparison is incomplete. This is a preview, not a production-accuracy claim.

Pin consumers to a reviewed commit. The demo uses `5cf7d486b8861ee677bcedf529accc4050ba246a`. Never merge its injected assertion failure.
