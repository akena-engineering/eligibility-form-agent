import { RunEvent, type ReviewDecision } from "@efa/shared";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { eventsUrl, startRun, submitReview, type CaseFiles } from "../api.ts";
import { initialRunState, runReducer } from "./reducer.ts";

/**
 * One run. HTTP calls are TanStack Query mutations; progress arrives as
 * server-sent events and goes through the reducer. State lives in React only: a
 * refresh starts from zero. EventSource reconnects by itself and sends
 * Last-Event-ID; the reducer drops anything it has already applied. When the
 * server ends the stream for good (the run is gone after an API restart), the
 * run fails.
 */
export function useRun() {
  const [state, dispatch] = useReducer(runReducer, initialRunState);
  const source = useRef<EventSource | null>(null);

  const close = useCallback(() => {
    source.current?.close();
    source.current = null;
  }, []);

  useEffect(() => close, [close]);

  const listen = useCallback(
    (runId: string) => {
      const events = new EventSource(eventsUrl(runId));

      events.addEventListener("message", (message) => {
        const event = parseEvent(message.data);

        if (!event) {
          close();
          dispatch({
            type: "failed",
            message: "Unexpected event from the server",
          });

          return;
        }

        dispatch({ type: "event", event });
        if (event.type === "pdf_ready" || event.type === "error") close();
      });

      // A temporary drop keeps the state CONNECTING and retries; CLOSED means
      // it will not.
      events.addEventListener("error", () => {
        if (events.readyState !== EventSource.CLOSED) return;

        close();
        dispatch({ type: "failed", message: "Lost connection to the run" });
      });

      source.current = events;
    },
    [close],
  );

  const start = useMutation({
    mutationFn: (files: CaseFiles) => startRun(files.form, files.documents),
    onMutate: () => {
      close();
      dispatch({ type: "starting" });
    },
    onSuccess: (run) => {
      dispatch({ type: "started", runId: run.runId, graph: run.graph });
      listen(run.runId);
    },
    onError: (error) => dispatch({ type: "failed", message: error.message }),
  });

  const review = useMutation({
    mutationFn: (decisions: ReviewDecision[]) =>
      submitReview(state.runId!, decisions),
    onMutate: () => dispatch({ type: "submitted" }),
    // The run is still paused for review: stay there, keep the decisions, show
    // why.
    onError: (error) =>
      dispatch({ type: "review_failed", message: error.message }),
  });

  const reset = useCallback(() => {
    close();
    dispatch({ type: "reset" });
  }, [close]);

  return {
    state,
    start: start.mutate,
    review: review.mutate,
    reset,
  };
}

/**
 * Server-sent events are checked against the contract like any other response.
 */
export function parseEvent(data: unknown): RunEvent | null {
  try {
    const result = RunEvent.safeParse(JSON.parse(String(data)));

    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
