import {
  HumanMessage,
  SystemMessage,
  type MessageContent,
} from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { z } from "zod";
import type { ModelRole, Models } from "./models.ts";

export interface StructuredCall<T extends z.ZodType> {
  role: ModelRole;
  schema: T;
  name: string;
  /** Instructions. Stable across calls. */
  system: string;
  /**
   * Large stable context (documents, form text). Cached with Anthropic prompt
   * caching.
   */
  context?: string;
  /**
   * The request, as text or content blocks (e.g. a PDF for the vision
   * fallbacks).
   */
  user: MessageContent;
}

/**
 * A PDF as a standard content block, for reading form pages and scanned pages.
 */

export function pdfBlock(bytes: Uint8Array) {
  return {
    type: "file" as const,
    mimeType: "application/pdf",
    data: Buffer.from(bytes).toString("base64"),
  };
}

/**
 * One structured-output call. Documents go in a cached system block (Anthropic
 * prompt caching).
 */
export async function callStructured<T extends z.ZodType>(
  models: Models,
  call: StructuredCall<T>,
  config?: RunnableConfig,
): Promise<z.infer<T>> {
  const model = models.get(call.role);

  const systemBlocks: Array<Record<string, unknown>> = [
    { type: "text", text: call.system },
  ];
  if (call.context) {
    systemBlocks.push({
      type: "text",
      text: call.context,
      cache_control: { type: "ephemeral" },
    });
  }

  const messages = [
    new SystemMessage({ content: systemBlocks as MessageContent }),
    new HumanMessage({ content: call.user }),
  ];

  // Native structured outputs (Anthropic `output_config.format`), not a forced
  // tool call: current Claude models reject `tool_choice` "tool" and "any".
  const structured = model.withStructuredOutput(call.schema, {
    name: call.name,
    method: "jsonSchema",
  });
  const result = await structured.invoke(messages, config);

  return call.schema.parse(result) as z.infer<T>;
}
