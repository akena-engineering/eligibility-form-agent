import {
  Box,
  Button,
  CloseButton,
  Flex,
  Heading,
  Stack,
  Text,
} from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import type { CaseFiles } from "../api.ts";
import { loadSampleCase } from "../samples.ts";

const CaseFilesSchema = z.object({
  form: z.instanceof(File, { message: "Choose the blank form" }),
  documents: z.array(z.instanceof(File)).min(1, "Add at least one document"),
});

type CaseFilesInput = z.input<typeof CaseFilesSchema>;

interface Props {
  busy: boolean;
  onStart: (files: CaseFiles) => void;
}

/**
 * The blank form and the person's documents. "Load a sample case" fills in
 * both.
 */
export function UploadPanel({ busy, onStart }: Props) {
  const { control, setValue, resetField, handleSubmit, formState } = useForm<
    CaseFilesInput,
    unknown,
    CaseFiles
  >({
    resolver: zodResolver(CaseFilesSchema),
    defaultValues: { documents: [] },
  });
  const form = useWatch({ control, name: "form" });
  const documents = useWatch({ control, name: "documents" });

  const [loading, setLoading] = useState(false);

  // After a failed submit, errors update as files change.
  const validate = { shouldValidate: formState.isSubmitted };

  const loadSample = async () => {
    setLoading(true);

    try {
      const sample = await loadSampleCase();

      setValue("form", sample.form, validate);
      setValue("documents", sample.documents, validate);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack
      as="form"
      gap="5"
      p="4"
      h="full"
      borderRightWidth="1px"
      bg="white"
      overflowY="auto"
      onSubmit={handleSubmit(onStart)}
    >
      <Heading size="sm">Case file</Heading>

      <Section
        title="Blank form"
        hint="One PDF. Fillable or flat."
        error={formState.errors.form?.message}
      >
        <PdfPicker
          label={form ? "Replace form" : "Choose form"}
          disabled={busy}
          onPick={([file]) => file && setValue("form", file, validate)}
        />
        {form && (
          <FileRow
            name={form.name}
            size={form.size}
            onRemove={busy ? undefined : () => resetField("form")}
          />
        )}
      </Section>

      <Section
        title="Documents"
        hint="The person's documents, as PDFs."
        error={formState.errors.documents?.message}
      >
        <PdfPicker
          label="Add documents"
          multiple
          disabled={busy}
          onPick={(files) =>
            setValue("documents", [...documents, ...files], validate)
          }
        />
        {documents.map((doc, i) => (
          <FileRow
            key={`${doc.name}-${i}`}
            name={doc.name}
            size={doc.size}
            onRemove={
              busy
                ? undefined
                : () =>
                    setValue(
                      "documents",
                      documents.filter((_, j) => j !== i),
                      validate,
                    )
            }
          />
        ))}
      </Section>

      <Stack gap="2" mt="auto">
        <Button
          variant="outline"
          size="sm"
          onClick={loadSample}
          loading={loading}
          disabled={busy}
        >
          Load a sample case
        </Button>
        <Text fontSize="xs" color="gray.500">
          Example: a public intake form and a synthetic person's documents. No
          real personal data.
        </Text>
        <Button type="submit" colorPalette="blue" size="sm" disabled={busy}>
          Start
        </Button>
      </Stack>
    </Stack>
  );
}

function Section(props: {
  title: string;
  hint: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <Stack gap="2">
      <Box>
        <Text fontSize="sm" fontWeight="medium">
          {props.title}
        </Text>
        <Text fontSize="xs" color="gray.500">
          {props.hint}
        </Text>
      </Box>

      {props.children}

      {props.error && (
        <Text fontSize="xs" color="red.600">
          {props.error}
        </Text>
      )}
    </Stack>
  );
}

function PdfPicker(props: {
  label: string;
  multiple?: boolean;
  disabled: boolean;
  onPick: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/pdf"
        multiple={props.multiple}
        hidden
        onChange={(e) => {
          props.onPick([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      <Button
        size="xs"
        variant="outline"
        disabled={props.disabled}
        onClick={() => input.current?.click()}
      >
        {props.label}
      </Button>
    </>
  );
}

function FileRow({
  name,
  size,
  onRemove,
}: {
  name: string;
  size: number;
  onRemove?: () => void;
}) {
  return (
    <Flex
      align="center"
      gap="2"
      borderWidth="1px"
      rounded="l2"
      px="2"
      py="1"
      fontSize="xs"
    >
      <Text fontFamily="mono" truncate flex="1" title={name}>
        {name}
      </Text>
      <Text color="gray.500">{Math.ceil(size / 1024)} KB</Text>
      {onRemove && (
        <CloseButton
          size="2xs"
          aria-label={`Remove ${name}`}
          onClick={onRemove}
        />
      )}
    </Flex>
  );
}
