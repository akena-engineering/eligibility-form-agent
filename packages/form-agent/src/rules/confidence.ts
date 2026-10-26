import type {
  Checks,
  Completeness,
  FieldDefinition,
  FieldProposal,
  ReviewDecision,
  SelfRating,
} from "@efa/shared";

const START: Record<SelfRating, number> = { high: 95, medium: 75, low: 50 };

export const CAPS = {
  quoteNotVerbatim: 30,
  verifierDisagrees: 50,
  conflict: 40,
  invalidOption: 30,
} as const;

type Scorable = Pick<FieldProposal, "status" | "selfRating"> & {
  checks: Checks;
};

/**
 * Explainable confidence: the extractor's own rating, capped by every check
 * that failed. Returns null where no score makes sense (missing, staff only,
 * not applicable).
 */
export function confidence(proposal: Scorable): number | null {
  const { status, checks, selfRating } = proposal;

  const unscored =
    status === "missing" ||
    status === "needs_human" ||
    status === "not_applicable";
  if (unscored) return null;

  const caps: number[] = [];
  if (!checks.quoteVerbatim) caps.push(CAPS.quoteNotVerbatim);
  if (checks.verifierAgrees === false) caps.push(CAPS.verifierDisagrees);
  if (!checks.crossDocConsistent || status === "conflict")
    caps.push(CAPS.conflict);
  if (!checks.optionValid) caps.push(CAPS.invalidOption);

  return Math.min(START[selfRating ?? "low"], ...caps);
}

/**
 * Fields with an accepted or edited value / fields that need one. Unchecked
 * "not applicable" boxes need no value and are left out.
 */
export function completeness(
  fields: FieldDefinition[],
  proposals: Record<string, FieldProposal>,
  decisions: Record<string, ReviewDecision | null>,
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
 * Agent fields without a decision. Staff-only fields may stay empty, and
 * unchecked "not applicable" boxes need no decision.
 */
export function undecided(
  fields: FieldDefinition[],
  proposals: Record<string, FieldProposal>,
  decisions: Record<string, ReviewDecision | null>,
): FieldDefinition[] {
  return fields.filter(
    (f) =>
      !f.humanOnly &&
      proposals[f.id]?.status !== "not_applicable" &&
      !decisions[f.id],
  );
}
