import { ApiError, StartRunResponse, type ReviewDecision } from "@efa/shared";
import type { z } from "zod";

/** The blank form and the person's documents, as picked in the upload panel. */
export interface CaseFiles {
  form: File;
  documents: File[];
}

/**
 * Every response is parsed with its contract schema: the UI never works on an
 * unchecked shape.
 */
export async function startRun(
  form: File,
  documents: File[],
): Promise<StartRunResponse> {
  const body = new FormData();
  body.append("form", form);
  for (const doc of documents) body.append("documents", doc);

  const response = await fetch("/api/runs", { method: "POST", body });

  return parse(response, StartRunResponse);
}

/** Answered with a bare 202: the outcome arrives as events. */
export async function submitReview(
  runId: string,
  decisions: ReviewDecision[],
): Promise<void> {
  const response = await fetch(`/api/runs/${runId}/review`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(decisions),
  });

  if (!response.ok) throw await requestError(response);
}

export const eventsUrl = (runId: string) => `/api/runs/${runId}/events`;
export const pdfUrl = (runId: string) => `/api/runs/${runId}/pdf`;

export async function parse<T extends z.ZodType>(
  response: Response,
  schema: T,
): Promise<z.infer<T>> {
  if (!response.ok) throw await requestError(response);

  const body: unknown = await response.json().catch(() => null);
  const result = schema.safeParse(body);

  if (!result.success) {
    throw new Error("Unexpected response from the API", {
      cause: result.error,
    });
  }

  return result.data;
}

async function requestError(response: Response): Promise<Error> {
  const body: unknown = await response.json().catch(() => null);
  const error = ApiError.safeParse(body);
  const message = error.success ? error.data.message : undefined;

  if (Array.isArray(message)) return new Error(message.join(". "));

  return new Error(message || response.statusText || "Request failed");
}
