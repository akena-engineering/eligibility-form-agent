import type {
  DocumentRef,
  FieldDefinition,
  FieldProposal,
  GraphOutline,
  RunEvent,
} from "@efa/shared";

export type Phase =
  | "idle"
  | "starting"
  | "running"
  | "review"
  | "done"
  | "failed";

export interface NodeProgress {
  started: number;
  finished: number;
  failed: boolean;
}

export interface ReviewData {
  fields: FieldDefinition[];
  documents: DocumentRef[];
}

export interface RunState {
  runId: string | null;
  /** The agent's steps, as the API sent them with the new run. */
  graph: GraphOutline | null;
  phase: Phase;
  /**
   * Highest event sequence number applied. Replayed events at or below it are
   * ignored.
   */
  lastSeq: number;
  nodes: Record<string, NodeProgress>;
  fanOut: { done: number; total: number } | null;
  proposals: Record<string, FieldProposal>;
  review: ReviewData | null;
  error: string | null;
  /**
   * Why the last review batch was not accepted. The decisions stay for another
   * try.
   */
  reviewError: string | null;
}

export type RunAction =
  | { type: "starting" }
  | { type: "started"; runId: string; graph: GraphOutline }
  | { type: "event"; event: RunEvent }
  | { type: "submitted" }
  | { type: "review_failed"; message: string }
  | { type: "failed"; message: string }
  | { type: "reset" };

export const initialRunState: RunState = {
  runId: null,
  graph: null,
  phase: "idle",
  lastSeq: 0,
  nodes: {},
  fanOut: null,
  proposals: {},
  review: null,
  error: null,
  reviewError: null,
};

export function runReducer(state: RunState, action: RunAction): RunState {
  switch (action.type) {
    case "starting":
      return { ...initialRunState, phase: "starting" };

    case "started":
      return {
        ...state,
        runId: action.runId,
        graph: action.graph,
        phase: "running",
      };

    case "submitted":
      return { ...state, phase: "running", fanOut: null, reviewError: null };

    case "review_failed":
      return { ...state, phase: "review", reviewError: action.message };

    case "failed":
      return { ...state, phase: "failed", error: action.message };

    case "reset":
      return initialRunState;

    case "event":
      // EventSource replays after a reconnect; the sequence number makes that
      // harmless.
      if (action.event.seq <= state.lastSeq) return state;

      return applyEvent({ ...state, lastSeq: action.event.seq }, action.event);
  }
}

function applyEvent(state: RunState, event: RunEvent): RunState {
  switch (event.type) {
    case "node_started":
      return {
        ...state,
        nodes: updateNode(state.nodes, event.node, (n) => ({
          ...n,
          started: n.started + 1,
        })),
      };

    case "node_finished":
      return {
        ...state,
        nodes: updateNode(state.nodes, event.node, (n) => ({
          ...n,
          finished: n.finished + 1,
        })),
      };

    case "fan_out":
      return { ...state, fanOut: { done: event.done, total: event.total } };

    case "field_proposed":
      return {
        ...state,
        proposals: {
          ...state.proposals,
          [event.proposal.fieldId]: event.proposal,
        },
      };

    case "review_required": {
      const proposals = Object.fromEntries(
        event.proposals.map((p) => [p.fieldId, p]),
      );

      return {
        ...state,
        phase: "review",
        proposals,
        review: { fields: event.fields, documents: event.documents },
      };
    }

    case "pdf_ready":
      return { ...state, phase: "done" };

    case "error": {
      const nodes = event.node
        ? updateNode(state.nodes, event.node, (n) => ({ ...n, failed: true }))
        : state.nodes;

      return { ...state, nodes, phase: "failed", error: event.message };
    }
  }
}

function updateNode(
  nodes: Record<string, NodeProgress>,
  node: string,
  update: (n: NodeProgress) => NodeProgress,
): Record<string, NodeProgress> {
  const current = nodes[node] ?? { started: 0, finished: 0, failed: false };

  return { ...nodes, [node]: update(current) };
}

export type NodeStatus = "idle" | "running" | "done" | "failed";

/**
 * A node is running while it has started more often than it finished (parallel
 * branches count).
 */
export function nodeStatus(progress: NodeProgress | undefined): NodeStatus {
  if (!progress) return "idle";
  if (progress.failed) return "failed";
  if (progress.started > progress.finished) return "running";

  return progress.finished > 0 ? "done" : "idle";
}
