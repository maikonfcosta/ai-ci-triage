| Case | Provider | File hit | Pointed at | Cost | Cause (scored by hand against CASES.md) |
|---|---|---|---|---|---|
| 01 | groq | no | `-:` | unknown | no diagnosis for the scored test |
| 02 | groq | no | `-:` | unknown | no diagnosis for the scored test |
| 03 | groq | no | `src/app/core/auth/services/jwt.service.ts:5` | unknown | Renaming the JWT storage key from 'jwtToken' to 'jwt' broke token retrieval, so the session isn’t established and the "New Article" link is missing. |
| 04 | groq | no | `server/routes/api/articles/index.post.ts:25` | unknown | The recent change in the article‑creation API slices the tag list, dropping the first tag, so only one tag is stored and rendered. |
| 05 | groq | yes | `src/pages/article.page.ts:12` | unknown | The placeholder text used to locate the comment box was changed in ArticlePage constructor, so the selector no longer matches the actual UI element, causing waitForResponse and fill to timeout. |
| 06 | groq | yes | `src/pages/editor.page.ts:38` | unknown | The selector in EditorPage.publish was changed to look for a button named 'Publish' (exact true) while the UI still uses 'Publish Article', causing the click and waitForResponse to time out. |
| 07 | groq | no | `-:` | unknown | no diagnosis for the scored test |
| 08 | groq | yes | `src/data/factory.ts:14` | unknown | The recent change in src/data/factory.ts moved the spread of overrides before the default fields, causing the provided body override (with '**bold**') to be overwritten by the default body, so the rendered article lacks the expected <strong> element. |
| 09 | groq | yes | `tests/e2e/publish-article.spec.ts:14` | unknown | The test was changed to expect the article heading to match draft.body instead of the article title, causing a mismatch with the rendered heading. |
| 10 | groq | yes | `playwright.config.ts:10` | unknown | The global expect timeout was set to 1 ms, causing the toHaveURL assertion to time out before the navigation completes. |

Total cost: unknown (one or more prices unavailable)
