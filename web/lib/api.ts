import type { Attempt, Card, Deck } from "@engram/shared";
import { idToken } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL!;
const REQUEST_TIMEOUT_MS = 15_000;

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export interface ClientQuizQuestion {
  question: string;
  options: string[];
}

export interface DeckResponse {
  deck: Deck;
  cards: Card[];
  quiz: ClientQuizQuestion[];
}

export interface AttemptResult {
  correct: boolean;
  answerIndex: number;
  explanation: string;
}

export interface AskResponse {
  answer: string;
  sources: { deckId: string; deckTitle: string }[];
}

/** status 0 = never reached the server (offline, DNS, timeout). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function friendly(status: number, serverMessage?: string): string {
  switch (status) {
    case 401:
      return "Your session has expired. Sign in again to keep going.";
    case 403:
      return "That deck is on someone else's desk.";
    case 404:
      return "That deck isn't in the catalog. It may have been removed.";
    case 429:
      return "Too many requests at once. Give it a moment and try again.";
    default:
      if (status >= 500)
        return "The library hit a snag on our end. Try again in a moment.";
      return serverMessage ?? `Request failed (${status}).`;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await idToken();

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
      signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === "TimeoutError";
    throw new ApiError(
      timedOut
        ? "The library is taking too long to answer. Try again in a bit."
        : "Can't reach the library. Check your connection and try again.",
      0,
    );
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      friendly(res.status, (body as { error?: string }).error),
      res.status,
    );
  }
  return res.json() as Promise<T>;
}

export const askNotes = (question: string) =>
  request<AskResponse>("/ask", {
    method: "POST",
    body: JSON.stringify({ question }),
  });

export const listDecks = () =>
  request<{ decks: Deck[] }>("/decks", { cache: "no-store" });

export const getDeck = (deckId: string) =>
  request<DeckResponse>(`/decks/${encodeURIComponent(deckId)}`, {
    cache: "no-store",
  });

export const listAttempts = (deckId: string) =>
  request<{ attempts: Attempt[] }>(
    `/decks/${encodeURIComponent(deckId)}/attempts`,
    { cache: "no-store" },
  );

export const submitAttempt = (deckId: string, answers: number[]) =>
  request<{ attempt: Attempt; results: AttemptResult[] }>(
    `/decks/${encodeURIComponent(deckId)}/attempts`,
    { method: "POST", body: JSON.stringify({ answers }) },
  );

export async function uploadFile(file: File): Promise<{ deckId: string }> {
  if (file.size === 0)
    throw new ApiError(
      "That file is empty. Pick one with something in it.",
      400,
    );
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 1,
    }).format(file.size / (1024 * 1024));
    throw new ApiError(
      `That file is ${mb} MB and the limit is 20 MB. Try a smaller export, or split it in two.`,
      400,
    );
  }

  const contentType = file.type || "text/plain";
  const { deckId, upload } = await request<{
    deckId: string;
    upload: { url: string; fields: Record<string, string> };
  }>("/uploads", {
    method: "POST",
    body: JSON.stringify({ filename: file.name, contentType }),
  });

  const form = new FormData();
  for (const [k, v] of Object.entries(upload.fields)) form.append(k, v);
  form.append("file", file);

  // No timeout here — large files on slow links legitimately take a while.
  let s3Res: Response;
  try {
    s3Res = await fetch(upload.url, { method: "POST", body: form });
  } catch {
    throw new ApiError(
      "The upload didn't make it to the shelf. Check your connection and try again.",
      0,
    );
  }
  if (!s3Res.ok)
    throw new ApiError(
      `The upload didn't make it to the shelf (${s3Res.status}). Try again.`,
      s3Res.status,
    );

  return { deckId };
}
