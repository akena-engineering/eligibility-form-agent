import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AgentEvent, ReviewDecision } from "@efa/shared";
import {
  buildGraph,
  type InputFile,
  type Models,
  type ReviewRequest,
} from "@efa/form-agent";
import { Command } from "@langchain/langgraph";
import { MODELS } from "./models.provider.ts";
import { Run } from "./run.ts";
import { RunStore } from "./run-store.ts";

/**
 * Parallel branches per run, so also parallel model calls. `MAX_CONCURRENCY`
 * overrides it.
 */
const DEFAULT_MAX_CONCURRENCY = 4;

@Injectable()
export class RunsService {
  private readonly logger = new Logger(RunsService.name);
  private readonly store: RunStore;
  private readonly models: Models;
  private readonly maxConcurrency: number;

  constructor(
    store: RunStore,
    @Inject(MODELS) models: Models,
    config: ConfigService,
  ) {
    this.store = store;
    this.models = models;
    this.maxConcurrency =
      Number(config.get("MAX_CONCURRENCY")) || DEFAULT_MAX_CONCURRENCY;
  }

  /** Builds the graph for this run and starts it in the background. */
  start(form: InputFile, documents: InputFile[]): Run {
    const graph = buildGraph({ form, documents, models: this.models });
    const run = new Run(graph, this.maxConcurrency);

    this.store.add(run);
    void this.drive(run, {});

    return run;
  }

  /**
   * Resumes a paused run with the reviewer's decisions. 409 unless it is
   * waiting for review, 400 if a decision names a field the form does not
   * have.
   */
  review(run: Run, decisions: ReviewDecision[]): void {
    if (run.status !== "awaiting_review") {
      throw new ConflictException(
        `Run is ${run.status}, not waiting for review`,
      );
    }

    const unknown = decisions
      .filter((d) => !run.fieldIds.has(d.fieldId))
      .map((d) => d.fieldId);
    if (unknown.length > 0)
      throw new BadRequestException(`Unknown fields: ${unknown.join(", ")}`);

    run.status = "running";
    void this.drive(run, new Command({ resume: decisions }));
  }

  /**
   * Runs the graph until it pauses for review or ends, forwarding its events to
   * the run.
   */
  private async drive(run: Run, input: unknown): Promise<void> {
    // A failing node sends its own error event, then the stream rethrows the
    // same error.
    const reported = new Set<string>();

    try {
      const stream = await run.graph.stream(input as never, {
        ...run.config,
        streamMode: ["custom"],
        subgraphs: true,
      });

      for await (const chunk of stream) {
        const [, , event] = chunk as unknown as [string[], string, AgentEvent];
        if (event.type === "error") reported.add(event.message);

        run.emit(event);
      }

      await this.settle(run);
    } catch (error) {
      run.status = "failed";

      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Run ${run.id} failed: ${message}`);

      if (!reported.has(message)) run.emit({ type: "error", message });
    }
  }

  /**
   * After the stream ends: either paused for review, or finished with a PDF.
   */
  private async settle(run: Run): Promise<void> {
    const state = await run.graph.getState(run.config);
    const interrupt = state.tasks.flatMap((t) => t.interrupts)[0];

    if (interrupt) {
      const request = interrupt.value as ReviewRequest;

      run.fieldIds = new Set(request.fields.map((f) => f.id));
      run.status = "awaiting_review";
      run.emit({
        type: "review_required",
        fields: request.fields,
        proposals: request.proposals,
        completeness: request.completeness,
        documents: request.documents,
      });

      return;
    }

    const filledPdf = state.values.filledPdf as string | null;
    if (!filledPdf) throw new Error("The run ended without a PDF");

    run.pdf = Buffer.from(filledPdf, "base64");
    run.status = "finished";
    run.emit({ type: "pdf_ready" });
  }
}
