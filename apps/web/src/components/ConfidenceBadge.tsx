import { Badge, Box, Stack, Text, Tooltip } from "@chakra-ui/react";
import type { FieldProposal } from "@efa/shared";

/** Green from 85, amber from 60, red below. */
export function confidenceColor(
  confidence: number,
): "green" | "orange" | "red" {
  if (confidence >= 85) return "green";
  if (confidence >= 60) return "orange";

  return "red";
}

const CHECKS: { key: keyof FieldProposal["checks"]; label: string }[] = [
  { key: "quoteVerbatim", label: "Quote found word for word" },
  { key: "verifierAgrees", label: "Second model agrees" },
  { key: "crossDocConsistent", label: "Documents agree" },
  { key: "optionValid", label: "Valid value for the field" },
];

/** The score with the checks behind it, so a number always has a reason. */
export function ConfidenceBadge({ proposal }: { proposal: FieldProposal }) {
  if (proposal.confidence === null) return null;

  return (
    <Tooltip.Root openDelay={150} positioning={{ placement: "bottom-start" }}>
      <Tooltip.Trigger asChild>
        <Badge
          colorPalette={confidenceColor(proposal.confidence)}
          variant="subtle"
          fontFamily="mono"
          cursor="help"
        >
          {proposal.confidence}%
        </Badge>
      </Tooltip.Trigger>
      <Tooltip.Positioner>
        <Tooltip.Content maxW="280px">
          <Stack gap="1" fontSize="xs">
            <Text>Self-rating: {proposal.selfRating ?? "none"}</Text>
            {CHECKS.map(({ key, label }) => (
              <Box
                key={key}
                display="flex"
                justifyContent="space-between"
                gap="4"
              >
                <Text>{label}</Text>
                <Text fontWeight="medium">
                  {checkText(proposal.checks[key])}
                </Text>
              </Box>
            ))}
            <Text color="gray.300" mt="1">
              Each failed check caps the score. The caps are a heuristic.
            </Text>
          </Stack>
        </Tooltip.Content>
      </Tooltip.Positioner>
    </Tooltip.Root>
  );
}

function checkText(value: boolean | null): string {
  if (value === null) return "Not checked";

  return value ? "Pass" : "Fail";
}
