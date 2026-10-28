import type {
  Checks,
  DocumentRef,
  Evidence,
  FieldDefinition,
  FieldProposal,
} from "@efa/shared";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { z } from "zod";
import { emit, type AgentDeps } from "../deps.ts";
import { callStructured } from "../llm.ts";
import { VERIFY_SYSTEM } from "../prompts.ts";
import { emptyChecks } from "../proposals.ts";
import { confidence } from "../rules/confidence.ts";
import { quoteAppearsIn } from "../rules/quote.ts";
import {
  formatForField,
  isCrossDocConsistent,
  isOptionValid,
} from "../rules/values.ts";
import type { SectionTask } from "../state.ts";

const Verdicts = z.object({
  verdicts: z.array(
    z.object({ fieldId: z.string(), supports: z.boolean(), why: z.string() }),
  ),
});

/**
 * Deterministic checks first (verbatim quotes, options, cross-document
 * consistency), then an independent model judges whether the quotes support
 * each value. Sets confidence from the checks.
 */
export function verifyField(deps: AgentDeps) {
  return async (
    task: SectionTask & { drafts: FieldProposal[] },
    config: LangGraphRunnableConfig,
  ): Promise<Record<string, FieldProposal>> => {
    const fields = new Map(task.fields.map((f) => [f.id, f]));

    const checked = task.drafts.map((draft) => {
      const field = fields.get(draft.fieldId)!;

      return checkDeterministic(draft, field, task.documents);
    });

    const toJudge = checked.filter(
      (p) => p.status === "found" && p.value !== false && p.value !== null,
    );
    const verdicts = await judge(deps, toJudge, fields, config);

    const proposals: Record<string, FieldProposal> = {};

    for (const proposal of checked) {
      // A field the judge was asked about but did not answer counts as not
      // supported.
      const asked = toJudge.includes(proposal);
      const verifierAgrees =
        verdicts.get(proposal.fieldId) ?? (asked ? false : null);

      const checks = { ...proposal.checks, verifierAgrees };
      const final = {
        ...proposal,
        checks,
        confidence: confidence({ ...proposal, checks }),
      };

      proposals[proposal.fieldId] = final;
      emit(config, { type: "field_proposed", proposal: final });
    }

    return proposals;
  };
}

/**
 * One call to an independent model: does each set of quotes support its value?
 */
async function judge(
  deps: AgentDeps,
  proposals: FieldProposal[],
  fields: Map<string, FieldDefinition>,
  config: LangGraphRunnableConfig,
): Promise<Map<string, boolean>> {
  if (proposals.length === 0) return new Map();

  const items = proposals.map((p) => ({
    fieldId: p.fieldId,
    field: fields.get(p.fieldId)?.label,
    proposedValue: p.value,
    quotes: p.evidence.map((e) => e.quote),
  }));

  const { verdicts } = await callStructured(
    deps.models,
    {
      role: "verify",
      name: "verdicts",
      schema: Verdicts,
      system: VERIFY_SYSTEM,
      user: JSON.stringify(items, null, 2),
    },
    config,
  );

  return new Map(verdicts.map((v) => [v.fieldId, v.supports]));
}

export function checkDeterministic(
  draft: FieldProposal,
  field: FieldDefinition,
  documents: DocumentRef[],
): FieldProposal {
  if (draft.status !== "found") return { ...draft, checks: emptyChecks() };

  const located = draft.evidence.map((e) => locateQuote(e, documents));
  const evidence = located.map((l) => l.evidence);
  const quoteVerbatim = located.length > 0 && located.every((l) => l.found);

  const value = formatForField(draft.value, field);
  const crossDocConsistent = isCrossDocConsistent(evidence, field);

  const checks: Checks = {
    quoteVerbatim,
    verifierAgrees: null,
    crossDocConsistent,
    optionValid: isOptionValid(value, field),
  };

  return {
    ...draft,
    value,
    evidence,
    status: crossDocConsistent ? "found" : "conflict",
    checks,
  };
}

/**
 * A quote must appear verbatim on the cited page. If it is on another page of
 * the same document, the citation is corrected rather than failed.
 */
function locateQuote(
  e: Evidence,
  documents: DocumentRef[],
): { evidence: Evidence; found: boolean } {
  const doc = documents.find((d) => d.id === e.docId);

  const cited = doc?.pages.find((p) => p.n === e.page);
  if (cited && quoteAppearsIn(e.quote, cited.text)) {
    return { evidence: e, found: true };
  }

  const other = doc?.pages.find((p) => quoteAppearsIn(e.quote, p.text));
  if (other) return { evidence: { ...e, page: other.n }, found: true };

  return { evidence: e, found: false };
}
