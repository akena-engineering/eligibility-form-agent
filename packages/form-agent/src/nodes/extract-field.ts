import {
  FieldValue,
  SelfRating,
  type FieldDefinition,
  type FieldProposal,
} from "@efa/shared";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { z } from "zod";
import type { AgentDeps } from "../deps.ts";
import { callStructured } from "../llm.ts";
import {
  EXTRACT_SYSTEM,
  documentsContext,
  extractRequest,
} from "../prompts.ts";
import { blankProposal, emptyChecks } from "../proposals.ts";
import type { SectionTask } from "../state.ts";

const Extraction = z.object({
  sectionApplies: z.boolean(),
  sectionReason: z.string(),
  proposals: z.array(
    z.object({
      fieldId: z.string(),
      status: z.enum(["found", "missing", "not_applicable"]),
      value: FieldValue,
      evidence: z.array(
        z.object({
          docId: z.string(),
          page: z.number().int().min(1),
          quote: z.string(),
          candidateValue: FieldValue,
        }),
      ),
      reasoning: z.string(),
      selfRating: SelfRating,
    }),
  ),
});

type Answer = z.infer<typeof Extraction>["proposals"][number];

/**
 * One structured call per section: value, evidence quotes per document,
 * reasoning, self-rating.
 */
export function extractField(deps: AgentDeps) {
  return async (
    task: SectionTask,
    config: LangGraphRunnableConfig,
  ): Promise<FieldProposal[]> => {
    const { sectionApplies, sectionReason, proposals } = await callStructured(
      deps.models,
      {
        role: "extract",
        name: "section_proposals",
        schema: Extraction,
        system: EXTRACT_SYSTEM,
        context: documentsContext(task.documents),
        user: extractRequest(task.section, task.fields, task.notes),
      },
      config,
    );

    const byId = new Map(proposals.map((p) => [p.fieldId, p]));

    return task.fields.map((field) => {
      const attempt = task.attempts[field.id] ?? 1;

      // Enforced in code: no box is ticked in a section that does not apply to
      // the person.
      if (!sectionApplies && field.type === "checkbox") {
        return blankProposal(
          field.id,
          "not_applicable",
          sectionReason,
          attempt,
          false,
        );
      }

      return toDraft(field, byId.get(field.id), attempt);
    });
  };
}

/**
 * One field's raw answer as a proposal. Checks and confidence are set later by
 * verifyField.
 */
function toDraft(
  field: FieldDefinition,
  answer: Answer | undefined,
  attempt: number,
): FieldProposal {
  if (!answer) {
    return blankProposal(
      field.id,
      "missing",
      "The model returned no answer for this field.",
      attempt,
    );
  }

  if (answer.status !== "found") {
    const unticked =
      answer.status === "not_applicable" && field.type === "checkbox";

    return blankProposal(
      field.id,
      answer.status,
      answer.reasoning,
      attempt,
      unticked ? false : null,
    );
  }

  return { ...answer, confidence: null, checks: emptyChecks(), attempt };
}
