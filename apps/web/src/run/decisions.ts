import type {
  Completeness,
  FieldDefinition,
  FieldProposal,
  ReviewDecision,
} from "@efa/shared";

export type Decisions = Record<string, ReviewDecision>;

/**
 * Same rule as the agent: accepted or edited values, out of the fields that
 * apply.
 */
export function completeness(
  fields: FieldDefinition[],
  proposals: Record<string, FieldProposal>,
  decisions: Decisions,
): Completeness {
  const needed = fields.filter(
    (f) => proposals[f.id]?.status !== "not_applicable",
  );

  const done = needed.filter((f) => {
    const decision = decisions[f.id];
    if (!decision) return false;

    const edited = decision.action === "edit";
    const acceptedValue =
      decision.action === "accept" && proposals[f.id]?.value !== null;

    return edited || acceptedValue;
  });

  return { done: done.length, total: needed.length };
}

/**
 * Fields that need a decision before the PDF: every card the review shows, that
 * is every proposal except "not applicable" boxes.
 */
export function undecided(
  fields: FieldDefinition[],
  proposals: Record<string, FieldProposal>,
  decisions: Decisions,
): FieldDefinition[] {
  return fields.filter((f) => {
    const status = proposals[f.id]?.status;

    return (
      status !== undefined && status !== "not_applicable" && !decisions[f.id]
    );
  });
}

export function rejectedCount(decisions: Decisions): number {
  return Object.values(decisions).filter((d) => d.action === "reject").length;
}

export const ACCEPT_ALL_THRESHOLD = 90;

/**
 * Undecided proposals found with confidence at or above the threshold. Never
 * missing, conflicts or staff-only fields.
 */
export function acceptableAbove(
  proposals: Record<string, FieldProposal>,
  decisions: Decisions,
  threshold = ACCEPT_ALL_THRESHOLD,
): string[] {
  return Object.values(proposals)
    .filter((p) => !decisions[p.fieldId])
    .filter(
      (p) =>
        p.status === "found" &&
        p.confidence !== null &&
        p.confidence >= threshold,
    )
    .map((p) => p.fieldId);
}

/**
 * After a batch is sent: the agent consumed the rejects, everything else stays
 * decided.
 */
export function withoutRejects(decisions: Decisions): Decisions {
  return Object.fromEntries(
    Object.entries(decisions).filter(([, d]) => d.action !== "reject"),
  );
}
