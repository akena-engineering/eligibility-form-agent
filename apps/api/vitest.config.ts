import { defineProject } from "vitest/config";

// Vite's transformer reads experimentalDecorators / emitDecoratorMetadata from
// tsconfig.json, which NestJS dependency injection needs.
export default defineProject({ test: { name: "api" } });
