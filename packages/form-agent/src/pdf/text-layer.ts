import { getDocumentProxy } from "unpdf";

/** A run of text and its position in PDF user space, origin bottom-left. */
export interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextPage {
  n: number;
  text: string;
}

/**
 * Reads every page's text in layout order: lines top to bottom, left to right,
 * the way a person reads the page. The PDF's own stream order would separate
 * values written onto a filled-in document from their labels.
 */
export async function readTextLayer(pdf: Uint8Array): Promise<TextPage[]> {
  // pdf.js rejects Node Buffers and may detach the buffer it is given, so pass
  // a plain copy.
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  const pages: TextPage[] = [];

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();

    const items: TextItem[] = [];

    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;

      items.push({
        str: item.str,
        x: item.transform[4] as number,
        y: item.transform[5] as number,
        width: item.width,
        height: item.height,
      });
    }

    pages.push({ n, text: layoutText(items) });
  }

  await doc.cleanup();

  return pages;
}

/**
 * Lines top to bottom, items left to right. A tick inside "[ ]" is spliced in:
 * "[X]".
 */
export function layoutText(items: TextItem[]): string {
  const sorted = items.toSorted((a, b) => b.y - a.y || a.x - b.x);

  const lines: TextItem[][] = [];
  for (const item of sorted) {
    const line = lines.at(-1);

    if (line && sameLine(line[0]!, item)) line.push(item);
    else lines.push([item]);
  }

  return lines
    .map((line) => joinLine(line.toSorted((a, b) => a.x - b.x)))
    .join("\n");
}

function joinLine(items: TextItem[]): string {
  const out: TextItem[] = [];

  for (const item of items) {
    const previous = out.at(-1);

    if (previous && isOverlay(previous, item)) {
      out[out.length - 1] = splice(previous, item);
      continue;
    }

    out.push({ ...item });
  }

  return out
    .map(
      (item, i) => (i === 0 ? "" : gapSeparator(out[i - 1]!, item)) + item.str,
    )
    .join("")
    .trim();
}

/**
 * A tick drawn on top of another item, e.g. an X inside "[ ] Yes". Without this
 * the line reads "[ ] YesX [ ] No", since the tick starts to the right of where
 * the item starts.
 */
function isOverlay(under: TextItem, over: TextItem): boolean {
  return over.str.trim().length === 1 && over.x < under.x + under.width - 1;
}

/** Puts the mark into the blank it covers: "[ ] Yes" + "X" → "[X] Yes". */
function splice(under: TextItem, over: TextItem): TextItem {
  const charWidth = under.width / Math.max(under.str.length, 1);
  const centre = over.x + over.width / 2;
  const index = Math.floor((centre - under.x) / charWidth);

  const mark = over.str.trim();
  const str =
    under.str[index] === " "
      ? under.str.slice(0, index) + mark + under.str.slice(index + 1)
      : under.str.slice(0, index) + mark + under.str.slice(index);

  return { ...under, str };
}

function sameLine(a: TextItem, b: TextItem): boolean {
  return Math.abs(a.y - b.y) <= Math.max(a.height, b.height, 2) / 2;
}

function gapSeparator(previous: TextItem, next: TextItem): string {
  const gap = next.x - (previous.x + previous.width);
  const spaced = /\s$/.test(previous.str) || /^\s/.test(next.str);

  return gap > 1.5 && !spaced ? " " : "";
}
