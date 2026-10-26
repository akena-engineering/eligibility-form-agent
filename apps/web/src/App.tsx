import {
  Box,
  Button,
  Center,
  Flex,
  Grid,
  Spinner,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useState } from "react";
import { ResultPanel } from "./components/ResultPanel.tsx";
import { ReviewPanel } from "./components/ReviewPanel.tsx";
import { StepsGraph } from "./components/StepsGraph.tsx";
import { UploadPanel } from "./components/UploadPanel.tsx";
import { withoutRejects, type Decisions } from "./run/decisions.ts";
import type { RunState } from "./run/reducer.ts";
import { useRun } from "./run/use-run.ts";

export function App() {
  const run = useRun();
  const { state } = run;
  const [decisions, setDecisions] = useState<Decisions>({});

  const busy = state.phase === "starting" || state.phase === "running";

  const newCase = () => {
    setDecisions({});
    run.reset();
  };

  return (
    <Grid
      templateColumns="300px 1fr"
      templateRows="auto 1fr"
      h="100vh"
      bg="gray.50"
    >
      <Flex
        gridColumn="1 / -1"
        px="4"
        py="2"
        bg="white"
        borderBottomWidth="1px"
        align="center"
        gap="3"
      >
        <Text fontWeight="semibold" fontSize="sm">
          Eligibility form review
        </Text>
        {state.runId && (
          <Text ml="auto" fontSize="xs" color="gray.500" fontFamily="mono">
            Run {state.runId}
          </Text>
        )}
      </Flex>

      <UploadPanel
        busy={busy || state.phase === "review"}
        onStart={(files) => {
          setDecisions({});
          run.start(files);
        }}
      />

      <Flex direction="column" overflow="hidden" minW="0">
        {state.graph && <StepsGraph outline={state.graph} state={state} />}

        <Box flex="1" overflowY="auto">
          <Main
            state={state}
            decisions={decisions}
            onDecisionsChange={setDecisions}
            onSubmit={(batch) => {
              // Once the batch is in, the agent consumes the rejects; the rest
              // stay decided.
              run.review(batch, {
                onSuccess: () => setDecisions(withoutRejects),
              });
            }}
            onNewCase={newCase}
          />
        </Box>
      </Flex>
    </Grid>
  );
}

function Main(props: {
  state: RunState;
  decisions: Decisions;
  onDecisionsChange: (decisions: Decisions) => void;
  onSubmit: (decisions: Decisions[string][]) => void;
  onNewCase: () => void;
}) {
  const { state } = props;

  if (state.phase === "done" && state.runId) {
    return <ResultPanel runId={state.runId} onNewCase={props.onNewCase} />;
  }

  if (state.phase === "failed") {
    return (
      <Center h="full">
        <Stack align="center" gap="3" maxW="md" textAlign="center">
          <Text fontWeight="medium">The run stopped</Text>
          <Text fontSize="sm" color="gray.600">
            {state.error}
          </Text>
          <Button size="sm" variant="outline" onClick={props.onNewCase}>
            Start again
          </Button>
        </Stack>
      </Center>
    );
  }

  if (state.review) {
    return (
      <ReviewPanel
        fields={state.review.fields}
        proposals={state.proposals}
        documents={state.review.documents}
        decisions={props.decisions}
        editable={state.phase === "review"}
        error={state.reviewError}
        onDecisionsChange={props.onDecisionsChange}
        onSubmit={props.onSubmit}
      />
    );
  }

  if (state.phase === "starting" || state.phase === "running") {
    return (
      <Center h="full">
        <Stack align="center" gap="2">
          <Spinner size="sm" color="gray.500" />
          <Text fontSize="sm" color="gray.600">
            Reading the form and the documents. Proposals appear when every
            section is checked.
          </Text>
        </Stack>
      </Center>
    );
  }

  return (
    <Center h="full">
      <Text fontSize="sm" color="gray.500">
        Add the blank form and the documents, or load the sample case, then
        start.
      </Text>
    </Center>
  );
}
