import type { FieldDefinition, FieldProposal, GraphOutline } from "@efa/shared";
import {
  END,
  MemorySaver,
  START,
  Send,
  StateGraph,
  isGraphInterrupt,
  type BaseCheckpointSaver,
  type LangGraphRunnableConfig,
} from "@langchain/langgraph";
import { emit, type AgentDeps } from "./deps.ts";
import { extractField } from "./nodes/extract-field.ts";
import { fillPdf } from "./nodes/fill-pdf.ts";
import { ingestDocuments } from "./nodes/ingest-documents.ts";
import { parseForm } from "./nodes/parse-form.ts";
import { planFields } from "./nodes/plan-fields.ts";
import { humanReview, score } from "./nodes/review.ts";
import { verifyField } from "./nodes/verify-field.ts";
import { undecided } from "./rules/confidence.ts";
import { GraphState, type SectionTask, type State } from "./state.ts";

/**
 * Node and edge list for the UI's step view. fieldPipeline is drawn as its two
 * steps.
 */
export const GRAPH_OUTLINE: GraphOutline = {
  nodes: [
    "parseForm",
    "ingestDocuments",
    "planFields",
    "extractField",
    "verifyField",
    "score",
    "humanReview",
    "fillPdf",
  ],
  edges: [
    ["parseForm", "planFields"],
    ["ingestDocuments", "planFields"],
    ["planFields", "extractField"],
    ["extractField", "verifyField"],
    ["verifyField", "score"],
    ["score", "humanReview"],
    ["humanReview", "extractField"],
    ["humanReview", "score"],
    ["humanReview", "fillPdf"],
  ],
};

type NodeFn<I, O> = (input: I, config: LangGraphRunnableConfig) => Promise<O>;

/**
 * Emits node_started / node_finished / error around a step for the step view.
 */
function withEvents<I, O>(node: string, fn: NodeFn<I, O>): NodeFn<I, O> {
  return async (input, config) => {
    emit(config, { type: "node_started", node });

    try {
      const out = await fn(input, config);
      emit(config, { type: "node_finished", node });

      return out;
    } catch (error) {
      // interrupt() throws: a pause for review ends this attempt of the node,
      // not the run.
      if (isGraphInterrupt(error)) {
        emit(config, { type: "node_finished", node });
      } else {
        const message = error instanceof Error ? error.message : String(error);
        emit(config, { type: "error", node, message });
      }

      throw error;
    }
  };
}

/**
 * Builds the graph for one run. Input files and models are closed over, so
 * binary data never enters graph state or checkpoints.
 */
export function buildGraph(
  deps: AgentDeps,
  checkpointer: BaseCheckpointSaver = new MemorySaver(),
) {
  const extract = withEvents("extractField", extractField(deps));
  const verify = withEvents("verifyField", verifyField(deps));

  /** Sections finished in the current fan-out, for the step view's counter. */
  const progress = { done: 0, total: 0 };

  /** One section: extract, then verify. Its two steps emit their own events. */
  const fieldPipeline = async (
    task: SectionTask,
    config: LangGraphRunnableConfig,
  ) => {
    const drafts = await extract(task, config);
    const proposals = await verify({ ...task, drafts }, config);

    progress.done += 1;
    emit(config, { type: "fan_out", node: "fieldPipeline", ...progress });

    return { proposals };
  };

  /** One fieldPipeline branch per form section. */
  const sendSections = (
    state: State,
    fields: FieldDefinition[],
    notes: Record<string, string>,
  ) => {
    const sections = Map.groupBy(fields, (f) => f.section);

    progress.done = 0;
    progress.total = sections.size;

    return [...sections.entries()].map(([section, sectionFields]) => {
      const attempts = Object.fromEntries(
        sectionFields.map((f) => [
          f.id,
          (state.proposals[f.id]?.attempt ?? 0) + 1,
        ]),
      );

      const task: SectionTask = {
        section,
        fields: sectionFields,
        documents: state.documents,
        notes,
        attempts,
      };

      return new Send("fieldPipeline", task);
    });
  };

  const routeSections = (state: State) => {
    const agentFields = state.fields.filter((f) => !f.humanOnly);
    const sends = sendSections(state, agentFields, {});

    return sends.length > 0 ? sends : "score";
  };

  /**
   * Rejects with retries left are re-run; the PDF is filled once every field is
   * decided.
   */
  const routeAfterReview = (state: State) => {
    if (state.retries.length > 0) {
      const notes = Object.fromEntries(
        state.retries.map((r) => [r.fieldId, r.note]),
      );
      const rejected = state.fields.filter((f) => f.id in notes);

      return sendSections(state, rejected, notes);
    }

    const open = undecided(state.fields, state.proposals, state.decisions);

    return open.length > 0 ? "score" : "fillPdf";
  };

  // A Send passes its own payload (a SectionTask), not the graph state, to the
  // node.
  const fieldPipelineNode = fieldPipeline as unknown as NodeFn<
    State,
    { proposals: Record<string, FieldProposal> }
  >;

  return new StateGraph(GraphState)
    .addNode("parseForm", withEvents("parseForm", parseForm(deps)))
    .addNode(
      "ingestDocuments",
      withEvents("ingestDocuments", ingestDocuments(deps)),
    )
    .addNode("planFields", withEvents("planFields", planFields(deps)))
    .addNode("fieldPipeline", fieldPipelineNode)
    .addNode("score", withEvents("score", score()))
    .addNode("humanReview", withEvents("humanReview", humanReview()))
    .addNode("fillPdf", withEvents("fillPdf", fillPdf(deps)))

    .addEdge(START, "parseForm")
    .addEdge(START, "ingestDocuments")
    .addEdge(["parseForm", "ingestDocuments"], "planFields")
    .addConditionalEdges("planFields", routeSections, [
      "fieldPipeline",
      "score",
    ])
    .addEdge("fieldPipeline", "score")
    .addEdge("score", "humanReview")
    .addConditionalEdges("humanReview", routeAfterReview, [
      "fieldPipeline",
      "score",
      "fillPdf",
    ])
    .addEdge("fillPdf", END)
    .compile({ checkpointer });
}

export type FormAgentGraph = ReturnType<typeof buildGraph>;

/**
 * Per-run config. `maxConcurrency` caps parallel branches, and so parallel
 * model calls.
 */
export function runConfig(threadId: string, maxConcurrency = 4) {
  return {
    configurable: { thread_id: threadId },
    maxConcurrency,
    recursionLimit: 100,
  };
}
