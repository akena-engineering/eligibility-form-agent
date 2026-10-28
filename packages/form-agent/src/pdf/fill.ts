import {
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  StandardFonts,
  rgb,
  type PDFDocument,
  type PDFFont,
} from "@cantoo/pdf-lib";
import type { FieldDefinition, FieldValue } from "@efa/shared";
import { loadPdf } from "./acroform.ts";

export interface FillEntry {
  field: FieldDefinition;
  value: FieldValue;
  /** Shown on the summary page: where the value came from. */
  source: string;
}

const INK = rgb(0.06, 0.16, 0.42);

/**
 * Writes values into the form:
 *
 * - AcroForm fields are set and left editable
 * - Fields with a placement get an X or the text drawn into that box
 * - Anything else, and values the form refuses, go on an appended summary page
 *
 * The standard font has only WinAnsi characters: see `writable`.
 */
export async function fillPdf(
  formBytes: Uint8Array,
  entries: FillEntry[],
): Promise<Uint8Array> {
  const doc = await loadPdf(formBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const charset = new Set(font.getCharacterSet());

  const leftover: FillEntry[] = [];
  let usedAcroForm = false;

  for (const entry of entries) {
    const { field } = entry;
    const value =
      typeof entry.value === "string"
        ? writable(entry.value, charset)
        : entry.value;
    if (value === null || value === false || value === "") continue;

    try {
      if (field.pdfFieldName) {
        setAcroField(doc, field.pdfFieldName, value);
        usedAcroForm = true;
      } else if (field.placement) {
        drawOverlay(doc, field, value, font, bold);
      } else {
        leftover.push({ ...entry, value });
      }
    } catch {
      leftover.push({ ...entry, value });
    }
  }

  if (usedAcroForm) doc.getForm().updateFieldAppearances(font);

  if (leftover.length > 0) {
    appendSummaryPage(doc, leftover, font, bold, charset);
  }

  return doc.save();
}

/**
 * Text the standard fonts can encode. A character they lack loses its accents
 * ("Nguyễn" becomes "Nguyen"), or becomes "?" when nothing is left.
 */
export function writable(text: string, charset: Set<number>): string {
  const ok = (c: string) => c === "\n" || charset.has(c.codePointAt(0)!);

  return [...text.normalize("NFC")]
    .map((c) =>
      ok(c) ? c : [...c.normalize("NFD")].filter(ok).join("") || "?",
    )
    .join("");
}

function setAcroField(
  doc: PDFDocument,
  name: string,
  value: string | true,
): void {
  const field = doc.getForm().getField(name);

  if (field instanceof PDFTextField) {
    const maxLength = field.getMaxLength();
    const text = String(value);

    field.setText(maxLength ? text.slice(0, maxLength) : text);
  } else if (field instanceof PDFCheckBox) {
    field.check();
  } else if (
    field instanceof PDFRadioGroup ||
    field instanceof PDFDropdown ||
    field instanceof PDFOptionList
  ) {
    field.select(String(value));
  }
}

function drawOverlay(
  doc: PDFDocument,
  field: FieldDefinition,
  value: string | true,
  font: PDFFont,
  bold: PDFFont,
): void {
  const box = field.placement!;
  const page = doc.getPage(box.page - 1);

  // Letters are centered vertically by their cap height, the part above the
  // baseline.
  const baseline = (f: PDFFont, size: number) =>
    box.y + (box.height - f.heightAtSize(size, { descender: false })) / 2;

  if (value === true) {
    const size = Math.min(box.width, box.height);
    const width = bold.widthOfTextAtSize("X", size);

    page.drawText("X", {
      x: box.x + (box.width - width) / 2,
      y: baseline(bold, size),
      size,
      font: bold,
      color: INK,
    });

    return;
  }

  const size = Math.min(box.height * 0.8, 10);

  page.drawText(fitText(String(value), font, size, box.width - 4), {
    x: box.x + 2,
    y: baseline(font, size),
    size,
    font,
    color: INK,
  });
}

function fitText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string {
  if (maxWidth <= 0 || font.widthOfTextAtSize(text, size) <= maxWidth)
    return text;

  let out = text;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, size) > maxWidth) {
    out = out.slice(0, -1);
  }

  return `${out}…`;
}

function appendSummaryPage(
  doc: PDFDocument,
  entries: FillEntry[],
  font: PDFFont,
  bold: PDFFont,
  charset: Set<number>,
): void {
  const margin = 54;
  let page = doc.addPage();
  let y = page.getHeight() - margin;

  const line = (text: string, f: PDFFont, size: number) => {
    if (y < margin + size) {
      page = doc.addPage();
      y = page.getHeight() - margin;
    }

    const maxWidth = page.getWidth() - 2 * margin;
    page.drawText(fitText(writable(text, charset), f, size, maxWidth), {
      x: margin,
      y,
      size,
      font: f,
    });
    y -= size + 5;
  };

  line("Values not written on the form", bold, 13);
  y -= 6;

  for (const { field, value, source } of entries) {
    line(field.label, bold, 9);
    line(value === true ? "Yes" : String(value), font, 10);
    line(`Source: ${source}`, font, 8);
    y -= 4;
  }

  y -= 16;
  line(
    "Reviewed by: ______________________________   Date: ______________",
    font,
    10,
  );
}
