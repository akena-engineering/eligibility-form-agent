# Eligibility form agent

An agent that drafts an eligibility form from a person's case documents, with a caseworker reviewing
every value before it goes into the PDF. A confidently wrong answer has a real cost, so the agent
leaves a field blank rather than guess, and every value it proposes cites a verbatim quote from a
document.

It works with any PDF form. The bundled sample is the first two pages of Arkansas' WIOA Dislocated
Worker Eligibility Determination (Form 2.4), with a synthetic case file for "Anna".

<!-- Demo video: drag demo.mp4 into the GitHub editor here; it renders inline. -->

## How it works

1. The reviewer uploads a blank PDF form and the person's documents (PDFs with a text layer).
2. A LangGraph agent reads the form and the documents, then proposes a value for every field, with
   the source quote, the page it came from and a confidence score.
3. The reviewer accepts, edits or rejects each field. Rejected fields go back to the agent with the
   reviewer's note.
4. The agent writes the accepted values into the original PDF, which downloads.

```
parseForm ∥ ingestDocuments → planFields → fieldPipeline per section (extract → verify)
  → score → humanReview → fillPdf
                 ↑     │ rejected
                 └─────┘
```

Fillable (AcroForm) PDFs are read and filled as forms. Flat forms, like the sample, are rendered page
by page as images and the model returns each field with its box, where the value is then drawn.

### Safeguards

- **No guessing.** A field without a supporting quote stays `missing`, shown as an honest blank.
- **Explainable confidence.** The extractor's self-rating is capped by each check that fails: the
  quote isn't verbatim, a second model disagrees, documents conflict, or the value isn't one of the
  field's options (`packages/form-agent/src/rules/confidence.ts`).
- **Staff-only fields** (signatures, the eligibility determination, staff verifications) are never
  filled by the agent. This is enforced in code, not only in the prompt.
- **Documents are data.** Uploaded text is never treated as instructions.
- **Nothing is stored.** Runs live in memory. All case data in `fixtures/` is synthetic, see
  [`fixtures/SOURCES.md`](fixtures/SOURCES.md).

## Run it

You need an Anthropic API key. Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY`.

### With Docker

```sh
docker compose up
```

Open http://localhost:5173 and click **Load a sample case**, then **Start**. The source is mounted,
so the API and the web app reload when you save. Dependencies are installed in the container
when it starts, so the first start takes a minute or two; later ones reuse the downloaded packages.

### Locally

Node 24 and pnpm (`corepack enable` picks the pinned version).

```sh
pnpm install
pnpm dev        # API on :3000, web on http://localhost:5173
```

### Tests and checks

```sh
pnpm test       # no API key needed
pnpm typecheck
pnpm lint
pnpm format
```

Tests cover the deterministic parts: the rules, PDF reading and filling, the schemas and the web
state. Nothing fakes the models.

## Project layout

| Path                  | What                                                                     |
| --------------------- | ------------------------------------------------------------------------ |
| `packages/shared`     | zod schemas and types shared by the API and the web app                  |
| `packages/form-agent` | The LangGraph graph, its nodes, the rules and PDF utilities. No HTTP     |
| `apps/api`            | NestJS: upload, server-sent run events, review decisions, the filled PDF |
| `apps/web`            | React + Chakra UI: upload, live steps, review cards, PDF download        |
| `fixtures/`           | The sample form and synthetic case documents                             |

Models: Claude Sonnet reads the form, plans and extracts; Claude Haiku verifies, so the checker is a
different model from the extractor (`packages/form-agent/src/models.ts`).

## Limits

It's a demo, not a product. Documents need a text layer (no OCR of scans), runs are lost on restart,
and there is no authentication.
