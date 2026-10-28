import type { Evidence, FieldDefinition, FieldValue } from "@efa/shared";

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const US_NUMERIC = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/;
const MONTH_FIRST = /^([a-z]+)\.? (\d{1,2}),? (\d{4})$/;
const DAY_FIRST = /^(\d{1,2}) ([a-z]+)\.? (\d{4})$/;

/** Date format tokens, case-insensitive: "MM/DD/YYYY", "dd.mm.yy". */
const TOKENS = /yyyy|yy|mm|dd/gi;
const DEFAULT_FORMAT = "MM/DD/YYYY";

/**
 * Parses common date spellings to ISO yyyy-mm-dd. Returns null when it is not a
 * date. Numeric dates are read month first ("03/04/2026" is March 4), unless
 * `dayFirst`.
 */
export function parseDate(input: string, dayFirst = false): string | null {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/(\d)(st|nd|rd|th)\b/g, "$1");

  const parts = dateParts(s, dayFirst);
  if (!parts) return null;

  const { y, m, d } = parts;
  const date = new Date(Date.UTC(y, m - 1, d));
  const real =
    m >= 1 && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  if (!real) return null;

  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function dateParts(
  s: string,
  dayFirst: boolean,
): { y: number; m: number; d: number } | null {
  let match = s.match(ISO);
  if (match) {
    return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
  }

  match = s.match(US_NUMERIC);
  if (match) {
    const year = Number(match[3]);
    const [m, d] = dayFirst ? [match[2], match[1]] : [match[1], match[2]];

    return { y: year < 100 ? year + 2000 : year, m: Number(m), d: Number(d) };
  }

  match = s.match(MONTH_FIRST);
  if (match) {
    return {
      y: Number(match[3]),
      m: monthNumber(match[1]!),
      d: Number(match[2]),
    };
  }

  match = s.match(DAY_FIRST);
  if (match) {
    return {
      y: Number(match[3]),
      m: monthNumber(match[2]!),
      d: Number(match[1]),
    };
  }

  return null;
}

function monthNumber(name: string): number {
  return MONTHS.indexOf(name.slice(0, 3)) + 1;
}

/**
 * An ISO date in the form's format. Null for a format with other tokens ("Month
 * D, YYYY").
 */
function formatDate(iso: string, format = DEFAULT_FORMAT): string | null {
  const [y, m, d] = iso.split("-") as [string, string, string];
  const parts: Record<string, string> = {
    yyyy: y,
    yy: y.slice(2),
    mm: m,
    dd: d,
  };

  const out = format.replace(TOKENS, (token) => parts[token.toLowerCase()]!);

  return /[a-z]/i.test(out) ? null : out;
}

/** "DD/MM/YYYY": numeric dates for this form are read day first. */
function isDayFirst(format: string): boolean {
  return /d.*m/i.test(format);
}

/** Canonical form of a value, used to compare what different documents say. */
function canonicalValue(
  value: FieldValue,
  field: Pick<FieldDefinition, "type" | "format">,
): string {
  if (value === null) return "";
  if (typeof value === "boolean") return value ? "true" : "false";

  if (field.type === "date") {
    const dayFirst = isDayFirst(field.format ?? DEFAULT_FORMAT);

    return parseDate(value, dayFirst) ?? value.trim().toLowerCase();
  }

  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

/** True when every document that states a value states the same one. */
export function isCrossDocConsistent(
  evidence: Evidence[],
  field: Pick<FieldDefinition, "type" | "format">,
): boolean {
  const stated = evidence.filter((e) => e.candidateValue !== null);
  const values = new Set(
    stated.map((e) => canonicalValue(e.candidateValue, field)),
  );

  return values.size <= 1;
}

/** Checks a value against the field type and its allowed options. */
export function isOptionValid(
  value: FieldValue,
  field: Pick<FieldDefinition, "type" | "options" | "format">,
): boolean {
  if (value === null) return true;

  switch (field.type) {
    case "checkbox":
      return typeof value === "boolean";
    case "radio":
    case "select":
      return typeof value === "string" && (field.options ?? []).includes(value);
    case "date": {
      const dayFirst = isDayFirst(field.format ?? DEFAULT_FORMAT);

      return typeof value === "string" && parseDate(value, dayFirst) !== null;
    }
    case "text":
      return typeof value === "string";
  }
}

/**
 * Puts a value in the shape the form expects: a date in the form's format.
 * Numeric dates are read in the order of that format, so one already written in
 * it stays the same. A date that cannot be read, or a format with tokens other
 * than YYYY, YY, MM and DD, leaves the value as it is.
 */
export function formatForField(
  value: FieldValue,
  field: Pick<FieldDefinition, "type" | "format">,
): FieldValue {
  if (typeof value !== "string") return value;

  const text = value.trim();
  if (field.type !== "date") return text;

  const format = field.format ?? DEFAULT_FORMAT;
  const iso = parseDate(text, isDayFirst(format));
  if (!iso) return text;

  return formatDate(iso, format) ?? text;
}
