import {
  ReviewDecisions,
  type FieldDefinition,
  type FieldProposal,
  type ReviewDecision,
} from "@efa/shared";
import { interrupt } from "@langchain/langgraph";
import { blankProposal } from "../proposals.ts";
import { completeness } from "../rules/confidence.ts";
import type { RetryRequest, State, Update } from "../state.ts";

/** Re-runs allowed per field after the reviewer rejects it. */
const MAX_RETRIES = 2;

/** Completeness for the review. Runs once per review round. */
export function score() {
  return async (state: State): Promise<Update> => ({
    completeness: completeness(state.fields, state.proposals, state.decisions),
  });
}

export interface ReviewRequest {
  fields: State["fields"];
  proposals: FieldProposal[];
  completeness: State["completeness"];
  documents: State["documents"];
}

/**
 * Pauses for the reviewer. Resumes with a batch of decisions: rejected fields
 * with retries left go back to extraction with the reviewer's note; after
 * MAX_RETRIES they are left to the reviewer.
 */
export function humanReview() {
  return async (state: State): Promise<Update> => {
    const request: ReviewRequest = {
      fields: state.fields,
      proposals: Object.values(state.proposals),
      completeness: state.completeness,
      documents: state.documents,
    };
    const decisions = ReviewDecisions.parse(interrupt(request));

    const fields = new Map(state.fields.map((f) => [f.id, f]));

    const decisionUpdates: Record<string, ReviewDecision | null> = {};
    const proposalUpdates: Record<string, FieldProposal> = {};
    const retries: RetryRequest[] = [];

    for (const d of decisions) {
      const field = fields.get(d.fieldId);
      const proposal = state.proposals[d.fieldId];
      if (!field || !proposal) continue;

      if (d.action !== "reject") {
        decisionUpdates[d.fieldId] = d;
        continue;
      }

      // A reject clears the decision; the field is re-run or left to the
      // reviewer.
      decisionUpdates[d.fieldId] = null;

      if (canRetry(field, proposal)) {
        retries.push({ fieldId: d.fieldId, note: d.note ?? "" });
      } else if (!field.humanOnly) {
        proposalUpdates[d.fieldId] = handToReviewer(proposal);
      }
    }

    return { decisions: decisionUpdates, proposals: proposalUpdates, retries };
  };
}

function canRetry(field: FieldDefinition, proposal: FieldProposal): boolean {
  return !field.humanOnly && proposal.attempt <= MAX_RETRIES;
}

/**
 * Drops the rejected value and its evidence, so a later accept cannot write it.
 */
function handToReviewer(proposal: FieldProposal): FieldProposal {
  const reasoning = `Rejected ${proposal.attempt} times. For the reviewer to fill.`;

  return blankProposal(
    proposal.fieldId,
    "needs_human",
    reasoning,
    proposal.attempt,
  );
}
