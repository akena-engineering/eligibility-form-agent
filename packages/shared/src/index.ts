import { z } from "zod";

// ---------- Form fields ----------

export const FieldType = z.enum([
  "text",
  "date",
  "checkbox",
  "radio",
  "select",
]);
export type FieldType = z.infer<typeof FieldType>;

/**
 * The box a value is drawn into on a PDF without form fields (PDF points,
 * origin bottom-left).
 */
export const Placement = z.object({
  page: z.number().int().min(1),
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});
export type Placement = z.infer<typeof Placement>;

/** A field as found in the PDF, before the model labels it. */
export const FieldCandidate = z.object({
  id: z.string(),
  type: FieldType,
  rawLabel: z.string(),
  page: z.number().int().min(1),
  options: z.array(z.string()).optional(),
  maxLength: z.number().int().positive().optional(),
  /** AcroForm field name. Set when the PDF has real form fields. */
  pdfFieldName: z.string().optional(),
  /**
   * Set for PDFs without form fields: where a vision model found the field on
   * the page image.
   */
  placement: Placement.optional(),
});
export type FieldCandidate = z.infer<typeof FieldCandidate>;

export const FieldDefinition = FieldCandidate.extend({
  label: z.string(),
  section: z.string(),
  /** What proves it, e.g. "Proof of address". */
  evidenceHint: z.string(),
  /** Date format the form expects, e.g. "MM/DD/YYYY". */
  format: z.string().optional(),
  /** Staff only: filled by the reviewer, never by the agent. */
  humanOnly: z.boolean(),
});
export type FieldDefinition = z.infer<typeof FieldDefinition>;

// ---------- Documents ----------

export const DocumentPage = z.object({
  n: z.number().int().min(1),
  text: z.string(),
  source: z.enum(["text", "ocr"]),
});
export type DocumentPage = z.infer<typeof DocumentPage>;

export const DocumentRef = z.object({
  id: z.string(),
  filename: z.string(),
  pages: z.array(DocumentPage),
});
export type DocumentRef = z.infer<typeof DocumentRef>;

// ---------- Proposals ----------

export const FieldValue = z.union([z.string(), z.boolean(), z.null()]);
export type FieldValue = z.infer<typeof FieldValue>;

export const Evidence = z.object({
  docId: z.string(),
  page: z.number().int().min(1),
  quote: z.string(),
  /**
   * The value this document alone supports. Used for the cross-document check.
   */
  candidateValue: FieldValue,
});
export type Evidence = z.infer<typeof Evidence>;

export const ProposalStatus = z.enum([
  "found",
  "missing",
  "conflict",
  "needs_human",
  /**
   * Checkbox that does not apply to this person. Left unchecked, needs no
   * evidence.
   */
  "not_applicable",
]);
export type ProposalStatus = z.infer<typeof ProposalStatus>;

export const SelfRating = z.enum(["high", "medium", "low"]);
export type SelfRating = z.infer<typeof SelfRating>;

export const Checks = z.object({
  quoteVerbatim: z.boolean(),
  verifierAgrees: z.boolean().nullable(),
  crossDocConsistent: z.boolean(),
  optionValid: z.boolean(),
});
export type Checks = z.infer<typeof Checks>;

export const FieldProposal = z.object({
  fieldId: z.string(),
  value: FieldValue,
  status: ProposalStatus,
  evidence: z.array(Evidence),
  reasoning: z.string(),
  selfRating: SelfRating.nullable(),
  confidence: z.number().min(0).max(100).nullable(),
  checks: Checks,
  attempt: z.number().int().min(1),
});
export type FieldProposal = z.infer<typeof FieldProposal>;

// ---------- Review ----------

export const ReviewDecision = z
  .object({
    fieldId: z.string(),
    action: z.enum(["accept", "edit", "reject"]),
    value: FieldValue.optional(),
    note: z.string().max(1000).optional(),
  })
  .refine((d) => d.action !== "edit" || d.value !== undefined, {
    message: "An edit needs a value",
    path: ["value"],
  });
export type ReviewDecision = z.infer<typeof ReviewDecision>;

export const ReviewDecisions = z.array(ReviewDecision);

export const Completeness = z.object({
  done: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type Completeness = z.infer<typeof Completeness>;

// ---------- Run events (SSE payload) ----------

const base = { seq: z.number().int().nonnegative() };

export const RunEvent = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("node_started"),
    node: z.string(),
    detail: z.string().optional(),
  }),
  z.object({ ...base, type: z.literal("node_finished"), node: z.string() }),
  z.object({
    ...base,
    type: z.literal("fan_out"),
    node: z.string(),
    done: z.number().int(),
    total: z.number().int(),
  }),
  z.object({
    ...base,
    type: z.literal("field_proposed"),
    proposal: FieldProposal,
  }),
  z.object({
    ...base,
    type: z.literal("review_required"),
    fields: z.array(FieldDefinition),
    proposals: z.array(FieldProposal),
    completeness: Completeness,
    /** With page text, so the UI can show a quote in its document. */
    documents: z.array(DocumentRef),
  }),
  z.object({ ...base, type: z.literal("pdf_ready") }),
  z.object({
    ...base,
    type: z.literal("error"),
    message: z.string(),
    node: z.string().optional(),
  }),
]);
export type RunEvent = z.infer<typeof RunEvent>;

/** An event before the API stamps it with a sequence number. */
export type AgentEvent = RunEvent extends infer E
  ? E extends RunEvent
    ? Omit<E, "seq">
    : never
  : never;

// ---------- HTTP API ----------

/** The agent's steps and their order, for the UI's step view. */
export const GraphOutline = z.object({
  nodes: z.array(z.string()),
  edges: z.array(z.tuple([z.string(), z.string()])),
});
export type GraphOutline = z.infer<typeof GraphOutline>;

export const RunStatus = z.enum([
  "running",
  "awaiting_review",
  "finished",
  "failed",
]);
export type RunStatus = z.infer<typeof RunStatus>;

/** POST /api/runs. */
export const StartRunResponse = z.object({
  runId: z.uuid(),
  graph: GraphOutline,
});
export type StartRunResponse = z.infer<typeof StartRunResponse>;

/**
 * Any 4xx/5xx body. NestJS sends `message` as a string, or a list for some
 * built-in errors.
 */
export const ApiError = z.object({
  message: z.union([z.string(), z.array(z.string())]).optional(),
  issues: z.array(z.unknown()).optional(),
});
export type ApiError = z.infer<typeof ApiError>;
