import { Annotation } from "@langchain/langgraph";
import type {
  Completeness,
  DocumentRef,
  FieldCandidate,
  FieldDefinition,
  FieldProposal,
  ReviewDecision,
} from "@efa/shared";

export interface RetryRequest {
  fieldId: string;
  note: string;
}

/** Merge by key. A null value deletes the key. */
function mergeRecord<T>(
  a: Record<string, T>,
  b: Record<string, T | null>,
): Record<string, T> {
  const out = { ...a };

  for (const [k, v] of Object.entries(b)) {
    if (v === null) delete out[k];
    else out[k] = v;
  }

  return out;
}

function replace<T>(_: T, b: T): T {
  return b;
}

export const GraphState = Annotation.Root({
  // Form and documents, read once at the start.

  formPages: Annotation<string[]>,
  candidates: Annotation<FieldCandidate[]>,
  documents: Annotation<DocumentRef[]>,
  fields: Annotation<FieldDefinition[]>,

  // Proposals and the reviewer's decisions, merged by field id.
  proposals: Annotation<
    Record<string, FieldProposal>,
    Record<string, FieldProposal | null>
  >({
    reducer: mergeRecord,
    default: () => ({}),
  }),
  decisions: Annotation<
    Record<string, ReviewDecision>,
    Record<string, ReviewDecision | null>
  >({
    reducer: mergeRecord,
    default: () => ({}),
  }),
  completeness: Annotation<Completeness>,

  // Review loop.
  retries: Annotation<RetryRequest[]>({ reducer: replace, default: () => [] }),
});

export type State = typeof GraphState.State;
export type Update = typeof GraphState.Update;

/**
 * Input of one fieldPipeline branch: one section, or the rejected fields of one
 * section.
 */
export interface SectionTask {
  section: string;
  fields: FieldDefinition[];
  documents: DocumentRef[];
  /** Reviewer notes for re-runs, by field id. */
  notes: Record<string, string>;
  /** Attempt number per field id. */
  attempts: Record<string, number>;
}
