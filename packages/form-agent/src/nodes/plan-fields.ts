import type {
  FieldCandidate,
  FieldDefinition,
  FieldProposal,
} from "@efa/shared";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { z } from "zod";
import type { AgentDeps } from "../deps.ts";
import { callStructured } from "../llm.ts";
import { PLAN_SYSTEM, formContext } from "../prompts.ts";
import { blankProposal } from "../proposals.ts";
import { isHumanOnlyByRule } from "../rules/human-only.ts";
import type { State, Update } from "../state.ts";

const Plan = z.object({
  fields: z.array(
    z.object({
      id: z.string(),
      isField: z.boolean(),
      label: z.string(),
      section: z.string(),
      evidenceHint: z.string(),
      type: z.enum(["text", "date", "checkbox", "radio", "select"]),
      format: z.string().nullable(),
      humanOnly: z.boolean(),
    }),
  ),
});
type PlannedField = z.infer<typeof Plan>["fields"][number];

/**
 * Labels, sections and evidence hints for the detected fields, one call per
 * page in parallel. Staff-only fields are decided by the keyword rule OR the
 * model, and skip extraction.
 */
export function planFields(deps: AgentDeps) {
  return async (
    state: State,
    config: LangGraphRunnableConfig,
  ): Promise<Update> => {
    const context = formContext(state.formPages);
    const byPage = Map.groupBy(state.candidates, (c) => c.page);

    const planPage = async (page: number, candidates: FieldCandidate[]) => {
      const list = candidates.map((c) => ({
        id: c.id,
        type: c.type,
        rawLabel: c.rawLabel,
        options: c.options,
      }));

      const { fields } = await callStructured(
        deps.models,
        {
          role: "plan",
          name: "field_plan",
          schema: Plan,
          system: PLAN_SYSTEM,
          context,
          user: `Candidates detected on page ${page}:\n${JSON.stringify(list, null, 2)}`,
        },
        config,
      );

      return fields;
    };

    const planned = await Promise.all(
      [...byPage.entries()].map(([page, candidates]) =>
        planPage(page, candidates),
      ),
    );
    const plan = new Map(planned.flat().map((p) => [p.id, p]));

    const fields = state.candidates.flatMap((c) => {
      const p = plan.get(c.id);

      return p && !p.isField ? [] : [toDefinition(c, p)];
    });

    const proposals: Record<string, FieldProposal> = {};
    for (const field of fields.filter((f) => f.humanOnly)) {
      proposals[field.id] = blankProposal(
        field.id,
        "needs_human",
        "Staff only: for the reviewer.",
      );
    }

    return { fields, proposals };
  };
}

/**
 * A candidate the model did not return is kept with its raw label, never
 * dropped silently.
 */
export function toDefinition(
  c: FieldCandidate,
  p: PlannedField | undefined,
): FieldDefinition {
  const label = p?.label.trim() || c.rawLabel || c.id;
  const type = c.type === "text" && p?.type === "date" ? "date" : c.type;
  const format = type === "date" ? (p?.format ?? "MM/DD/YYYY") : undefined;

  const byRule = isHumanOnlyByRule(c.rawLabel) || isHumanOnlyByRule(label);
  const byModel = Boolean(p?.humanOnly);

  return {
    ...c,
    type,
    label,
    section: p?.section.trim() || `Page ${c.page}`,
    evidenceHint: p?.evidenceHint ?? "",
    ...(format ? { format } : {}),
    humanOnly: byRule || byModel,
  };
}
