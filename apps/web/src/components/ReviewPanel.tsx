import {
  Box,
  Button,
  Collapsible,
  Flex,
  Heading,
  Progress,
  Stack,
  Text,
} from "@chakra-ui/react";
import type {
  DocumentRef,
  Evidence,
  FieldDefinition,
  FieldProposal,
  ReviewDecision,
} from "@efa/shared";
import { useMemo, useState } from "react";
import {
  ACCEPT_ALL_THRESHOLD,
  acceptableAbove,
  completeness,
  rejectedCount,
  undecided,
  type Decisions,
} from "../run/decisions.ts";
import { FieldCard, formatValue } from "./FieldCard.tsx";
import { SourceDrawer } from "./SourceDrawer.tsx";

interface Props {
  fields: FieldDefinition[];
  proposals: Record<string, FieldProposal>;
  documents: DocumentRef[];
  decisions: Decisions;
  /** False while the agent re-runs rejected fields or fills the PDF. */
  editable: boolean;
  /** Why the last batch was not accepted. */
  error: string | null;
  onDecisionsChange: (decisions: Decisions) => void;
  onSubmit: (decisions: ReviewDecision[]) => void;
}

/**
 * Every field, grouped by form section, with a sticky header for completeness
 * and the actions.
 */
export function ReviewPanel(props: Props) {
  const { fields, proposals, decisions, editable } = props;
  const [source, setSource] = useState<Evidence | null>(null);

  const documents = useMemo(
    () => new Map(props.documents.map((d) => [d.id, d])),
    [props.documents],
  );
  const sections = useMemo(
    () => Map.groupBy(fields, (f) => f.section),
    [fields],
  );

  const progress = completeness(fields, proposals, decisions);
  const percent = progress.total
    ? Math.round((progress.done / progress.total) * 100)
    : 0;
  const pending = undecided(fields, proposals, decisions).length;
  const rejected = rejectedCount(decisions);
  const acceptable = acceptableAbove(proposals, decisions);
  const canGenerate = editable && pending === 0 && rejected === 0;

  const decide = (fieldId: string, decision: ReviewDecision | null) => {
    const next = { ...decisions };
    if (decision) next[fieldId] = decision;
    else delete next[fieldId];

    props.onDecisionsChange(next);
  };

  const acceptAll = () => {
    const next = { ...decisions };
    for (const fieldId of acceptable)
      next[fieldId] = { fieldId, action: "accept" };

    props.onDecisionsChange(next);
  };

  const submit = () => props.onSubmit(Object.values(decisions));

  return (
    <Box>
      <Flex
        position="sticky"
        top="0"
        zIndex="1"
        bg="white"
        borderBottomWidth="1px"
        px="4"
        py="2.5"
        gap="4"
        align="center"
        wrap="wrap"
      >
        <Box minW="220px">
          <Text fontSize="sm" fontWeight="medium">
            {progress.done} of {progress.total} fields, {percent}%
          </Text>
          <Progress.Root value={percent} size="xs" colorPalette="blue" mt="1">
            <Progress.Track>
              <Progress.Range />
            </Progress.Track>
          </Progress.Root>
          <Text fontSize="2xs" color="gray.500" mt="1">
            Accepted or edited values, out of fields that need one. {pending}{" "}
            still undecided.
          </Text>
        </Box>

        <Flex gap="2" ml="auto">
          <Button
            size="sm"
            variant="outline"
            disabled={!editable || acceptable.length === 0}
            onClick={acceptAll}
          >
            Accept all ≥{ACCEPT_ALL_THRESHOLD}% ({acceptable.length})
          </Button>
          <Button
            size="sm"
            variant="outline"
            colorPalette="red"
            disabled={!editable || rejected === 0}
            onClick={submit}
          >
            Re-run rejected ({rejected})
          </Button>
          <Button
            size="sm"
            colorPalette="blue"
            disabled={!canGenerate}
            onClick={submit}
          >
            Generate PDF
          </Button>
        </Flex>

        {props.error && (
          <Text w="full" fontSize="xs" color="red.600">
            Not sent: {props.error}
          </Text>
        )}
      </Flex>

      <Stack gap="6" p="4">
        {[...sections.entries()].map(([section, sectionFields]) => (
          <Section
            key={section}
            title={section}
            fields={sectionFields}
            proposals={proposals}
            decisions={decisions}
            documents={documents}
            readOnly={!editable}
            onDecide={decide}
            onShowSource={setSource}
          />
        ))}
      </Stack>

      <SourceDrawer
        evidence={source}
        documents={props.documents}
        onClose={() => setSource(null)}
      />
    </Box>
  );
}

function Section(props: {
  title: string;
  fields: FieldDefinition[];
  proposals: Record<string, FieldProposal>;
  decisions: Decisions;
  documents: Map<string, DocumentRef>;
  readOnly: boolean;
  onDecide: (fieldId: string, decision: ReviewDecision | null) => void;
  onShowSource: (evidence: Evidence) => void;
}) {
  const withProposal = props.fields.flatMap((f) => {
    const proposal = props.proposals[f.id];

    return proposal ? [{ field: f, proposal }] : [];
  });

  const shown = withProposal.filter(
    (x) => x.proposal.status !== "not_applicable",
  );
  const hidden = withProposal.filter(
    (x) => x.proposal.status === "not_applicable",
  );

  return (
    <Stack gap="2">
      <Flex align="baseline" gap="3">
        <Heading size="sm">{props.title}</Heading>
        <Text fontSize="xs" color="gray.500">
          {shown.length} to review
          {hidden.length ? `, ${hidden.length} not applicable` : ""}
        </Text>
      </Flex>

      {shown.map(({ field, proposal }) => (
        <FieldCard
          key={field.id}
          field={field}
          proposal={proposal}
          decision={props.decisions[field.id]}
          documents={props.documents}
          readOnly={props.readOnly}
          onDecide={(d) => props.onDecide(field.id, d)}
          onShowSource={props.onShowSource}
        />
      ))}

      {hidden.length > 0 && <NotApplicable items={hidden} />}
    </Stack>
  );
}

/**
 * Boxes that do not apply to this person: left unchecked, listed for checking,
 * collapsed.
 */
function NotApplicable({
  items,
}: {
  items: { field: FieldDefinition; proposal: FieldProposal }[];
}) {
  return (
    <Collapsible.Root>
      <Collapsible.Trigger asChild>
        <Button size="xs" variant="ghost" alignSelf="start">
          Show {items.length} not applicable
        </Button>
      </Collapsible.Trigger>
      <Collapsible.Content>
        <Stack gap="0" borderWidth="1px" rounded="l2" bg="white" fontSize="xs">
          {items.map(({ field, proposal }) => (
            <Flex
              key={field.id}
              px="3"
              py="1.5"
              gap="3"
              borderBottomWidth="1px"
              _last={{ borderBottomWidth: 0 }}
            >
              <Text flex="1">{field.label}</Text>
              <Text color="gray.500">{formatValue(proposal.value)}</Text>
            </Flex>
          ))}
        </Stack>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
