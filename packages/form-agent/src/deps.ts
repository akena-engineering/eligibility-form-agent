import type { AgentEvent } from "@efa/shared";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import type { Models } from "./models.ts";

export interface InputFile {
  filename: string;
  bytes: Uint8Array;
}

/**
 * What one run's graph is built with. Files stay out of graph state and
 * checkpoints.
 */
export interface AgentDeps {
  form: InputFile;
  documents: InputFile[];
  models: Models;
}

/** Sends a UI event through the "custom" stream. */
export function emit(
  config: LangGraphRunnableConfig | undefined,
  event: AgentEvent,
): void {
  config?.writer?.(event);
}
