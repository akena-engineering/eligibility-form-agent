import type { DocumentRef } from "@efa/shared";
import type { AgentDeps, InputFile } from "../deps.ts";
import { flattenFilledForm } from "../pdf/acroform.ts";
import { readTextLayer } from "../pdf/text-layer.ts";
import type { Update } from "../state.ts";

/**
 * Page text with unpdf. Documents must have a text layer: scans are not read.
 */
export function ingestDocuments(deps: AgentDeps) {
  return async (): Promise<Update> => {
    const documents = await Promise.all(
      deps.documents.map((file, i) => ingestDocument(file, `d${i + 1}`)),
    );

    return { documents };
  };
}

async function ingestDocument(
  file: InputFile,
  id: string,
): Promise<DocumentRef> {
  // Filled fillable PDFs keep their values in form fields, which text
  // extraction does not read.
  const bytes = await flattenFilledForm(file.bytes);
  const layer = await readTextLayer(bytes);
  const pages = layer.map(({ n, text }) => ({ n, text }));

  return { id, filename: file.filename, pages };
}
