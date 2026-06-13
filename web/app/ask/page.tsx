"use client";

import { useActionState } from "react";
import Link from "next/link";
import { type AskResponse, askNotes } from "@/lib/api";

interface AskState {
  question?: string;
  response?: AskResponse;
  error?: string;
}

export default function AskPage() {
  const [state, formAction, isPending] = useActionState<AskState, FormData>(
    async (_prev, fd) => {
      const question = String(fd.get("question") ?? "").trim();
      try {
        return { question, response: await askNotes(question) };
      } catch (e) {
        return {
          question,
          error: e instanceof Error ? e.message : "Ask failed",
        };
      }
    },
    {},
  );

  return (
    <main className="container">
      <Link href="/">← decks</Link>
      <h1>ask your notes</h1>

      <form action={formAction} className="ask-form">
        <input
          name="question"
          placeholder="what did my notes say about…"
          minLength={3}
          maxLength={500}
          required
        />
        <button type="submit" disabled={isPending}>
          {isPending ? "Reading…" : "Ask"}
        </button>
      </form>
      {state.error && <p className="error">{state.error}</p>}

      {state.response && (
        <section className="ask-answer">
          <p className="ask-question">{state.question}</p>
          <p className="deck-summary">{state.response.answer}</p>
          {state.response.sources.length > 0 && (
            <p className="ask-sources">
              from:{" "}
              {state.response.sources.map((s, i) => (
                <span key={s.deckId}>
                  {i > 0 && " · "}
                  <Link href={`/decks/${s.deckId}`}>{s.deckTitle}</Link>
                </span>
              ))}
            </p>
          )}
        </section>
      )}
    </main>
  );
}
