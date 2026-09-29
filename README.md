# ai-ci-triage

[![ci](https://github.com/maikonfcosta/ai-ci-triage/actions/workflows/ci.yml/badge.svg)](https://github.com/maikonfcosta/ai-ci-triage/actions/workflows/ci.yml)

**[English](#english)** Â· **[PortuguÃªs](#portuguÃªs)**

```mermaid
flowchart LR
  A[Playwright report] --> B[failure-classifier]
  B --> C[Deterministic gate]
  B --> D[Selected failures + diff + source]
  D --> E[Redacted context]
  E --> F[Model diagnosis]
  F --> G[One updated PR comment]
```

## English

I built this GitHub Action to explain failed Playwright tests using the error, PR diff and nearby source. It posts a likely cause with a file, line and confidence, then updates the same comment on subsequent runs. [failure-classifier](https://github.com/maikonfcosta/failure-classifier) keeps control of the test gate.

**[Live demo comment](https://github.com/maikonfcosta/playwright-reference-suite/pull/1#issuecomment-5896070196)** Â· [Spec](SPEC.md) Â· [Evaluation](eval/results/REVIEW-groq.md) Â· [Remote evidence](docs/integration/evidence/run-36611138629-attempt-2/VERIFICATION.md)

### What is covered

| Behavior | Evidence |
|---|---|
| Diagnose a known assertion failure | Demo points to `draft.body` instead of `draft.title`, line 14 |
| Update a single comment | Two runs, same comment ID `5896070196` |
| Preserve the deterministic gate | Both demo runs: 16 passed, 1 intentional failure; classifier stayed red |
| Scrub secrets and handle Groq unavailability | Automated tests with synthetic inputs and mocked clients |
| Ship a standalone Node 24 action | Bundle tested outside the repo; CI verifies it matches source |

The [P3 CI run](https://github.com/maikonfcosta/ai-ci-triage/actions/runs/36610382340) passed 62 tests. The demo's deliberate assertion failure must not be merged.

### Run it

Requires Node 24. Tests need no API keys.

```sh
npm ci
npm run lint
npm run typecheck
npm run build:check
npm test
```

To rescore saved responses without network access: `npm run eval:score -- groq`. For new model calls, configure `GROQ_API_KEY` in a git-ignored `.env` and run `npm run eval -- ../playwright-reference-suite --run --only groq`. This requires the companion repository and its evaluation refs/artifacts. Valid saved answers are reused; it is not a fresh independent run. See [case definitions](eval/CASES.md).

### Use in a workflow

The pinned example is the previously demonstrated v0.1.0 implementation. To use the Groq-only refactor, pin its reviewed commit after publication. After checkout and the classifier step (`id: classify`), use the pinned, demonstrated version below. The job needs `contents: read` and `pull-requests: write`. Supply only the key for the provider you intend to use. [Full integration patch and procedure](docs/integration/F5.md).

```yaml
- name: Explain failures (advisory only)
  if: >-
    ${{ !cancelled() && github.event_name == 'pull_request' &&
        github.event.pull_request.head.repo.full_name == github.repository &&
        steps.classify.outputs.verdicts != '' &&
        hashFiles('test-results/results.json') != '' }}
  continue-on-error: true
  uses: maikonfcosta/ai-ci-triage@5cf7d486b8861ee677bcedf529accc4050ba246a
  with:
    report: test-results/results.json
    verdicts: ${{ steps.classify.outputs.verdicts }}
    groq-api-key: ${{ secrets.GROQ_API_KEY }}
    max-input-tokens: '5500'
```

`result` is the path to the diagnosis JSON. The action also writes the Job Summary. All inputs are listed in [action.yml](action.yml). Groq is the only provider. There is no provider fallback. If it is unavailable, the action reports that no diagnosis was produced. The action ignores forks and non-PR events in normal mode.

### How it is organized

```text
src/                failure selection, context, redaction, providers, comment
tests/              unit tests and offline standalone-bundle tests
eval/               injected failures, rubrics, saved answers and scoring
dist/index.mjs      bundled action, committed with the source
docs/integration/   demo procedure and remote evidence
```

### Decisions and trade-offs

#### The first score exposed a scoring problem

Groq answered all ten constructed cases with `openai/gpt-oss-120b`. The original evaluator reported 5/10 file hits. Some answers shortened the test title; others named the source file inside a patch rather than the patch itself.

| Metric | Result |
|---|---|
| Original exact-file score, preserved | 5/10 |
| Exact file after unambiguous title matching | 6/10 |
| Also accept source paths from the expected patch | 10/10 |

The rules changed after inspecting the answers. These are post-hoc scoring results, not an improvement in model output. The [original report](eval/results/SCORES-groq.md), [saved answers](eval/results/) and [revised report](eval/results/REVIEW-groq.md) remain separate.

#### Ten file hits do not mean every diagnosis was right

The [assistant's cause review](eval/results/CAUSE-REVIEW-groq.md) matched all ten designated causes against the existing rubrics; independent human review is still pending. In case 03, two additional diagnoses blamed selectors instead of the broken session. This small constructed dataset does not establish production accuracy, and file scoring does not validate exact line numbers.

#### One request, no agent loop

Code assembles and redacts the context before sending it. The model receives no tools and returns structured JSON. Context is reduced to a budget; Groq's pre-call token count is a local estimate. The actual API usage is retained in the result. Secret tests cover known patterns and supplied environment values, not every possible kind of sensitive data.

#### Accepted for now

- The current scope is Groq only, using native Node fetch. Historical evaluation inputs and v0.1.0 evidence are retained; removed providers are no longer a pending comparison.
- The two remote diagnoses used 1,750/406 and 1,744/423 input/output tokens. Billing cost is unknown; no measured dollar-cost average is claimed.
- Groq evaluation waits 65 seconds between attempts. Account limits and context estimates can still cause errors.
- A successful action step means the advisory tool did not fail the job; inspect its comment/result to know whether a diagnosis was produced.
- `dry-run` suppresses diagnosis and publication, but GitHub may still be contacted for PR context; token counting is local. Use `eval:score` for a strictly offline review.
- No automatic fix, merge approval or production-accuracy claim. Independent human cause review remains pending.

---

## PortuguÃªs

Criei esta GitHub Action para explicar falhas do Playwright usando o erro, o diff do PR e o cÃ³digo prÃ³ximo da falha. Ela comenta a causa provÃ¡vel com arquivo, linha e confianÃ§a, e atualiza o mesmo comentÃ¡rio nas prÃ³ximas execuÃ§Ãµes. O [failure-classifier](https://github.com/maikonfcosta/failure-classifier) mantÃ©m o controle do gate de testes.

**[ComentÃ¡rio da demonstraÃ§Ã£o](https://github.com/maikonfcosta/playwright-reference-suite/pull/1#issuecomment-5896070196)** Â· [EspecificaÃ§Ã£o](SPEC.md) Â· [AvaliaÃ§Ã£o](eval/results/REVIEW-groq.md) Â· [EvidÃªncia remota](docs/integration/evidence/run-36611138629-attempt-2/VERIFICATION.md)

### O que cobre

| Comportamento | EvidÃªncia |
|---|---|
| Diagnosticar uma falha conhecida de asserÃ§Ã£o | DemonstraÃ§Ã£o aponta `draft.body` no lugar de `draft.title`, linha 14 |
| Atualizar um Ãºnico comentÃ¡rio | Duas execuÃ§Ãµes, mesmo ID `5896070196` |
| Preservar o gate determinÃ­stico | Ambas as execuÃ§Ãµes: 16 passed, 1 falha intencional; classificador permaneceu vermelho |
| Ocultar segredos e tratar indisponibilidade da Groq | Testes automatizados com entradas sintÃ©ticas e clientes simulados |
| Entregar uma Action independente em Node 24 | Pacote testado fora do repositÃ³rio; CI verifica correspondÃªncia com o cÃ³digo |

O [CI do P3](https://github.com/maikonfcosta/ai-ci-triage/actions/runs/36610382340) passou nos 62 testes. A falha intencional da demonstraÃ§Ã£o nÃ£o deve ser mesclada.

### Como rodar

Requer Node 24. Os testes nÃ£o precisam de chaves de API.

```sh
npm ci
npm run lint
npm run typecheck
npm run build:check
npm test
```

Para reavaliar respostas salvas sem rede: `npm run eval:score -- groq`. Para novas chamadas, configure `GROQ_API_KEY` no `.env` ignorado pelo Git e execute `npm run eval -- ../playwright-reference-suite --run --only groq`. Ã‰ necessÃ¡rio o repositÃ³rio complementar com suas referÃªncias e artefatos de avaliaÃ§Ã£o. Respostas vÃ¡lidas salvas sÃ£o reaproveitadas; nÃ£o se trata de uma nova execuÃ§Ã£o independente. Consulte os [casos](eval/CASES.md).

### Uso no workflow

O exemplo fixado é a implementação v0.1.0 já demonstrada. Para usar a refatoração exclusiva da Groq, fixe seu commit revisado após a publicação. Depois do checkout e do passo do classificador (`id: classify`), use a versÃ£o fixa demonstrada abaixo. O job precisa de `contents: read` e `pull-requests: write`. Informe apenas a chave do provedor que pretende usar. [Patch completo e procedimento](docs/integration/F5.md).

```yaml
- name: Explain failures (advisory only)
  if: >-
    ${{ !cancelled() && github.event_name == 'pull_request' &&
        github.event.pull_request.head.repo.full_name == github.repository &&
        steps.classify.outputs.verdicts != '' &&
        hashFiles('test-results/results.json') != '' }}
  continue-on-error: true
  uses: maikonfcosta/ai-ci-triage@5cf7d486b8861ee677bcedf529accc4050ba246a
  with:
    report: test-results/results.json
    verdicts: ${{ steps.classify.outputs.verdicts }}
    groq-api-key: ${{ secrets.GROQ_API_KEY }}
    max-input-tokens: '5500'
```

`result` contÃ©m o caminho do JSON de diagnÃ³stico. A Action tambÃ©m escreve no resumo do job. As entradas estÃ£o em [action.yml](action.yml). Com chave Groq, ela Ã© o provedor principal; OpenAI Ã© a alternativa se configurada, senÃ£o Gemini. Sem Groq, a ordem Ã© OpenAI e depois Gemini. Um diagnÃ³stico vÃ¡lido, mas incorreto, nÃ£o aciona a alternativa. A Action ignora forks e eventos fora de PR no modo normal.

### OrganizaÃ§Ã£o

```text
src/                seleÃ§Ã£o de falhas, contexto, ocultaÃ§Ã£o, provedores, comentÃ¡rio
tests/              testes unitÃ¡rios e do pacote isolado sem rede
eval/               falhas provocadas, critÃ©rios, respostas salvas e pontuaÃ§Ã£o
dist/index.mjs      Action empacotada, versionada com o cÃ³digo
docs/integration/   procedimento da demonstraÃ§Ã£o e evidÃªncias remotas
```

### DecisÃµes e concessÃµes

#### A primeira pontuaÃ§Ã£o revelou um problema na avaliaÃ§Ã£o

A Groq respondeu aos dez casos construÃ­dos com `openai/gpt-oss-120b`. O avaliador original registrou 5/10 acertos de arquivo. Algumas respostas abreviaram o nome do teste; outras citaram o arquivo de origem contido no patch, em vez do patch.

| MÃ©trica | Resultado |
|---|---|
| PontuaÃ§Ã£o original de arquivo exato, preservada | 5/10 |
| Arquivo exato apÃ³s associaÃ§Ã£o inequÃ­voca dos tÃ­tulos | 6/10 |
| Aceitando tambÃ©m caminhos de origem do patch esperado | 10/10 |

As regras mudaram depois de inspecionar as respostas. SÃ£o resultados de revisÃ£o posterior da pontuaÃ§Ã£o, nÃ£o uma melhoria na saÃ­da do modelo. O [relatÃ³rio original](eval/results/SCORES-groq.md), as [respostas salvas](eval/results/) e o [relatÃ³rio revisado](eval/results/REVIEW-groq.md) permanecem separados.

#### Dez acertos de arquivo nÃ£o significam que todos os diagnÃ³sticos estavam corretos

A [revisÃ£o de causas pela IA](eval/results/CAUSE-REVIEW-groq.md) associou as dez causas escolhidas aos critÃ©rios existentes; a revisÃ£o humana independente segue pendente. No caso 03, dois diagnÃ³sticos adicionais culparam seletores em vez da sessÃ£o quebrada. Esse conjunto pequeno de falhas construÃ­das nÃ£o demonstra precisÃ£o em produÃ§Ã£o, e a pontuaÃ§Ã£o de arquivos nÃ£o valida as linhas exatas.

#### Uma requisiÃ§Ã£o, sem ciclo de agente

O cÃ³digo monta o contexto e oculta segredos antes do envio. O modelo nÃ£o recebe ferramentas e retorna JSON estruturado. O contexto Ã© reduzido a um orÃ§amento; a contagem da Groq antes da chamada Ã© uma estimativa local. O uso real informado pela API fica no resultado. Os testes de segredos cobrem padrÃµes conhecidos e valores fornecidos pelo ambiente, nÃ£o todo tipo possÃ­vel de dado sensÃ­vel.

#### Aceito por enquanto

- Groq Ã© o Ãºnico provedor com avaliaÃ§Ã£o completa dos dez casos e demonstraÃ§Ã£o remota. Gemini produziu duas respostas vÃ¡lidas salvas antes de erros de disponibilidade/cota interromperem a avaliaÃ§Ã£o; OpenAI nÃ£o tem comparaÃ§Ã£o concluÃ­da aqui.
- Os dois diagnÃ³sticos remotos usaram 1.750/406 e 1.744/423 tokens de entrada/saÃ­da. O custo faturado Ã© desconhecido; nÃ£o hÃ¡ alegaÃ§Ã£o de custo mÃ©dio medido em dÃ³lares.
- A avaliaÃ§Ã£o Groq espera 65 segundos entre tentativas. Limites da conta e estimativas de contexto ainda podem causar erros.
- Um passo da Action verde significa que a ferramenta consultiva nÃ£o falhou o job; consulte o comentÃ¡rio/resultado para saber se houve diagnÃ³stico.
- `dry-run` impede diagnÃ³stico e publicaÃ§Ã£o, mas o GitHub pode ser consultado para contexto do PR; a contagem de tokens é local. Use `eval:score` para revisÃ£o estritamente offline.
- Sem correÃ§Ã£o automÃ¡tica, aprovaÃ§Ã£o de merge ou alegaÃ§Ã£o de precisÃ£o em produÃ§Ã£o. ComparaÃ§Ã£o OpenAI/Gemini e revisÃ£o independente das causas continuam como partes nÃ£o concluÃ­das da especificaÃ§Ã£o original.
