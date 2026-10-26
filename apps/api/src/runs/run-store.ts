import {
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
} from "@nestjs/common";
import type { Run } from "./run.ts";

/** In-memory runs, kept until the API stops. Nothing is written to disk. */
@Injectable()
export class RunStore implements OnModuleDestroy {
  private readonly runs = new Map<string, Run>();

  add(run: Run): void {
    this.runs.set(run.id, run);
  }

  /** The run. Throws 404 for unknown runs. */
  get(id: string): Run {
    const run = this.runs.get(id);
    if (!run) throw new NotFoundException(`Run ${id} not found`);

    return run;
  }

  /**
   * Completes every open event stream, so shutdown does not wait on SSE
   * clients.
   */
  onModuleDestroy(): void {
    for (const run of this.runs.values()) run.close();
    this.runs.clear();
  }
}
