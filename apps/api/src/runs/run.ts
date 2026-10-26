import { randomUUID } from "node:crypto";
import { RunEvent, type AgentEvent, type RunStatus } from "@efa/shared";
import { runConfig, type FormAgentGraph } from "@efa/form-agent";
import { ReplaySubject, filter, type Observable } from "rxjs";

/**
 * One agent run: the graph built for it (files and models are closed over), its
 * status, every event so far, and the filled PDF once there is one. Lives in
 * memory only.
 */
export class Run {
  readonly id = randomUUID();
  readonly graph: FormAgentGraph;
  readonly config: ReturnType<typeof runConfig>;

  status: RunStatus = "running";
  pdf: Buffer | null = null;
  /**
   * Ids of the form's fields, known from the first review on. Decisions must
   * name one of them.
   */
  fieldIds = new Set<string>();

  private seq = 0;
  // Replays everything to late or reconnecting subscribers. The client drops
  // what it already has.
  private readonly events = new ReplaySubject<RunEvent>();

  constructor(graph: FormAgentGraph, maxConcurrency: number) {
    this.graph = graph;
    this.config = runConfig(this.id, maxConcurrency);
  }

  /**
   * Stamps the event with the next sequence number and publishes it. Every
   * event is checked against the contract here, so a drift between agent and
   * contract fails where it starts, not in the UI.
   */
  emit(event: AgentEvent): void {
    this.seq += 1;
    this.events.next(RunEvent.parse({ ...event, seq: this.seq }));
  }

  /**
   * Events with a sequence number above `lastSeq`, then live events as they
   * come.
   */
  eventsAfter(lastSeq: number): Observable<RunEvent> {
    return this.events.pipe(filter((e) => e.seq > lastSeq));
  }

  close(): void {
    this.events.complete();
  }
}
