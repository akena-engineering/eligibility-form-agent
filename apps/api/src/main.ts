import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule, configureApp } from "./app.module.ts";

const PORT = Number(process.env.PORT) || 3000;

const app = configureApp(await NestFactory.create(AppModule));
await app.listen(PORT);

new Logger("Bootstrap").log(`API on http://localhost:${PORT}/api`);
