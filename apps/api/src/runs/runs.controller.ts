import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Sse,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
  type MessageEvent,
} from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import { ReviewDecisions, type StartRunResponse } from "@efa/shared";
import { GRAPH_OUTLINE, type InputFile } from "@efa/form-agent";
import { map, type Observable } from "rxjs";
import { RunStore } from "./run-store.ts";
import { RunsService } from "./runs.service.ts";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_DOCUMENTS = 10;

interface UploadedRunFiles {
  form?: Express.Multer.File[];
  documents?: Express.Multer.File[];
}

@Controller("runs")
export class RunsController {
  private readonly runs: RunsService;
  private readonly store: RunStore;

  constructor(runs: RunsService, store: RunStore) {
    this.runs = runs;
    this.store = store;
  }

  /**
   * Starts a run from a blank form and the person's documents (multipart:
   * `form`, `documents`).
   */
  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "form", maxCount: 1 },
        { name: "documents", maxCount: MAX_DOCUMENTS },
      ],
      { limits: { fileSize: MAX_FILE_BYTES } },
    ),
  )
  create(
    @UploadedFiles() files: UploadedRunFiles | undefined,
  ): StartRunResponse {
    const form = files?.form?.[0];
    const documents = files?.documents ?? [];

    if (!form) {
      throw new BadRequestException(
        "A blank form PDF is required (field `form`)",
      );
    }

    if (documents.length === 0) {
      throw new BadRequestException(
        "At least one document is required (field `documents`)",
      );
    }

    const run = this.runs.start(toInput(form), documents.map(toInput));

    return { runId: run.id, graph: GRAPH_OUTLINE };
  }

  /**
   * Server-sent events. Each event's SSE id is its sequence number, so a
   * reconnecting EventSource sends Last-Event-ID and gets only what it missed.
   */
  @Sse(":id/events")
  events(
    @Param("id") id: string,
    @Headers("last-event-id") lastEventId: string | undefined,
  ): Observable<MessageEvent> {
    const run = this.store.get(id);
    const after = Number(lastEventId) || 0;

    return run
      .eventsAfter(after)
      .pipe(map((event) => ({ id: String(event.seq), data: event })));
  }

  /**
   * The reviewer's decisions, at least one. 202 with no body: the run resumes
   * in the background and progress arrives as events.
   */
  @Post(":id/review")
  @HttpCode(202)
  review(@Param("id") id: string, @Body() body: unknown): void {
    const run = this.store.get(id);

    const decisions = ReviewDecisions.safeParse(body);
    if (!decisions.success) {
      throw new BadRequestException({
        message: "Invalid review decisions",
        issues: decisions.error.issues,
      });
    }

    if (decisions.data.length === 0)
      throw new BadRequestException("No review decisions");

    this.runs.review(run, decisions.data);
  }

  @Get(":id/pdf")
  pdf(@Param("id") id: string): StreamableFile {
    const run = this.store.get(id);
    if (!run.pdf)
      throw new ConflictException(`Run is ${run.status}, the PDF is not ready`);

    return new StreamableFile(run.pdf, {
      type: "application/pdf",
      disposition: 'inline; filename="filled-form.pdf"',
    });
  }
}

/**
 * Multer file to agent input. Rejects anything that is not a PDF by its magic
 * bytes.
 */
function toInput(file: Express.Multer.File): InputFile {
  const isPdf = file.buffer.subarray(0, 5).toString("latin1") === "%PDF-";
  if (!isPdf)
    throw new BadRequestException(`${file.originalname} is not a PDF`);

  return { filename: file.originalname, bytes: file.buffer };
}
