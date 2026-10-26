import type { FieldDefinition, FieldProposal, RunEvent } from "@efa/shared";
import { describe, expect, it } from "vitest";
import {
  acceptableAbove,
  completeness,
  rejectedCount,
  undecided,
  withoutRejects,
  type Decisions,
} from "./decisions.ts";
import {
  initialRunState,
  nodeStatus,
  runReducer,
  type RunState,
} from "./reducer.ts";

function apply(state: RunState, ...events: RunEvent[]): RunState {
  return events.reduce(
    (s, event) => runReducer(s, { type: "event", event }),
    state,
  );
}

describe("runReducer", () => {
  it("ignores events it has already applied (EventSource replay)", () => {
    const started: RunEvent = {
      seq: 1,
      type: "node_started",
      node: "parseForm",
    };
    const finished: RunEvent = {
      seq: 2,
      type: "node_finished",
      node: "parseForm",
    };

    const once = apply(initialRunState, started, finished);
    const replayed = apply(once, started, finished);

    expect(replayed).toBe(once);
    expect(once.nodes.parseForm).toEqual({
      started: 1,
      finished: 1,
      failed: false,
    });
  });

  it("tracks parallel branches of one node", () => {
    const state = apply(
      initialRunState,
      { seq: 1, type: "node_started", node: "extractField" },
      { seq: 2, type: "node_started", node: "extractField" },
      { seq: 3, type: "node_finished", node: "extractField" },
    );
    expect(nodeStatus(state.nodes.extractField)).toBe("running");

    const after = apply(state, {
      seq: 4,
      type: "node_finished",
      node: "extractField",
    });
    expect(nodeStatus(after.nodes.extractField)).toBe("done");
  });

  it("enters review with the fields, proposals and documents", () => {
    const state = apply(initialRunState, {
      seq: 1,
      type: "review_required",
      fields: [],
      proposals: [],
      completeness: { done: 0, total: 0 },
      documents: [],
    });

    expect(state.phase).toBe("review");
    expect(state.review).toEqual({ fields: [], documents: [] });
  });

  it("marks the failing node and the run", () => {
    const state = apply(initialRunState, {
      seq: 1,
      type: "error",
      node: "planFields",
      message: "boom",
    });

    expect(state.phase).toBe("failed");
    expect(state.error).toBe("boom");
    expect(nodeStatus(state.nodes.planFields)).toBe("failed");
  });
});

const field = (id: string) => ({ id }) as FieldDefinition;
const proposal = (
  fieldId: string,
  status: FieldProposal["status"],
  confidence: number | null,
  value: FieldProposal["value"] = "x",
) => ({ fieldId, status, confidence, value }) as FieldProposal;

describe("decisions", () => {
  const fields = [field("a"), field("b"), field("c"), field("d")];
  const proposals = {
    a: proposal("a", "found", 95),
    b: proposal("b", "found", 75),
    c: proposal("c", "not_applicable", null, false),
    d: proposal("d", "missing", null, null),
  };

  it("counts completeness like the agent", () => {
    const decisions: Decisions = {
      a: { fieldId: "a", action: "accept" },
      d: { fieldId: "d", action: "accept" },
    };

    // d was accepted empty: decided, but it has no value.
    expect(completeness(fields, proposals, decisions)).toEqual({
      done: 1,
      total: 3,
    });
    expect(undecided(fields, proposals, decisions).map((f) => f.id)).toEqual([
      "b",
    ]);
  });

  it("does not wait on fields the review does not show", () => {
    // e has no proposal, so it has no card and cannot block the PDF.
    const all = [...fields, field("e")];

    expect(undecided(all, proposals, {}).map((f) => f.id)).toEqual([
      "a",
      "b",
      "d",
    ]);
  });

  it("offers only high-confidence found values for Accept all", () => {
    expect(acceptableAbove(proposals, {})).toEqual(["a"]);
    expect(
      acceptableAbove(proposals, {
        a: { fieldId: "a", action: "reject", note: "" },
      }),
    ).toEqual([]);
  });

  it("drops rejects once they are sent", () => {
    const decisions: Decisions = {
      a: { fieldId: "a", action: "accept" },
      b: { fieldId: "b", action: "reject", note: "wrong" },
    };

    expect(rejectedCount(decisions)).toBe(1);
    expect(Object.keys(withoutRejects(decisions))).toEqual(["a"]);
  });
});

describe("findQuote", () => {
  it("matches a quote across the page's line breaks", async () => {
    const { findQuote } = await import("../components/SourceDrawer.tsx");
    const text = "Her last day of\nwork was August 14, 2026. She did not quit.";

    const match = findQuote(text, "last day of work was August 14, 2026.");
    expect(match && text.slice(match.start, match.end)).toBe(
      "last day of\nwork was August 14, 2026.",
    );
    expect(findQuote(text, "not in the page")).toBeNull();
  });
});

describe("contract checks at the boundary", () => {
  it("parses a valid event and rejects malformed ones", async () => {
    const { parseEvent } = await import("./use-run.ts");

    expect(
      parseEvent('{"seq":1,"type":"node_started","node":"parseForm"}'),
    ).toMatchObject({
      type: "node_started",
    });
    expect(parseEvent('{"seq":1,"type":"node_started"}')).toBeNull();
    expect(parseEvent("not json")).toBeNull();
  });

  it("parses responses with their schema and surfaces API errors", async () => {
    const { parse } = await import("../api.ts");
    const { StartRunResponse } = await import("@efa/shared");
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });

    const ok = {
      runId: "2d092ca5-087f-4a29-a790-240fe30a8f6a",
      graph: { nodes: ["parseForm"], edges: [] },
    };
    await expect(parse(json(ok), StartRunResponse)).resolves.toEqual(ok);

    await expect(
      parse(json({ runId: "nope" }), StartRunResponse),
    ).rejects.toThrow(/Unexpected response/);
    await expect(
      parse(json({ message: "Run is running" }, 409), StartRunResponse),
    ).rejects.toThrow("Run is running");
  });
});
