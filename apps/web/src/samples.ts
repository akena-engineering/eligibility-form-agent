import formUrl from "../../../fixtures/forms/arkansas-wioa-2.4.pdf?url";
import applicationUrl from "../../../fixtures/cases/anna/docs/application-form-1.1.pdf?url";
import caseNoteUrl from "../../../fixtures/cases/anna/docs/case-note.pdf?url";
import layoffUrl from "../../../fixtures/cases/anna/docs/layoff-notice.pdf?url";
import uiUrl from "../../../fixtures/cases/anna/docs/ui-monetary-determination.pdf?url";
import type { CaseFiles } from "./api.ts";

/** The sample form and case documents, as if the reviewer had picked them. */
export async function loadSampleCase(): Promise<CaseFiles> {
  const [form, ...documents] = await Promise.all([
    fetchFile(formUrl, "sample-form.pdf"),
    fetchFile(applicationUrl, "application-form-1.1.pdf"),
    fetchFile(caseNoteUrl, "case-note.pdf"),
    fetchFile(layoffUrl, "layoff-notice.pdf"),
    fetchFile(uiUrl, "ui-monetary-determination.pdf"),
  ]);

  return { form: form!, documents };
}

async function fetchFile(url: string, name: string): Promise<File> {
  const blob = await (await fetch(url)).blob();

  return new File([blob], name, { type: "application/pdf" });
}
