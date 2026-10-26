import { join } from "node:path";
import { Module, type INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { modelsProvider } from "./runs/models.provider.ts";
import { RunStore } from "./runs/run-store.ts";
import { RunsController } from "./runs/runs.controller.ts";
import { RunsService } from "./runs/runs.service.ts";

/**
 * The repository's .env. `src/` and `dist/` are at the same depth, so this
 * works from both.
 */
const ENV_FILE = join(import.meta.dirname, "../../../.env");

@Module({
  // ANTHROPIC_API_KEY and the rest of the repository's .env, into process.env.
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: ENV_FILE })],
  controllers: [RunsController],
  providers: [RunsService, RunStore, modelsProvider],
})
export class AppModule {}

/** Shared by main.ts and the tests, so both serve the same routes. */
export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix("api");
  app.enableShutdownHooks();

  return app;
}
