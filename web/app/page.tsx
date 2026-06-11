"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Deck } from "@engram/shared";
import { ApiError, listDecks } from "@/lib/api";
import { getCurrentUser, signOut } from "@/lib/auth";
import { UploadForm } from "@/components/UploadForm";

type Shelf =
  | { phase: "loading" }
  | { phase: "ready"; decks: Deck[] }
  | { phase: "error"; message: string };

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

export default function HomePage() {
  const router = useRouter();
  const [email, setEmail] = useState<string>();
  const [shelf, setShelf] = useState<Shelf>({ phase: "loading" });

  const loadDecks = useCallback(async () => {
    setShelf({ phase: "loading" });
    try {
      const r = await listDecks();
      setShelf({ phase: "ready", decks: r.decks });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.replace("/login");
        return;
      }
      setShelf({
        phase: "error",
        message:
          e instanceof Error ? e.message : "Couldn't fetch your decks.",
      });
    }
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Auth and data failures are different problems: only the first
      // sends you to the sign-in desk.
      try {
        const user = await getCurrentUser();
        if (cancelled) return;
        setEmail(user.signInDetails?.loginId);
      } catch {
        if (!cancelled) router.replace("/login");
        return;
      }
      void loadDecks();
    })();
    return () => {
      cancelled = true;
    };
  }, [router, loadDecks]);

  return (
    <main className="container">
      <header className="masthead">
        <h1>
          en<em>gram</em>
        </h1>
        <p className="tagline">
          turn anything you read into memories that stick
        </p>
        {/* always rendered — the masthead must not jump when auth resolves */}
        <p className="whoami">
          {email ? (
            <>
              {email}{" "}
              <button
                type="button"
                onClick={() =>
                  signOut()
                    .catch(() => undefined) // signed out locally either way
                    .finally(() => router.replace("/login"))
                }
              >
                sign out
              </button>
            </>
          ) : (
            " "
          )}
        </p>
      </header>

      <UploadForm />

      <h2 id="decks-heading">Your decks</h2>

      {shelf.phase === "loading" && (
        <div role="status" aria-labelledby="decks-heading">
          <span className="sr-only">Fetching your decks…</span>
          <ul className="deck-list" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="skeleton-deck">
                <span
                  className="skeleton-line"
                  style={{ width: `${52 - i * 9}%` }}
                />
                <span className="skeleton-line thin" />
              </li>
            ))}
          </ul>
        </div>
      )}

      {shelf.phase === "error" && (
        <div className="trouble-note" role="alert">
          <p className="error">{shelf.message}</p>
          <button type="button" onClick={() => void loadDecks()}>
            try again
          </button>
        </div>
      )}

      {shelf.phase === "ready" && shelf.decks.length === 0 && (
        <div className="empty-note">
          <p className="empty-title">Nothing on the shelf yet.</p>
          <p>
            Your first deck starts in the box above. Drop in lecture notes or a
            photo of the whiteboard, anything worth remembering.
          </p>
        </div>
      )}

      {shelf.phase === "ready" && shelf.decks.length > 0 && (
        <ul className="deck-list">
          {shelf.decks.map((deck, i) => (
            <li
              key={deck.deckId}
              className="deck-card"
              style={{ animationDelay: `${Math.min(i, 8) * 70}ms` }}
            >
              <Link href={`/decks/${deck.deckId}`}>
                <span className={`stamp stamp-${deck.status}`}>
                  {deck.status}
                </span>
                <span className="deck-title">{deck.title}</span>
                <span className="deck-meta">
                  {deck.status === "ready"
                    ? `${plural(deck.cardCount ?? 0, "card")} · ${plural(deck.quizCount ?? 0, "question")}`
                    : new Date(deck.createdAt).toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
