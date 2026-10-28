import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.ts";

const PORT = Number(process.env.PORT) || 3000;

const app = await NestFactory.create(AppModule);
app.setGlobalPrefix("api");
app.enableShutdownHooks();

await app.listen(PORT);

new Logger("Bootstrap").log(`API on http://localhost:${PORT}/api`);
