# Evaluation cases

Written before any run. Each case is one branch `eval/NN-slug` on playwright-reference-suite with a single commit, made from `eval/cases/NN-slug.patch` by `eval/make-branches.sh`.
Product bugs are patches to the Conduit source, applied in the Docker build, so the bug shows up in the diff.
A case scores a **file hit** when the diagnosis for the named test points at the expected file, and a **cause hit** when its sentence matches the rubric.

## Scoring revision (29/Sep/2026)

The first Groq run exposed title and path representation mismatches. The original metric and `results/SCORES-groq.md` are retained. Subsequent evaluations report three separate file metrics:

1. Original file hit: the original title lookup and exact expected path.
2. Exact file after title matching: accept a shortened title only across a ` > ` group boundary and only when it identifies a unique input test and diagnosis. Duplicate exact diagnoses are not resolved by picking the first.
3. Patch/source equivalent: additionally accept a source path from the embedded `+++ b/` header of the expected patch. No basename or arbitrary suffix matching of paths.

These rules were revised after observing this run; improvements are post-hoc scoring changes, not improvements in model output. Cause correctness is reviewed separately. No claim is made about exact line accuracy.

New inference runs write `SCORES-v2*.md` so the original `SCORES*.md` reports are not overwritten.

Run `npm run eval:score -- groq` to rebuild `results/REVIEW-groq.md` from saved answers without API calls, keys, Git operations or worktrees. Missing answers and provider errors remain in the denominator. This command preserves the original score, prompts and answers.

| # | Kind | Change | Test expected to fail | Expected file | Cause (rubric) |
|---|---|---|---|---|---|
| 01 | Product | API patch: the delete-article handler loses the author check | ownership > another user cannot delete my article | `docker/patches/api/01-delete-without-owner-check.patch` | Names the missing ownership/author check on DELETE, so any signed-in user can delete |
| 02 | Product | API patch: login answers "email not found" for an unknown email | auth contract > wrong password does not reveal whether the email exists | `docker/patches/api/02-login-reveals-email.patch` | Says login now answers differently for unknown email vs wrong password |
| 03 | Product | Web patch: the app reads the JWT from `jwt` but saves it as `jwtToken` | browser starts signed in with the session created by the API | `docker/patches/web/03-rename-jwt-key.patch` | Says the app reads the token from a different storage key than the session the test sets up |
| 04 | Product | API patch: article create skips the first tag (`tagList.slice(1)`) | author publishes an article and sees it rendered | `docker/patches/api/04-drop-tags-on-create.patch` | Says the create handler drops the first tag |
| 05 | Outdated test | Comment box placeholder becomes 'Write your comment...' in the page object | reader comments on an article and the comment survives a reload | `src/pages/article.page.ts` | Says the placeholder locator was changed and no longer matches the page |
| 06 | Outdated test | Publish button locator becomes `{ name: 'Publish', exact: true }` | author publishes an article and sees it rendered | `src/pages/editor.page.ts` | Says the button locator name no longer matches |
| 07 | Outdated test | Email field placeholder becomes 'Email address' in the page object | sign up and sign in > existing user signs in | `src/pages/auth.page.ts` | Says the field locator no longer matches |
| 08 | Test logic | The article factory spreads the overrides before the defaults, so every override is lost | author publishes an article and sees it rendered | `src/data/factory.ts` | Says the defaults overwrite the overrides (spread order) |
| 09 | Test logic | Assertion compares the heading with the article body instead of the title | author publishes an article and sees it rendered | `tests/e2e/publish-article.spec.ts` | Says the assertion uses the wrong field |
| 10 | CI/config | `expect: { timeout: 1 }` added to the Playwright config | several; scored on the first failure | `playwright.config.ts` | Points at the timeout change in the config, not at the product |

Case 10 replaces the "Environment/CI" row of the spec: a workflow change that takes the app down is an outage, and outages are skipped on purpose (failure-classifier already explains them). A config change that breaks tests on a healthy app is the CI case this tool can actually see.

The first version of case 10 used `timeout: 100`. It broke nothing: one test failed once and passed on retry, and a flaky test is not sent to the model. It was changed to `timeout: 1` before any model call.
