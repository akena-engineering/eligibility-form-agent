import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib";
import type { FieldDefinition } from "@efa/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { flattenFilledForm, readAcroFormFields } from "../src/pdf/acroform.ts";
import { fillPdf } from "../src/pdf/fill.ts";
import { layoutText, readTextLayer } from "../src/pdf/text-layer.ts";
import { toPlacement } from "../src/nodes/parse-form.ts";
import { toDefinition } from "../src/nodes/plan-fields.ts";

const ARKANSAS = join(
  import.meta.dirname,
  "../../../fixtures/forms/arkansas-wioa-2.4.pdf",
);

describe("forms without fillable fields (Arkansas WIOA 2.4)", () => {
  let form: Uint8Array;

  beforeAll(async () => {
    form = new Uint8Array(await readFile(ARKANSAS));
  });

  it("has no AcroForm fields", async () => {
    expect(await readAcroFormFields(form)).toEqual([]);
  });

  it("turns a box in page fractions into PDF points", () => {
    const box = { x: 0.25, y: 0.5, width: 0.5, height: 0.125 };

    expect(toPlacement(box, 2, { width: 600, height: 800 })).toEqual({
      page: 2,
      x: 150,
      y: 300,
      width: 300,
      height: 100,
    });
  });
});

describe("AcroForm PDFs", () => {
  it("reads and fills real form fields", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const form = doc.getForm();
    form
      .createTextField("name")
      .addToPage(page, { x: 50, y: 700, width: 200, height: 20, font });
    form
      .createCheckBox("laid_off")
      .addToPage(page, { x: 50, y: 650, width: 12, height: 12 });
    const radio = form.createRadioGroup("status");
    radio.addOptionToPage("employed", page, {
      x: 50,
      y: 600,
      width: 12,
      height: 12,
    });
    radio.addOptionToPage("unemployed", page, {
      x: 80,
      y: 600,
      width: 12,
      height: 12,
    });
    const bytes = await doc.save();

    const candidates = await readAcroFormFields(bytes);
    expect(candidates.map((c) => [c.id, c.type])).toEqual([
      ["name", "text"],
      ["laid_off", "checkbox"],
      ["status", "radio"],
    ]);
    expect(candidates[2]?.options).toEqual(["employed", "unemployed"]);

    const def = (id: string) =>
      toDefinition(
        candidates.find((c) => c.id === id)!,
        undefined,
      ) as FieldDefinition;
    const filled = await fillPdf(bytes, [
      { field: def("name"), value: "Anna M. Reyes", source: "test" },
      { field: def("laid_off"), value: true, source: "test" },
      { field: def("status"), value: "unemployed", source: "test" },
    ]);

    const out = (await PDFDocument.load(filled)).getForm();
    expect(out.getTextField("name").getText()).toBe("Anna M. Reyes");
    expect(out.getCheckBox("laid_off").isChecked()).toBe(true);
    expect(out.getRadioGroup("status").getSelected()).toBe("unemployed");
  });

  it("lists values the form refuses on a summary page instead of failing", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const form = doc.getForm();
    const code = form.createTextField("code");
    code.setMaxLength(3);
    code.addToPage(page, { x: 50, y: 700, width: 200, height: 20, font });
    const radio = form.createRadioGroup("status");
    radio.addOptionToPage("employed", page, {
      x: 50,
      y: 600,
      width: 12,
      height: 12,
    });
    const bytes = await doc.save();

    const candidates = await readAcroFormFields(bytes);
    const def = (id: string) =>
      toDefinition(
        candidates.find((c) => c.id === id)!,
        undefined,
      );

    const filled = await fillPdf(bytes, [
      { field: def("code"), value: "ABCDEF", source: "test" },
      { field: def("status"), value: "retired", source: "notice.pdf, p.1" },
    ]);

    expect(
      (await PDFDocument.load(filled)).getForm().getTextField("code").getText(),
    ).toBe("ABC");

    const pages = await readTextLayer(filled);
    expect(pages).toHaveLength(2);
    expect(pages[1]?.text).toContain("retired");
  });

  it("appends a summary page when fields have no position", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const field = {
      id: "v1",
      type: "text",
      rawLabel: "Name",
      page: 1,
      label: "Name",
      section: "A",
      evidenceHint: "",
      humanOnly: false,
    } satisfies FieldDefinition;
    const filled = await fillPdf(await doc.save(), [
      { field, value: "Anna M. Reyes", source: "intake.pdf, p.1" },
    ]);
    const pages = await readTextLayer(filled);
    expect(pages).toHaveLength(2);
    expect(pages[1]?.text).toContain("Anna M. Reyes");
    expect(pages[1]?.text).toContain("Source: intake.pdf, p.1");
  });
});

const CASES = join(import.meta.dirname, "../../../fixtures/cases");

describe("reading filled-in documents", () => {
  it("reads a flat form in layout order, with ticks inside their brackets", async () => {
    const bytes = new Uint8Array(
      await readFile(join(CASES, "anna/docs/application-form-1.1.pdf")),
    );
    const page4 = (await readTextLayer(bytes))[3]!.text;

    expect(page4).toContain("[X] Not employed");
    expect(page4).toContain(
      "Do you currently receive Unemployment Benefits? [X] Yes [ ] No",
    );
    expect(page4).toContain(
      "If so, where? Ozark Valve & Fitting Co. Layoff date (mm/dd/yyyy): 08/14/2026",
    );
  });

  it("puts a tick into the blank of a bracket written as one item", () => {
    const items = [
      { str: "Do you accept texts?", x: 390, y: 621, width: 93, height: 10 },
      { str: "[ ] Yes", x: 491, y: 621, width: 29.4, height: 10 },
      { str: "X", x: 493.2, y: 621.5, width: 6, height: 9 },
      { str: "[ ] No", x: 528, y: 621, width: 27, height: 10 },
    ];

    expect(layoutText(items)).toBe("Do you accept texts? [X] Yes [ ] No");
  });

  it("reads the values of a filled fillable form", async () => {
    const bytes = new Uint8Array(
      await readFile(join(CASES, "marco/docs/schedule-c-2025.pdf")),
    );

    const unflattened = (await readTextLayer(bytes))[0]!.text;
    const flattened = (await readTextLayer(await flattenFilledForm(bytes)))[0]!
      .text;

    expect(unflattened).not.toContain("Marco D. Alvarez");
    expect(flattened).toContain("Marco D. Alvarez");
    expect(flattened).toMatch(/Gross receipts[\s\S]*88,410/);
  });

  it("leaves documents without form fields unchanged", async () => {
    const bytes = new Uint8Array(
      await readFile(join(CASES, "anna/docs/layoff-notice.pdf")),
    );

    expect(await flattenFilledForm(bytes)).toBe(bytes);
  });
});
