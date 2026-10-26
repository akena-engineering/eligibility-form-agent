import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { pdfUrl } from "../api.ts";

/** The filled PDF, as it will be printed or filed. */
export function ResultPanel({
  runId,
  onNewCase,
}: {
  runId: string;
  onNewCase: () => void;
}) {
  const url = pdfUrl(runId);

  return (
    <Flex direction="column" h="full">
      <Flex
        px="4"
        py="2.5"
        gap="2"
        align="center"
        bg="white"
        borderBottomWidth="1px"
      >
        <Text fontSize="sm" fontWeight="medium">
          Filled form
        </Text>
        <Text fontSize="xs" color="gray.500">
          Only accepted and edited values are written. Staff-only fields stay
          blank unless entered.
        </Text>
        <Flex gap="2" ml="auto">
          <Button asChild size="sm" colorPalette="blue">
            <a href={url} download="filled-form.pdf">
              Download PDF
            </a>
          </Button>
          <Button size="sm" variant="outline" onClick={onNewCase}>
            New case
          </Button>
        </Flex>
      </Flex>
      <Box
        as="iframe"
        flex="1"
        w="full"
        border="0"
        bg="gray.100"
        {...{ src: url, title: "Filled form" }}
      />
    </Flex>
  );
}
