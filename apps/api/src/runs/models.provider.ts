import type { Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ChatModels, type Models } from "@efa/form-agent";

/** Injection token for the models every run uses. */
export const MODELS = Symbol("MODELS");

export const modelsProvider: Provider<Models> = {
  provide: MODELS,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Models =>
    new ChatModels(config.get("ANTHROPIC_API_KEY")),
};
