import { Button, Center, Stack, Text } from "@chakra-ui/react";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { downloadPdf } from "../api.ts";

/** The run is done: the filled PDF downloads once, and can be saved again. */
export function ResultPanel({
  runId,
  onNewCase,
}: {
  runId: string;
  onNewCase: () => void;
}) {
  const download = useMutation({ mutationFn: () => downloadPdf(runId) });

  // Once per run, also under StrictMode's double effects.
  const downloaded = useRef(false);

  useEffect(() => {
    if (downloaded.current) return;

    downloaded.current = true;
    download.mutate();
  }, [download]);

  return (
    <Center h="full">
      <Stack align="center" gap="3" maxW="md" textAlign="center">
        <Text fontWeight="medium">Form filled</Text>

        {download.isError ? (
          <Text fontSize="sm" color="red.600">
            The PDF could not be downloaded: {download.error.message}
          </Text>
        ) : (
          <Text fontSize="sm" color="gray.600">
            Downloaded as filled-form.pdf. Only accepted and edited values are
            written; staff-only fields stay blank unless entered.
          </Text>
        )}

        <Stack direction="row" gap="2">
          <Button
            size="sm"
            colorPalette="blue"
            loading={download.isPending}
            onClick={() => download.mutate()}
          >
            Download again
          </Button>
          <Button size="sm" variant="outline" onClick={onNewCase}>
            New case
          </Button>
        </Stack>
      </Stack>
    </Center>
  );
}
