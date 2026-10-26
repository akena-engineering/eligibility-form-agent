import type { DocumentPage, DocumentRef } from "@efa/shared";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { z } from "zod";
import type { AgentDeps, InputFile } from "../deps.ts";
import { callStructured, pdfBlock } from "../llm.ts";
import { extractPage, flattenFilledForm } from "../pdf/acroform.ts";
import { readTextLayer } from "../pdf/text-layer.ts";
import { OCR_SYSTEM } from "../prompts.ts";
import type { Update } from "../state.ts";

/**
 * A page with less text than this is treated as a scan and transcribed by a
 * vision model.
 */
const MIN_PAGE_TEXT = 40;

const Transcription = z.object({ text: z.string() });

/** Page text with unpdf; scanned pages go to the OCR model. */
export function ingestDocuments(deps: AgentDeps) {
  return async (
    _state: unknown,
    config: LangGraphRunnableConfig,
  ): Promise<Update> => {
    const documents = await Promise.all(
      deps.documents.map((file, i) =>
        ingestDocument(deps, file, `d${i + 1}`, config),
      ),
    );

    return { documents };
  };
}

async function ingestDocument(
  deps: AgentDeps,
  file: InputFile,
  id: string,
  config: LangGraphRunnableConfig,
): Promise<DocumentRef> {
  // Filled fillable PDFs keep their values in form fields, which text
  // extraction does not read.
  const bytes = await flattenFilledForm(file.bytes);
  const layer = await readTextLayer(bytes);

  const pages = await Promise.all(
    layer.map(async (page): Promise<DocumentPage> => {
      if (page.text.length >= MIN_PAGE_TEXT) {
        return { n: page.n, text: page.text, source: "text" };
      }

      const text = await transcribePage(deps, bytes, page.n, config);

      return { n: page.n, text, source: "ocr" };
    }),
  );

  return { id, filename: file.filename, pages };
}

async function transcribePage(
  deps: AgentDeps,
  bytes: Uint8Array,
  pageNumber: number,
  config: LangGraphRunnableConfig,
): Promise<string> {
  const single = await extractPage(bytes, pageNumber);

  const { text } = await callStructured(
    deps.models,
    {
      role: "ocr",
      name: "transcription",
      schema: Transcription,
      system: OCR_SYSTEM,
      user: [pdfBlock(single), { type: "text", text: "Transcribe this page." }],
    },
    config,
  );

  return text;
}
