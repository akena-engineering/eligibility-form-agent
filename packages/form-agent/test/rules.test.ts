import type { DocumentRef, FieldDefinition, FieldProposal } from "@efa/shared";
import { describe, expect, it } from "vitest";
import { checkDeterministic } from "../src/nodes/verify-field.ts";
import { emptyChecks } from "../src/proposals.ts";
import {
  CAPS,
  completeness,
  confidence,
  undecided,
} from "../src/rules/confidence.ts";
import { isHumanOnlyByRule } from "../src/rules/human-only.ts";
import { normalizeText, quoteAppearsIn } from "../src/rules/quote.ts";
import {
  formatForField,
  isCrossDocConsistent,
  isOptionValid,
  parseDate,
} from "../src/rules/values.ts";

const ok = {
  quoteVerbatim: true,
  verifierAgrees: true,
  crossDocConsistent: true,
  optionValid: true,
};

describe("confidence", () => {
  it("starts from the self-rating", () => {
    expect(
      confidence({ status: "found", selfRating: "high", checks: ok }),
    ).toBe(95);
    expect(
      confidence({ status: "found", selfRating: "medium", checks: ok }),
    ).toBe(75);
    expect(confidence({ status: "found", selfRating: "low", checks: ok })).toBe(
      50,
    );
  });

  it.each([
    ["quote not verbatim", { quoteVerbatim: false }, CAPS.quoteNotVerbatim],
    ["verifier disagrees", { verifierAgrees: false }, CAPS.verifierDisagrees],
    ["documents conflict", { crossDocConsistent: false }, CAPS.conflict],
    ["invalid option", { optionValid: false }, CAPS.invalidOption],
  ])("caps when %s", (_, failed, cap) => {
    expect(
      confidence({
        status: "found",
        selfRating: "high",
        checks: { ...ok, ...failed },
      }),
    ).toBe(cap);
  });

  it("caps a conflict status even if the check passed", () => {
    expect(
      confidence({ status: "conflict", selfRating: "high", checks: ok }),
    ).toBe(CAPS.conflict);
  });

  it("applies the lowest cap when several fail", () => {
    const checks = { ...ok, verifierAgrees: false, quoteVerbatim: false };
    expect(confidence({ status: "found", selfRating: "high", checks })).toBe(
      30,
    );
  });

  it.each(["missing", "needs_human", "not_applicable"] as const)(
    "gives no score when %s",
    (status) => {
      expect(confidence({ status, selfRating: "high", checks: ok })).toBeNull();
    },
  );
});

describe("completeness", () => {
  const field = (id: string) => ({ id }) as FieldDefinition;
  const proposal = (
    fieldId: string,
    status: FieldProposal["status"],
    value: FieldProposal["value"],
  ) => ({ fieldId, status, value }) as FieldProposal;

  it("counts accepted or edited values over fields that need one", () => {
    const fields = [field("a"), field("b"), field("c"), field("d")];
    const proposals = {
      a: proposal("a", "found", "x"),
      b: proposal("b", "missing", null),
      c: proposal("c", "not_applicable", false),
      d: proposal("d", "found", "y"),
    };
    const decisions = {
      a: { fieldId: "a", action: "accept" as const },
      b: { fieldId: "b", action: "accept" as const },
      d: { fieldId: "d", action: "edit" as const, value: "z" },
    };
    expect(completeness(fields, proposals, decisions)).toEqual({
      done: 2,
      total: 3,
    });
  });

  it("lists agent fields without a decision, not staff-only or not-applicable ones", () => {
    const fields = [
      field("a"),
      field("b"),
      { id: "c", humanOnly: true } as FieldDefinition,
      field("d"),
    ];
    const proposals = {
      a: proposal("a", "found", "x"),
      b: proposal("b", "not_applicable", false),
      c: proposal("c", "needs_human", null),
      d: proposal("d", "missing", null),
    };
    const decisions = { a: { fieldId: "a", action: "accept" as const } };

    expect(undecided(fields, proposals, decisions).map((f) => f.id)).toEqual([
      "d",
    ]);
  });
});

describe("verbatim quote check", () => {
  it("joins hyphenated line breaks and collapses whitespace", () => {
    expect(
      quoteAppearsIn("reduction in force", "a reduc-\ntion   in\nforce"),
    ).toBe(true);
  });

  it("handles ligatures, curly quotes and dashes", () => {
    expect(normalizeText("ﬁled the “claim” – today")).toBe(
      normalizeText('filed the "claim" - today'),
    );
    expect(quoteAppearsIn("applicant's", "the applicant’s record")).toBe(true);
  });

  it("does not match paraphrases or empty quotes", () => {
    expect(
      quoteAppearsIn(
        "last day was August 14",
        "Her last day of work was August 14, 2026.",
      ),
    ).toBe(false);
    expect(quoteAppearsIn("  ", "anything")).toBe(false);
  });
});

