// Built from code points: the formatter rewrites \u escapes in regex literals
// as raw characters, some of which (the soft hyphen) are invisible in the
// source.
const charClass = (...codePoints: number[]) =>
  new RegExp(`[${String.fromCodePoint(...codePoints)}]`, "g");

const SINGLE_QUOTES = charClass(0x2018, 0x2019, 0x201a, 0x201b, 0x2032);
const DOUBLE_QUOTES = charClass(0x201c, 0x201d, 0x201e, 0x201f, 0x2033);
const DASHES = charClass(0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2212);
const SOFT_HYPHEN = charClass(0x00ad);
const HYPHENATED_LINE_BREAK = /(\w)-\s*\n\s*(\w)/g;

/**
 * Normalizes PDF-extracted text so a quote can be matched exactly: NFKC
 * (ligatures), straight quotes and dashes, hyphenated line breaks joined,
 * whitespace collapsed. No fuzzy matching: after normalization the quote must
 * appear as is.
 */
export function normalizeText(s: string): string {
  return s
    .normalize("NFKC")
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .replace(DASHES, "-")
    .replace(SOFT_HYPHEN, "")
    .replace(HYPHENATED_LINE_BREAK, "$1$2")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function quoteAppearsIn(quote: string, text: string): boolean {
  const q = normalizeText(quote);
  if (q.length === 0) return false;

  return normalizeText(text).includes(q);
}
