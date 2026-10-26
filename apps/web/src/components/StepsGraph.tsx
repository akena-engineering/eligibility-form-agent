import { Box, Text } from "@chakra-ui/react";
import {
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import type { GraphOutline } from "@efa/shared";
import { nodeStatus, type NodeStatus, type RunState } from "../run/reducer.ts";

/** Plain names for the agent's steps. */
const LABELS: Record<string, string> = {
  parseForm: "Read form",
  ingestDocuments: "Read documents",
  planFields: "Plan fields",
  extractField: "Extract",
  verifyField: "Verify",
  score: "Score",
  humanReview: "Review",
  fillPdf: "Fill PDF",
};

/** Fixed layout, left to right; the document step runs beside the form step. */
const POSITIONS: Record<string, { x: number; y: number }> = {
  parseForm: { x: 0, y: 0 },
  ingestDocuments: { x: 0, y: 70 },
  planFields: { x: 180, y: 35 },
  extractField: { x: 360, y: 35 },
  verifyField: { x: 540, y: 35 },
  score: { x: 720, y: 35 },
  humanReview: { x: 900, y: 35 },
  fillPdf: { x: 1080, y: 35 },
};

interface StepData extends Record<string, unknown> {
  label: string;
  status: NodeStatus;
  detail?: string;
}

const STATUS_STYLE: Record<
  NodeStatus,
  { border: string; bg: string; dot: string }
> = {
  idle: { border: "gray.300", bg: "white", dot: "gray.300" },
  running: { border: "blue.500", bg: "blue.50", dot: "blue.500" },
  done: { border: "green.500", bg: "white", dot: "green.500" },
  failed: { border: "red.500", bg: "red.50", dot: "red.500" },
};

function StepNode({ data }: NodeProps<Node<StepData>>) {
  const style = STATUS_STYLE[data.status];

  return (
    <Box
      w="150px"
      px="2.5"
      py="1.5"
      bg={style.bg}
      borderWidth="1px"
      borderColor={style.border}
      rounded="l2"
      fontSize="xs"
      className={data.status === "running" ? "step-running" : undefined}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ visibility: "hidden" }}
      />
      <Box display="flex" alignItems="center" gap="1.5">
        <Box w="2" h="2" rounded="full" bg={style.dot} flexShrink={0} />
        <Text fontWeight="medium" truncate>
          {data.label}
        </Text>
      </Box>
      {data.detail && (
        <Text color="gray.600" mt="0.5">
          {data.detail}
        </Text>
      )}
      <Handle
        type="source"
        position={Position.Right}
        style={{ visibility: "hidden" }}
      />
    </Box>
  );
}

const nodeTypes = { step: StepNode };

interface Props {
  outline: GraphOutline;
  state: RunState;
}

/**
 * The agent's steps, lit by events: grey, pulsing while running, green when
 * done, red on error.
 */
export function StepsGraph({ outline, state }: Props) {
  const nodes = useMemo<Node<StepData>[]>(
    () =>
      outline.nodes.map((id) => {
        // The review step is paused, not finished, while the reviewer decides.
        const waiting = id === "humanReview" && state.phase === "review";
        const status = waiting ? "running" : nodeStatus(state.nodes[id]);
        const detail =
          id === "extractField" && state.fanOut
            ? `${state.fanOut.done}/${state.fanOut.total} sections`
            : id === "humanReview" && state.phase === "review"
              ? "Waiting for you"
              : undefined;

        return {
          id,
          type: "step",
          position: POSITIONS[id] ?? { x: 0, y: 0 },
          data: { label: LABELS[id] ?? id, status, detail },
        };
      }),
    [outline, state.nodes, state.fanOut, state.phase],
  );

  const edges = useMemo<Edge[]>(
    () =>
      outline.edges.map(([source, target]) => ({
        id: `${source}-${target}`,
        source,
        target,
        // Back edges: rejected fields are extracted again; with fields still
        // open, review repeats.
        type:
          source === "humanReview" && target !== "fillPdf"
            ? "smoothstep"
            : "default",
        style: { stroke: "var(--chakra-colors-gray-400)" },
      })),
    [outline],
  );

  return (
    <Box h="150px" bg="white" borderBottomWidth="1px">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.08 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
      />
    </Box>
  );
}
