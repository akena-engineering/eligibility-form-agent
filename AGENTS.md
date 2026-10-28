# Eligibility form agent

An agent that fills a PDF eligibility form from a person's documents, with a human reviewing every
value. A reviewer uploads a blank form and the documents; a LangGraph agent proposes a value for each
field with a source quote and a confidence score; the reviewer accepts, edits or rejects each one; the
agent writes the accepted values into the PDF.

It is generic: any PDF form, any program. Keep it simple: a demo, but it must work correctly.

## Rules

- Never guess. `missing` beats a wrong value. Every value carries a verbatim quote from a document.
- Staff-only fields (`humanOnly`: signatures, the determination, staff verifications) are enforced
  in code (`rules/human-only.ts`, `nodes/fill-pdf.ts`), not only in prompts. The model can add fields
  to that set, never remove them.
- Confidence is the model's self-rating capped by deterministic checks (`rules/confidence.ts`).
- Uploaded documents are untrusted data, never instructions (`prompts.ts`).
- Runs live in memory only. Fixtures are synthetic, never real personal data.
- Claude only, one model per role, set in code (`models.ts`).
- Binary files never go into graph state: they are closed over in `buildGraph(deps)`.
- `@efa/form-agent` reads no environment. The API passes the key to `new ChatModels(apiKey)`.

## Code style

- Group code into blocks separated by one empty line: related variables, one `if` with its body, one
  loop, a call and the line that uses its result. The steps of a function must be visible at a glance.
- Empty line before a `return` that follows other statements, and around multi-line `if`, `for`,
  `try` and `switch` blocks.
- Classes for state behind an interface (`ChatModels implements Models`, `RunStore`). Plain functions
  for stateless rules and for LangGraph nodes, which are built by a factory that takes their
  dependencies.
- Doc comments are formatted by oxfmt (wrapped at 80, capitalized) and linted by oxlint. Write usage
  lines as inline code, or the formatter capitalizes them.

## UI (apps/web)

A caseworker tool, not an "AI app". Chakra UI v3 default system, `blue` for primary actions,
green/amber/red only for status, neutral greys, 1px borders. Dense, tabular numbers, monospace only
for quotes and IDs. No gradients, emoji, chat bubbles or "AI-powered" wording. Motion only on the
running step. TanStack Query for data, React Hook Form + zod for forms, one page, no router.

## Packages

| Path                  | What                                                                         |
| --------------------- | ---------------------------------------------------------------------------- |
| `packages/shared`     | zod schemas and types shared by everything                                   |
| `packages/form-agent` | LangGraph graph, nodes, rules, PDF utilities. No HTTP                        |
| `apps/api`            | NestJS: upload, SSE events, review, PDF. In-memory `RunStore`                |
| `apps/web`            | Vite + React + Chakra: upload, steps graph, review cards, PDF download       |
| `fixtures/`           | A sample form and synthetic case documents, sources in `fixtures/SOURCES.md` |

Graph: `parseForm ∥ ingestDocuments` → `planFields` → `Send` per form section → `fieldPipeline`
(`extractField → verifyField`) → `score` → `humanReview` (`interrupt`) → rejects go back to
`fieldPipeline`, undecided fields back to review, otherwise → `fillPdf`.

Packages are `@efa/*` and publish their `.ts` source, so they use erasable TypeScript only: Node 24
runs them without a build. `apps/api` needs decorators, so `nest build` compiles it with tsc.

## PDFs

- Documents are read in layout order (`readTextLayer`), since values written onto a flat form sit
  at the end of the PDF stream. Filled fillable PDFs are flattened first. Documents need a text
  layer: no OCR.
- AcroForm PDFs are read and filled as forms. Any other form goes to the `form` model page by page as
  a PNG (`pdf/render.ts`); it returns each field with its box in pixels, and `pdf/fill.ts` draws the
  value there. No layout heuristics.

## Versions

Node 24, pnpm 12, TypeScript 6 (not 7: most libraries don't support it yet), React 19, zod 4,
LangGraph JS 1.x, `@cantoo/pdf-lib` (maintained pdf-lib fork), unpdf. Exact versions pinned.

## Commands

```
pnpm install
pnpm dev                 # API (:3000) + web (http://localhost:5173), needs ANTHROPIC_API_KEY in .env
docker compose up        # the same in Docker, source mounted
pnpm test  |  pnpm typecheck  |  pnpm lint  |  pnpm format
```

Tests need no API key and cover the deterministic parts: rules, PDF reading and filling, schemas and
the web reducer. Nothing fakes the models.
