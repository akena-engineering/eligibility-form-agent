import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  type PDFField,
} from "@cantoo/pdf-lib";
import type { FieldCandidate } from "@efa/shared";

export async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes, { ignoreEncryption: true });
}

/** Reads real AcroForm fields. Returns an empty list for flat PDFs. */
export async function readAcroFormFields(
  bytes: Uint8Array,
): Promise<FieldCandidate[]> {
  const doc = await loadPdf(bytes);
  const pages = doc.getPages();
  const fields = doc.getForm().getFields();

  return fields.flatMap((field): FieldCandidate[] => {
    const type = fieldType(field);
    if (!type) return [];

    const name = field.getName();
    const widget = field.acroField.getWidgets()[0];
    const pageIndex = widget
      ? pages.findIndex((p) => p.ref === widget.P())
      : -1;

    const base = {
      id: name,
      rawLabel: name,
      pdfFieldName: name,
      page: Math.max(pageIndex, 0) + 1,
      type,
    };

    if (field instanceof PDFTextField) {
      const maxLength = field.getMaxLength();

      return [{ ...base, ...(maxLength ? { maxLength } : {}) }];
    }

    if (
      field instanceof PDFRadioGroup ||
      field instanceof PDFDropdown ||
      field instanceof PDFOptionList
    ) {
      return [{ ...base, options: field.getOptions() }];
    }

    return [base];
  });
}

function fieldType(field: PDFField): FieldCandidate["type"] | null {
  if (field instanceof PDFTextField) return "text";
  if (field instanceof PDFCheckBox) return "checkbox";
  if (field instanceof PDFRadioGroup) return "radio";
  if (field instanceof PDFDropdown || field instanceof PDFOptionList)
    return "select";

  return null;
}

/**
 * A document with filled form fields (a fillable PDF sent back filled in),
 * flattened so its values become page text. Text extraction does not read form
 * field values otherwise. Other PDFs, and any PDF that cannot be flattened, are
 * returned unchanged.
 */
export async function flattenFilledForm(
  bytes: Uint8Array,
): Promise<Uint8Array> {
  try {
    const doc = await loadPdf(bytes);
    const form = doc.getForm();
    if (form.getFields().length === 0) return bytes;

    form.flatten();

    return await doc.save();
  } catch {
    return bytes;
  }
}
