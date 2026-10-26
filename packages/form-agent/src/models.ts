import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

export type ModelRole = "form" | "ocr" | "plan" | "extract" | "verify";

/** The chat model for each role. */
export interface Models {
  get(role: ModelRole): BaseChatModel;
}

const SONNET = "claude-sonnet-5-5";
const HAIKU = "claude-haiku-5-5";

/**
 * Model per role. The verifier is a different model from the extractor on
 * purpose.
 */
const ROLES: Record<ModelRole, { model: string; maxTokens: number }> = {
  form: { model: SONNET, maxTokens: 16_000 },
  ocr: { model: HAIKU, maxTokens: 8_000 },
  plan: { model: SONNET, maxTokens: 16_000 },
  extract: { model: SONNET, maxTokens: 16_000 },
  verify: { model: HAIKU, maxTokens: 4_000 },
};

/**
 * Reads no environment: the caller passes the API key. Models are created on
 * first use, since `ChatAnthropic` throws without a key.
 */
export class ChatModels implements Models {
  private readonly apiKey: string | undefined;
  private readonly cache = new Map<ModelRole, ChatAnthropic>();

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  get(role: ModelRole): ChatAnthropic {
    let model = this.cache.get(role);

    if (!model) {
      model = new ChatAnthropic({ ...ROLES[role], apiKey: this.apiKey });
      this.cache.set(role, model);
    }

    return model;
  }
}
