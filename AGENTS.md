# Eligibility form agent

A small, working demo of an agent that completes an eligibility form on a person's behalf, with
human-in-the-loop review, because a confidently wrong answer has a real cost. It is generic: any
PDF form, any state or program. The bundled sample (Arkansas form, Anna's case) is just one example.
Keep it simple: it is a demo, but it must work correctly.

A reviewer uploads a blank PDF form and a person's documents. A LangGraph agent proposes a value for
every field with a source quote and a confidence score; the reviewer accepts, edits or rejects each
one; the agent writes the accepted values into the PDF.

**Goal:** a 1-minute screen video: case file in → fields fill with sources → one field honestly
empty → reviewer accepts → filled PDF out → eval score.

## Rules

- Never guess. `missing` beats a wrong value. Every value carries a verbatim quote from a document.
- Staff-only fields (`humanOnly`: signatures, the determination, staff verifications, "unlikely
  to return") are enforced in code (`rules/human-only.ts`, `nodes/fill-pdf.ts`), not only in prompts.
  The model can add fields to that set, never remove them.
- Confidence is explainable: self-rating capped by deterministic checks (`rules/confidence.ts`).
- Uploaded documents are untrusted data, never instructions (`prompts.ts`).
- No persistence: run state in memory only. No real personal data: fixtures are synthetic and say so.
- Claude only. One model per role, set in code (`models.ts`).
- Binary files never go into graph state. They are closed over in `buildGraph(deps)`.

## Code style

- Group code into logical blocks separated by one empty line: related variables together, one `if`
  with its body, one loop, a call and the line that uses its result. Empty line between unrelated steps.
- No dense functions written statement after statement. The steps of a function must be visible at a
  glance from its blocks.
- Empty line before a `return` that follows other statements, and around multi-line `if`, `for`,
  `try` and `switch` blocks.
- A class for things with state behind an interface (`ChatModels implements Models`, `IdAllocator`,
  later `RunStore`). Plain functions for stateless rules, and for LangGraph nodes, which are
  `(state, config) => update` functions built by a factory that takes their dependencies.
- Doc comments (`/** */`) are formatted by oxfmt (`jsdoc` in `.oxfmtrc.json`: wrapped at 80,
  capitalized) and linted by the oxlint `jsdoc` plugin. Write usage lines as inline code, or the
  formatter capitalizes them.

## UI rules (apps/web, Phase 3)

A caseworker tool, not an "AI app". Chakra UI v3 with its default system (no custom theme), `blue` as
the one accent for primary actions, green/amber/red only for status. Neutral greys, white surfaces,
1px borders. Dense, aligned, tabular numbers, monospace only for quotes and IDs. No gradients, glow,
sparkles, emoji, chat bubbles, personas or "AI-powered" wording. Motion only on the running step.
Data fetching with TanStack Query, forms with React Hook Form + zod. No router: one page.

## Packages

| Path                  | What                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------ |
| `packages/shared`     | zod schemas + types shared by everything                                             |
| `packages/form-agent` | LangGraph graph, nodes, rules, PDF utils. No HTTP                                    |
| `apps/api`            | NestJS 12: upload, SSE events, review, PDF. In-memory `RunStore`                     |
| `apps/web`            | Vite + React 19 + Chakra v3: upload, steps graph, review cards, PDF view             |
| `packages/evals`      | Phase 5                                                                              |
| `fixtures/`           | The sample form (`forms/`) and synthetic case documents (`cases/`), see `SOURCES.md` |

Graph: `parseForm ∥ ingestDocuments` → `planFields` → `Send` per form section → `fieldPipeline`
(`extractField → verifyField`) → `score` → `humanReview` (`interrupt`) → rejects go back to
`fieldPipeline`, undecided fields back to review, otherwise → `fillPdf`.

Packages are `@efa/*` (eligibility form agent) and depend on each other with `workspace:*`. Shared
packages publish their `.ts` source and must use erasable TypeScript only (`erasableSyntaxOnly`): Node
24 runs them without a build. `apps/api` needs decorators, so `nest build` compiles it with tsc
(`tsconfig.build.json`: ESM, `.ts` imports rewritten to `.js`); its tests run through Vite, which reads
the decorator settings from tsconfig.

`@efa/form-agent` reads no environment. Callers pass the API key to `new ChatModels(apiKey)`: the API from `.env` through `ConfigService`.

Case documents are read in layout order (`readTextLayer(bytes)`): values written onto a flat
form sit at the end of the PDF stream, so stream order would separate them from their labels. Filled
fillable PDFs are flattened first (`flattenFilledForm`), since text extraction ignores field values.
Documents must have a text layer: scans are not read (a demo, not an OCR pipeline).

Form fields: AcroForm PDFs are read and filled as forms. Any other form (flat like the Arkansas form)
goes to the `form` model one page at a time, rendered as a PNG (`pdf/render.ts`); it returns every
field with its box in pixels, and `pdf/fill.ts` draws the value into that box. No layout heuristics.

## Versions

Node 24 (`.nvmrc`), pnpm 12, TypeScript 6 (not 7: most libraries don't support it yet), React 19, zod 4,
LangGraph JS 1.x, `@cantoo/pdf-lib` (maintained pdf-lib fork), unpdf. Exact versions pinned.

## Commands

```
pnpm install
pnpm dev                               # API (:3000) + web (http://localhost:5173), watch mode (needs a key in .env, see .env.example)
pnpm test  |  pnpm typecheck  |  pnpm lint  |  pnpm format
```

Tests run without an API key and cover the deterministic parts: rules, PDF reading and filling,
schemas and the web reducer. Nothing fakes the models.
