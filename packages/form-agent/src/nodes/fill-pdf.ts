import type {
  DocumentRef,
  FieldDefinition,
  FieldProposal,
  ReviewDecision,
} from "@efa/shared";
import type { AgentDeps } from "../deps.ts";
import { fillPdf as writePdf, type FillEntry } from "../pdf/fill.ts";
import { formatForField } from "../rules/values.ts";
import type { State, Update } from "../state.ts";

/**
 * Writes accepted and edited values into the form. A staff-only field is
 * written only when the reviewer typed the value themselves, never from a
 * proposal.
 */
export function fillPdf(deps: AgentDeps) {
  return async (state: State): Promise<Update> => {
    const docs = new Map(state.documents.map((d) => [d.id, d]));

    const entries = state.fields.flatMap((field) => {
      const decision = state.decisions[field.id];
      const proposal = state.proposals[field.id];
      if (!decision || !proposal) return [];

      const entry = toEntry(field, decision, proposal, docs);

      return entry ? [entry] : [];
    });

    const bytes = await writePdf(deps.form.bytes, entries);

    return { filledPdf: Buffer.from(bytes).toString("base64") };
  };
}

function toEntry(
  field: FieldDefinition,
  decision: ReviewDecision,
  proposal: FieldProposal,
  docs: Map<string, DocumentRef>,
): FillEntry | null {
  if (decision.action === "edit") {
    const value = formatForField(decision.value ?? null, field);

    return { field, value, source: "Entered by reviewer" };
  }

  if (decision.action !== "accept" || field.humanOnly) return null;

  const first = proposal.evidence[0];
  const filename = first
    ? (docs.get(first.docId)?.filename ?? first.docId)
    : null;
  const source = first ? `${filename}, p.${first.page}` : "—";

  return { field, value: proposal.value, source };
}
