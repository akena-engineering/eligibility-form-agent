import { describe, expect, it } from "vitest";
import { FieldProposal, ReviewDecision, RunEvent } from "../src/index.ts";

describe("shared", () => {
  it("requires a value for an edit", () => {
    expect(
      ReviewDecision.safeParse({ fieldId: "a", action: "edit" }).success,
    ).toBe(false);
    expect(
      ReviewDecision.safeParse({ fieldId: "a", action: "edit", value: "x" })
        .success,
    ).toBe(true);
    expect(
      ReviewDecision.safeParse({ fieldId: "a", action: "accept" }).success,
    ).toBe(true);
  });

  it("keeps confidence within 0-100", () => {
    const proposal = {
      fieldId: "a",
      value: "x",
      status: "found",
      evidence: [],
      reasoning: "",
      selfRating: "high",
      confidence: 101,
      checks: {
        quoteVerbatim: true,
        verifierAgrees: true,
        crossDocConsistent: true,
        optionValid: true,
      },
      attempt: 1,
    };
    expect(FieldProposal.safeParse(proposal).success).toBe(false);
    expect(
      FieldProposal.safeParse({ ...proposal, confidence: 95 }).success,
    ).toBe(true);
  });

  it("parses run events by type", () => {
    expect(
      RunEvent.parse({ seq: 1, type: "node_started", node: "parseForm" }).type,
    ).toBe("node_started");
    expect(RunEvent.safeParse({ seq: 1, type: "node_started" }).success).toBe(
      false,
    );
    expect(RunEvent.safeParse({ seq: 1, type: "unknown" }).success).toBe(false);
  });
});
