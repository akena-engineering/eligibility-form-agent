import type { FieldCandidate, Placement } from "@efa/shared";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { z } from "zod";
import type { AgentDeps } from "../deps.ts";
import { callStructured, pngBlock } from "../llm.ts";
import { loadPdf, readAcroFormFields } from "../pdf/acroform.ts";
import { RENDER_SCALE, renderPage } from "../pdf/render.ts";
import { readTextLayer } from "../pdf/text-layer.ts";
import { FORM_VISION_SYSTEM } from "../prompts.ts";
import type { Update } from "../state.ts";

/** A rectangle in pixels of the rendered page, origin top-left. */
const PageBox = z.object({
  left: z.number(),
  top: z.number(),
  right: z.number(),
  bottom: z.number(),
});
type PageBox = z.infer<typeof PageBox>;

const PageFields = z.object({
  fields: z.array(
    z.object({
      label: z.string(),
      type: z.enum(["text", "date", "checkbox"]),
      box: PageBox,
    }),
  ),
});
type PageField = z.infer<typeof PageFields>["fields"][number];

/**
 * The PDF's own form fields if it has them, otherwise a model finds them on
 * each page.
 */
export function parseForm(deps: AgentDeps) {
  return async (
    _state: unknown,
    config: LangGraphRunnableConfig,
  ): Promise<Update> => {
    const bytes = deps.form.bytes;

    const [acroFields, pages] = await Promise.all([
      readAcroFormFields(bytes),
      readTextLayer(bytes),
    ]);
    const formPages = pages.map((p) => p.text);

    const candidates =
      acroFields.length > 0
        ? acroFields
        : await findFields(deps, bytes, config);

    return { formPages, candidates };
  };
}

/**
 * One call per page, as an image: every blank and box, with the rectangle a
 * value goes into. Pixel boxes on an image are far more precise than fractions
 * of a PDF page.
 */
async function findFields(
  deps: AgentDeps,
  bytes: Uint8Array,
  config: LangGraphRunnableConfig,
): Promise<FieldCandidate[]> {
  const sizes = (await loadPdf(bytes)).getPages().map((page) => page.getSize());
  const found = await Promise.all(
    sizes.map((size, i) => readPage(deps, bytes, i + 1, size, config)),
  );

  const ids = new IdAllocator();

  return found.flatMap((fields, i) =>
    fields.map((field) => ({
      id: ids.next(i + 1, field.type === "checkbox" ? "cb" : "tx", field.label),
      type: field.type,
      rawLabel: field.label,
      page: i + 1,
      placement: toPlacement(field.box, i + 1, sizes[i]!.height),
    })),
  );
}

async function readPage(
  deps: AgentDeps,
  bytes: Uint8Array,
  page: number,
  size: { width: number; height: number },
  config: LangGraphRunnableConfig,
): Promise<PageField[]> {
  const png = await renderPage(bytes, page);
  const width = Math.round(size.width * RENDER_SCALE);
  const height = Math.round(size.height * RENDER_SCALE);

  const { fields } = await callStructured(
    deps.models,
    {
      role: "form",
      name: "form_fields",
      schema: PageFields,
      system: FORM_VISION_SYSTEM,
      user: [
        pngBlock(png),
        {
          type: "text",
          text: `Page ${page}, ${width} x ${height} pixels. List its fields.`,
        },
      ],
    },
    config,
  );

  return fields;
}

/**
 * A box in pixels of the rendered page (origin top-left) to PDF points (origin
 * bottom-left).
 */
export function toPlacement(
  box: PageBox,
  page: number,
  pageHeight: number,
): Placement {
  return {
    page,
    x: box.left / RENDER_SCALE,
    y: pageHeight - box.bottom / RENDER_SCALE,
    width: (box.right - box.left) / RENDER_SCALE,
    height: (box.bottom - box.top) / RENDER_SCALE,
  };
}

/**
 * Readable ids from page, kind and label ("p1-tx-name"), with "-2" on repeats.
 */
class IdAllocator {
  private seen = new Map<string, number>();

  next(page: number, kind: "cb" | "tx", label: string): string {
    const words = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(" ")
      .slice(0, 5);
    const slug = words.join("-") || "field";

    const base = `p${page}-${kind}-${slug}`;
    const count = (this.seen.get(base) ?? 0) + 1;
    this.seen.set(base, count);

    return count === 1 ? base : `${base}-${count}`;
  }
}
