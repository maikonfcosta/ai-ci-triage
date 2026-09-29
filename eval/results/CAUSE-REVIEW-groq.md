# Groq cause review, 29/Sep/2026

Assistant review against the rubrics written in `../CASES.md`. This is not independent human validation. Maikon's review is pending. One designated test per case is scored, including the first failure for case 10.

| Case | Rubric match | Evidence in the saved diagnosis |
|---|---|---|
| 01 | yes | Removed ownership check allows a non-owner to delete, returning 204 instead of 403. |
| 02 | yes | Unknown email now returns a distinct error, unlike a wrong password. |
| 03 | yes | Reading `jwt` instead of `jwtToken` breaks the prepared session. |
| 04 | yes | Article creation slices the tag list and drops its first tag. |
| 05 | yes | Comment placeholder locator no longer matches the element. |
| 06 | yes | Exact button name `Publish` no longer matches `Publish Article`. |
| 07 | yes | Email locator expects `Email address` instead of `Email`. |
| 08 | yes | Defaults overwrite overrides because of object spread order. |
| 09 | yes | Heading assertion compares the body instead of the title. |
| 10 | yes | Global expect timeout of 1 ms prevents assertions from waiting for UI updates. |

Result: 10/10 designated causes match in this assistant review. The 10 examples are deliberately constructed, not a representative production benchmark. This does not establish 100% accuracy in general.

Case 03 also contains two additional diagnoses attributing downstream failures to placeholder changes. They do not identify the injected session bug. They are outside the designated-test denominator and must remain visible as a limitation, not be presented as correct answers.

The model shortened the input titles in cases 01, 02 and 07 despite the instruction to copy them. The scorer now recognizes unique group suffixes, but this remains an output-contract limitation of the model. The original file score was 5/10; corrected title association alone yields 6/10; accepting embedded source paths yields 10/10. These are distinct metrics, not interchangeable accuracy claims.

Actual billing cost is not supplied by this provider integration. Token usage is retained in each answer JSON. No additional model requests were made for this review.
