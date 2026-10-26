import { Box, CloseButton, Drawer, Portal, Text } from "@chakra-ui/react";
import type { DocumentRef, Evidence } from "@efa/shared";

interface Props {
  evidence: Evidence | null;
  documents: DocumentRef[];
  onClose: () => void;
}

/**
 * The cited page with the quote highlighted, so the reviewer checks it in
 * context.
 */
export function SourceDrawer({ evidence, documents, onClose }: Props) {
  const doc = evidence
    ? documents.find((d) => d.id === evidence.docId)
    : undefined;
  const page = doc?.pages.find((p) => p.n === evidence?.page);

  return (
    <Drawer.Root
      open={evidence !== null}
      onOpenChange={(e) => !e.open && onClose()}
      size="md"
    >
      <Portal>
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content>
            <Drawer.Header borderBottomWidth="1px">
              <Box>
                <Drawer.Title fontSize="md">
                  {doc?.filename ?? "Source"}
                </Drawer.Title>
                <Text fontSize="xs" color="gray.500">
                  Page {evidence?.page}
                  {page?.source === "ocr" ? " · transcribed from a scan" : ""}
                </Text>
              </Box>
            </Drawer.Header>

            <Drawer.Body>
              {page && evidence ? (
                <QuoteInPage text={page.text} quote={evidence.quote} />
              ) : (
                <Text fontSize="sm" color="gray.500">
                  The cited page is not in the case file.
                </Text>
              )}
            </Drawer.Body>

            <Drawer.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Drawer.CloseTrigger>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}

/** The page with its own line breaks; the quote matches across them. */
function QuoteInPage({ text, quote }: { text: string; quote: string }) {
  const match = findQuote(text, quote);

  return (
    <Text
      fontFamily="mono"
      fontSize="xs"
      lineHeight="1.7"
      whiteSpace="pre-wrap"
    >
      {match ? (
        <>
          {text.slice(0, match.start)}
          <Box as="mark" bg="yellow.200" color="inherit" px="0.5" rounded="l1">
            {text.slice(match.start, match.end)}
          </Box>
          {text.slice(match.end)}
        </>
      ) : (
        text
      )}
    </Text>
  );
}

/**
 * PDF text breaks lines mid-sentence, so any run of whitespace in the quote
 * matches any other.
 */
export function findQuote(
  text: string,
  quote: string,
): { start: number; end: number } | null {
  const words = quote.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const match = new RegExp(escaped.join("\\s+"), "i").exec(text);

  return match
    ? { start: match.index, end: match.index + match[0].length }
    : null;
}
