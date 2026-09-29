This draft deliberately compares the article heading with its body instead of its title. It exercises AI CI triage against a known assertion failure while failure-classifier remains responsible for the gate. Do not merge the injected failure.

The workflow pins ai-ci-triage to `5cf7d486b8861ee677bcedf529accc4050ba246a`, uses Groq only on same-repository PRs and uploads the diagnosis JSON. Local lint, typecheck and YAML parsing passed. Remote acceptance is pending: verify a diagnosis comment and Job Summary, then re-run and confirm the same comment ID is updated without duplication.