describe("values", () => {
  it.each([
    ["08/14/2026", "2026-08-14"],
    ["8/14/26", "2026-08-14"],
    ["2026-08-14", "2026-08-14"],
    ["August 14, 2026", "2026-08-14"],
    ["14 Aug 2026", "2026-08-14"],
    ["Aug. 14th, 2026", "2026-08-14"],
  ])("parses %s", (input, iso) => {
    expect(parseDate(input)).toBe(iso);
  });

  it("rejects impossible dates", () => {
    expect(parseDate("02/30/2026")).toBeNull();
    expect(parseDate("soon")).toBeNull();
  });

  it.each([
    ["August 14, 2026", "MM/DD/YYYY", "08/14/2026"],
    ["2026-08-14", "dd.mm.yy", "14.08.26"],
    ["08/14/2026", "YYYY-MM-DD", "2026-08-14"],
    // Already in the form's format: read day first, so it stays the same.
    ["03/04/2026", "DD/MM/YYYY", "03/04/2026"],
    ["14/08/2026", "DD/MM/YYYY", "14/08/2026"],
    // A format with other tokens is not understood: the value is left as it is.
    ["08/14/2026", "Month D, YYYY", "08/14/2026"],
    ["soon", "MM/DD/YYYY", "soon"],
  ])("formats %s for %s as %s", (value, format, expected) => {
    expect(formatForField(value, { type: "date", format })).toBe(expected);
  });

  it("formats only date fields", () => {
    expect(
      formatForField(" 08/14/2026 ", { type: "text", format: "DD/MM/YYYY" }),
    ).toBe("08/14/2026");
  });

  it("reads numeric dates in the form's order", () => {
    expect(
      isOptionValid("14/08/2026", { type: "date", format: "DD/MM/YYYY" }),
    ).toBe(true);
    expect(
      isOptionValid("14/08/2026", { type: "date", format: "MM/DD/YYYY" }),
    ).toBe(false);
  });

  it("treats the same date in different spellings as consistent", () => {
    const evidence = [
      { docId: "d1", page: 1, quote: "q", candidateValue: "August 14, 2026" },
      { docId: "d2", page: 1, quote: "q", candidateValue: "08/14/2026" },
    ];
    expect(isCrossDocConsistent(evidence, { type: "date" })).toBe(true);
    expect(
      isCrossDocConsistent(
        [
          ...evidence,
          { docId: "d3", page: 1, quote: "q", candidateValue: "09/26/2026" },
        ],
        {
          type: "date",
        },
      ),
    ).toBe(false);
  });

  it("reads numeric dates day first on a day-first form", () => {
    const evidence = [
      { docId: "d1", page: 1, quote: "q", candidateValue: "03/04/2026" },
      { docId: "d2", page: 1, quote: "q", candidateValue: "3 April 2026" },
    ];

    expect(
      isCrossDocConsistent(evidence, { type: "date", format: "DD/MM/YYYY" }),
    ).toBe(true);
  });

  it("validates options and types", () => {
    expect(
      isOptionValid("Yes", { type: "radio", options: ["Yes", "No"] }),
    ).toBe(true);
    expect(
      isOptionValid("Maybe", { type: "radio", options: ["Yes", "No"] }),
    ).toBe(false);
    expect(isOptionValid("true", { type: "checkbox" })).toBe(false);
    expect(isOptionValid(true, { type: "checkbox" })).toBe(true);
  });
});

describe("staff-only rule", () => {
  it.each([
    "Staff completing form",
    "Date of eligibility determination",
    "Applicant signature",
    "3. Is unlikely to return to a previous industry or occupation",
    "Telephone verification by last employer (with name, position, and date of contact)",
    "Applicant_Signature1",
    "DateOfDetermination",
  ])("marks %s", (label) => {
    expect(isHumanOnlyByRule(label)).toBe(true);
  });

  it.each([
    "Name",
    "Notice of Layoff",
    "At least 18 years old",
    "Monetary determination document PLUS layoff notice",
  ])("leaves %s to the agent", (label) => {
    expect(isHumanOnlyByRule(label)).toBe(false);
  });

  it("ignores rule words deep inside a long description", () => {
    const filler = "a separating service member qualifies ".repeat(4);
    const label = `Special Veteran's Criterion: ${filler} unlikely to return`;

    expect(isHumanOnlyByRule(label)).toBe(false);
  });
});

describe("deterministic verification", () => {
  const documents: DocumentRef[] = [
    {
      id: "d1",
      filename: "intake.pdf",
      pages: [
        { n: 1, text: "Intake note" },
        {
          n: 2,
          text: "She says her last day worked was September 26, 2026.",
        },
      ],
    },
    {
      id: "d2",
      filename: "notice.pdf",
      pages: [
        {
          n: 1,
          text: "Your last day of employment will be September 30, 2026.",
        },
      ],
    },
  ];
  const field = {
    id: "f",
    type: "date",
    format: "MM/DD/YYYY",
  } as FieldDefinition;
  const draft = (evidence: FieldProposal["evidence"]): FieldProposal => ({
    fieldId: "f",
    value: "September 30, 2026",
    status: "found",
    evidence,
    reasoning: "",
    selfRating: "high",
    confidence: null,
    checks: emptyChecks(),
    attempt: 1,
  });

  it("corrects a citation to the page where the quote is", () => {
    const out = checkDeterministic(
      draft([
        {
          docId: "d1",
          page: 1,
          quote: "her last day worked was September 26, 2026",
          candidateValue: null,
        },
      ]),
      field,
      documents,
    );
    expect(out.checks.quoteVerbatim).toBe(true);
    expect(out.evidence[0]?.page).toBe(2);
    expect(out.value).toBe("09/30/2026");
  });

  it("fails a quote that is not in the document", () => {
    const out = checkDeterministic(
      draft([
        {
          docId: "d2",
          page: 1,
          quote: "last day was September 30",
          candidateValue: "09/30/2026",
        },
      ]),
      field,
      documents,
    );
    expect(out.checks.quoteVerbatim).toBe(false);
  });

  it("marks a conflict when documents state different dates", () => {
    const out = checkDeterministic(
      draft([
        {
          docId: "d1",
          page: 2,
          quote: "her last day worked was September 26, 2026",
          candidateValue: "09/26/2026",
        },
        {
          docId: "d2",
          page: 1,
          quote: "will be September 30, 2026",
          candidateValue: "September 30, 2026",
        },
      ]),
      field,
      documents,
    );
    expect(out.status).toBe("conflict");
    expect(out.checks.crossDocConsistent).toBe(false);
    expect(confidence(out)).toBeLessThanOrEqual(40);
  });
});
