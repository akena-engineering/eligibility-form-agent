import {
  Badge,
  Box,
  Button,
  Flex,
  Grid,
  Input,
  NativeSelect,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import type {
  DocumentRef,
  Evidence,
  FieldDefinition,
  FieldProposal,
  FieldValue,
  ReviewDecision,
} from "@efa/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ConfidenceBadge } from "./ConfidenceBadge.tsx";

interface Props {
  field: FieldDefinition;
  proposal: FieldProposal;
  decision: ReviewDecision | undefined;
  documents: Map<string, DocumentRef>;
  readOnly: boolean;
  onDecide: (decision: ReviewDecision | null) => void;
  onShowSource: (evidence: Evidence) => void;
}

type Mode = "view" | "edit" | "reject";

const DECISION_BORDER: Record<ReviewDecision["action"], string> = {
  accept: "green.500",
  edit: "blue.500",
  reject: "red.500",
};

/**
 * One field: proposed value, confidence, sources, and the reviewer's Accept /
 * Edit / Reject.
 */
export function FieldCard(props: Props) {
  const { field, proposal, decision, readOnly } = props;
  const [mode, setMode] = useState<Mode>("view");

  const staffOnly = proposal.status === "needs_human";
  const empty = proposal.value === null;
  const border = decision ? DECISION_BORDER[decision.action] : "gray.200";

  const decide = (next: ReviewDecision | null) => {
    props.onDecide(next);
    setMode("view");
  };

  return (
    <Grid
      data-field-id={field.id}
      templateColumns="minmax(0, 1fr) auto"
      columnGap="4"
      bg="white"
      borderWidth="1px"
      borderStyle={empty && !decision ? "dashed" : "solid"}
      borderLeftWidth="3px"
      borderLeftColor={border}
      rounded="l2"
      px="3"
      py="2"
    >
      {/* Left: what the agent proposes and why. */}
      <Box minW="0">
        <Flex gap="2" align="baseline" wrap="wrap">
          <Text fontSize="sm" fontWeight="medium">
            {field.label}
          </Text>
          <Text fontSize="2xs" color="gray.400" fontFamily="mono">
            {field.id}
          </Text>
        </Flex>

        <Grid
          templateColumns="96px minmax(0, 1fr)"
          columnGap="2"
          rowGap="1"
          mt="1"
          fontSize="xs"
        >
          <Text color="gray.500">Proposed value</Text>
          <Text
            fontSize="sm"
            fontWeight={empty ? "normal" : "medium"}
            color={empty ? "gray.500" : undefined}
          >
            {formatValue(proposal.value)}
          </Text>

          {proposal.evidence.length > 0 && (
            <>
              <Text color="gray.500">Source</Text>
              <Flex gap="1.5" wrap="wrap">
                {proposal.evidence.map((e, i) => (
                  <SourceChip
                    key={`${e.docId}-${e.page}-${i}`}
                    evidence={e}
                    filename={props.documents.get(e.docId)?.filename ?? e.docId}
                    showValue={proposal.status === "conflict"}
                    onClick={() => props.onShowSource(e)}
                  />
                ))}
              </Flex>
            </>
          )}
        </Grid>

        {proposal.reasoning && (
          <Text mt="1" fontSize="xs" color="gray.600">
            {proposal.reasoning}
          </Text>
        )}

        {!readOnly && mode === "edit" && (
          <EditValue
            field={field}
            initial={decision?.value ?? proposal.value}
            onCancel={() => setMode("view")}
            onSave={(value) =>
              decide({ fieldId: field.id, action: "edit", value })
            }
          />
        )}

        {!readOnly && mode === "reject" && (
          <RejectNote
            onCancel={() => setMode("view")}
            onReject={(note) =>
              decide({ fieldId: field.id, action: "reject", note })
            }
          />
        )}
      </Box>

      {/* Right: confidence and the reviewer's decision. */}
      <Stack align="end" gap="2" minW="200px">
        <StatusBadge proposal={proposal} />

        {decision && mode === "view" && (
          <DecisionLine
            decision={decision}
            field={field}
            empty={empty}
            onUndo={readOnly ? undefined : () => decide(null)}
          />
        )}

        {!readOnly && !decision && mode === "view" && (
          <Flex gap="1.5">
            <Button
              size="xs"
              variant="outline"
              onClick={() => decide({ fieldId: field.id, action: "accept" })}
            >
              {empty ? "Leave blank" : "Accept"}
            </Button>
            <Button size="xs" variant="outline" onClick={() => setMode("edit")}>
              {empty ? "Enter value" : "Edit"}
            </Button>
            {!staffOnly && (
              <Button
                size="xs"
                variant="ghost"
                colorPalette="red"
                onClick={() => setMode("reject")}
              >
                Reject
              </Button>
            )}
          </Flex>
        )}
      </Stack>
    </Grid>
  );
}

function StatusBadge({ proposal }: { proposal: FieldProposal }) {
  switch (proposal.status) {
    case "found":
      return <ConfidenceBadge proposal={proposal} />;
    case "conflict":
      return (
        <Flex gap="1.5">
          <Badge colorPalette="orange" variant="outline">
            Documents disagree
          </Badge>
          <ConfidenceBadge proposal={proposal} />
        </Flex>
      );
    case "missing":
      return (
        <Badge colorPalette="gray" variant="outline">
          No supporting document
        </Badge>
      );
    case "needs_human":
      return (
        <Badge colorPalette="gray" variant="subtle">
          Staff only
        </Badge>
      );
    case "not_applicable":
      return null;
  }
}

function SourceChip(props: {
  evidence: Evidence;
  filename: string;
  showValue: boolean;
  onClick: () => void;
}) {
  const { evidence } = props;

  return (
    <Button
      size="2xs"
      variant="outline"
      fontFamily="mono"
      fontWeight="normal"
      onClick={props.onClick}
      title={evidence.quote}
    >
      {props.filename}, p.{evidence.page}
      {props.showValue && evidence.candidateValue !== null
        ? `: ${String(evidence.candidateValue)}`
        : ""}
    </Button>
  );
}

function DecisionLine(props: {
  decision: ReviewDecision;
  field: FieldDefinition;
  /** Accepting an empty proposal leaves the field blank. */
  empty: boolean;
  onUndo?: () => void;
}) {
  const { decision } = props;

  const text =
    decision.action === "accept"
      ? props.empty
        ? "Left blank"
        : "Accepted"
      : decision.action === "edit"
        ? `Edited: ${formatValue(decision.value ?? null)}`
        : `Rejected: ${decision.note || "no note"}`;

  return (
    <Flex gap="2" align="center" maxW="260px">
      <Text
        fontSize="xs"
        fontWeight="medium"
        color={DECISION_BORDER[decision.action]}
        truncate
        title={text}
      >
        {text}
      </Text>
      {props.onUndo && (
        <Button size="2xs" variant="ghost" onClick={props.onUndo}>
          Undo
        </Button>
      )}
    </Flex>
  );
}

function EditValue(props: {
  field: FieldDefinition;
  initial: FieldValue;
  onSave: (value: FieldValue) => void;
  onCancel: () => void;
}) {
  const { register, handleSubmit, formState } = useForm<{ value: string }>({
    defaultValues: {
      value: typeof props.initial === "string" ? props.initial : "",
    },
    mode: "onChange",
  });

  if (props.field.type === "checkbox") {
    return (
      <Flex mt="2.5" gap="2">
        <Button size="xs" variant="outline" onClick={() => props.onSave(true)}>
          Checked
        </Button>
        <Button size="xs" variant="outline" onClick={() => props.onSave(false)}>
          Not checked
        </Button>
        <Button size="xs" variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
      </Flex>
    );
  }

  const save = handleSubmit(({ value }) => props.onSave(value.trim()));
  const value = register("value", { validate: (v) => v.trim().length > 0 });
  const options = props.field.options ?? [];

  // Radio groups and dropdowns take one of the form's own options, never free
  // text.
  const choice =
    (props.field.type === "radio" || props.field.type === "select") &&
    options.length > 0;

  return (
    <Flex mt="2.5" gap="2" as="form" onSubmit={save}>
      {choice ? (
        <NativeSelect.Root size="xs" maxW="sm">
          <NativeSelect.Field
            autoFocus
            placeholder="Choose an option"
            {...value}
          >
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      ) : (
        <Input
          size="xs"
          autoFocus
          maxW="sm"
          maxLength={props.field.maxLength}
          placeholder={props.field.format ?? ""}
          {...value}
        />
      )}
      <Button
        size="xs"
        type="submit"
        colorPalette="blue"
        disabled={!formState.isValid}
      >
        Save
      </Button>
      <Button size="xs" variant="ghost" onClick={props.onCancel}>
        Cancel
      </Button>
    </Flex>
  );
}

/** A reject needs a note: it is what the agent re-reads the documents with. */
function RejectNote(props: {
  onReject: (note: string) => void;
  onCancel: () => void;
}) {
  const { register, handleSubmit, formState } = useForm<{ note: string }>({
    defaultValues: { note: "" },
    mode: "onChange",
  });

  const reject = handleSubmit(({ note }) => props.onReject(note.trim()));

  return (
    <Stack mt="2.5" gap="2" as="form" onSubmit={reject}>
      <Textarea
        size="xs"
        autoFocus
        rows={2}
        placeholder="What is wrong? The agent re-reads the documents with this note."
        {...register("note", { validate: (v) => v.trim().length >= 3 })}
      />
      <Flex gap="2">
        <Button
          size="xs"
          type="submit"
          colorPalette="red"
          variant="outline"
          disabled={!formState.isValid}
        >
          Reject with note
        </Button>
        <Button size="xs" variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
      </Flex>
    </Stack>
  );
}

export function formatValue(value: FieldValue): string {
  if (value === null) return "No value";
  if (typeof value === "boolean") return value ? "Checked" : "Not checked";

  return value;
}
