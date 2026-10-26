/**
 * Staff-only fields, filled by the reviewer only: signatures, the eligibility
 * decision itself, verifications staff perform, and judgement calls such as
 * "unlikely to return to a previous industry". Enforced in code; the model's
 * humanOnly flag can only add fields to this set, never remove them.
 */
const PATTERNS: RegExp[] = [
  /\bsignature\b|\bsigned by\b|\bsign here\b/i,
  /\beligibility determination\b|\bdate of determination\b|\bfinal determination\b/i,
  /\b(in)?eligible\b.*\b(decision|determined by|approved)\b/i,
  /\bapprov(ed|al)\b/i,
  /\bstaff\b|\bofficial use\b|\bfor office use\b|\bcase ?worker\b|\bcounselor\b/i,
  /\b(tele)?phone verification\b/i,
  // Program-specific judgement calls.
  /\bunlikely to return\b/i,
];

/**
 * Only the start of a label names the field; long labels quote rules that
 * mention these words.
 */
const LABEL_HEAD = 100;

export function isHumanOnlyByRule(label: string): boolean {
  const head = label.slice(0, LABEL_HEAD);

  return PATTERNS.some((p) => p.test(head));
}
