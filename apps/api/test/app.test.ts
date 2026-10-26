import { ChatModels, type Models } from "@efa/form-agent";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.ts";
import { MODELS } from "../src/runs/models.provider.ts";

describe("AppModule", () => {
  it("boots with the Claude models", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const models = moduleRef.get<Models>(MODELS);

    await moduleRef.close();

    expect(models).toBeInstanceOf(ChatModels);
  });
});
