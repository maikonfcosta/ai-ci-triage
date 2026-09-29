# Offline evaluation review: groq

Scoring rules revised after inspecting this run. This is a post-hoc review, not a new model run or a replacement for the original score.
Cause correctness requires separate review against CASES.md. File hits do not validate line numbers or additional diagnoses.

| Case | Original hit | Exact file after title matching | Patch/source equivalent | Title match | Pointed at | Diagnosis |
|---|---|---|---|---|---|---|
| 01 | false | false | true | shortened | server/routes/api/articles/[slug]/index.delete.ts:22 | A recent patch removed the ownership check in the article delete handler, so deletion no longer returns 403 for non‑owners and succeeds with 204 |
| 02 | false | false | true | shortened | server/routes/api/users/login.post.ts:22 | A new check was added to the login handler that throws a 404 with an "email not found" error when the user is not found, causing the unknown‑email response to differ from the wrong‑password response expected by the test. |
| 03 | false | false | true | exact | src/app/core/auth/services/jwt.service.ts:5 | Renaming the JWT storage key from 'jwtToken' to 'jwt' broke token retrieval, so the session isn’t established and the "New Article" link is missing. |
| 04 | false | false | true | exact | server/routes/api/articles/index.post.ts:25 | The recent change in the article‑creation API slices the tag list, dropping the first tag, so only one tag is stored and rendered. |
| 05 | true | true | true | exact | src/pages/article.page.ts:12 | The placeholder text used to locate the comment box was changed in ArticlePage constructor, so the selector no longer matches the actual UI element, causing waitForResponse and fill to timeout. |
| 06 | true | true | true | exact | src/pages/editor.page.ts:38 | The selector in EditorPage.publish was changed to look for a button named 'Publish' (exact true) while the UI still uses 'Publish Article', causing the click and waitForResponse to time out. |
| 07 | false | true | true | shortened | src/pages/auth.page.ts:11 | The email field locator looks for a placeholder text 'Email address' but the page likely still renders 'Email', causing the locator to never be found and the fill operation to time out. |
| 08 | true | true | true | exact | src/data/factory.ts:14 | The recent change in src/data/factory.ts moved the spread of overrides before the default fields, causing the provided body override (with '**bold**') to be overwritten by the default body, so the rendered article lacks the expected <strong> element. |
| 09 | true | true | true | exact | tests/e2e/publish-article.spec.ts:14 | The test was changed to expect the article heading to match draft.body instead of the article title, causing a mismatch with the rendered heading. |
| 10 | true | true | true | exact | playwright.config.ts:10 | The global expect timeout was set to 1 ms, causing the toHaveURL assertion to time out before the navigation completes. |

Answered cases: 10/10.
Original file hits: 5/10.
Exact file hits after title matching: 6/10.
Patch/source equivalent hits: 10/10.

Missing answers and provider errors remain visible in the denominator. No API calls were made.
