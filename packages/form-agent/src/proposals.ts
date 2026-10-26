import type {
  Checks,
  FieldProposal,
  FieldValue,
  ProposalStatus,
} from "@efa/shared";

/** Checks of a proposal that has no value to check. */
export function emptyChecks(): Checks {
  return {
    quoteVerbatim: true,
    verifierAgrees: null,
    crossDocConsistent: true,
    optionValid: true,
  };
}

/**
 * A proposal without evidence or score: missing, not applicable, or left to the
 * reviewer.
 */
export function blankProposal(
  fieldId: string,
  status: Exclude<ProposalStatus, "found" | "conflict">,
  reasoning: string,
  attempt = 1,
  value: FieldValue = null,
): FieldProposal {
  return {
    fieldId,
    value,
    status,
    evidence: [],
    reasoning,
    selfRating: null,
    confidence: null,
    checks: emptyChecks(),
    attempt,
  };
}
