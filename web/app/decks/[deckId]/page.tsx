"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ApiError, type DeckResponse, getDeck } from "@/lib/api";
import { Flashcards } from "@/components/Flashcards";
import { Quiz } from "@/components/Quiz";
import { AttemptHistory } from "@/components/AttemptHistory";

const POLL_MS = 3000;

type Tab = "cards" | "quiz" | "history";
const TAB_ORDER: Tab[] = ["cards", "quiz", "history"];

export default function DeckPage({
  params,
}: {
  params: Promise<{ deckId: string }>;
}) {
  const { deckId } = use(params);
  const router = useRouter();
  const [data, setData] = useState<DeckResponse>();
  const [error, setError] = useState<string>();
  const [gone, setGone] = useState(false); // 404: stop polling, it won't appear
  const [tab, setTab] = useState<Tab>("cards");
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const next = await getDeck(deckId);
        if (cancelled) return;
        setData(next);
        setError(undefined);
        const status = next.deck.status;
        if (status === "awaiting-upload" || status === "processing") {
          timer = setTimeout(poll, POLL_MS);
        }
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          router.replace("/login");
          return;
        }
        if (e instanceof ApiError && e.status === 404) {
          setGone(true); // terminal: re-asking won't shelve it
          return;
        }
        setError(e instanceof Error ? e.message : "Failed to load");
        // Keep polling through transient blips — the deck may still become ready.
        timer = setTimeout(poll, POLL_MS);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [deckId, router]);

  const deckTitle = data?.deck.title;
  useEffect(() => {
    if (deckTitle) document.title = `${deckTitle} — engram`;
  }, [deckTitle]);

  function onTabKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    const i = TAB_ORDER.indexOf(tab);
    let next: Tab | undefined;
    if (e.key === "ArrowRight") next = TAB_ORDER[(i + 1) % TAB_ORDER.length];
    else if (e.key === "ArrowLeft")
      next = TAB_ORDER[(i + TAB_ORDER.length - 1) % TAB_ORDER.length];
    else if (e.key === "Home") next = TAB_ORDER[0];
    else if (e.key === "End") next = TAB_ORDER[TAB_ORDER.length - 1];
    if (next) {
      e.preventDefault();
      setTab(next);
      tabRefs.current[next]?.focus();
    }
  }

  let announce = "Fetching this deck…";
  let content: React.ReactNode;

  if (gone) {
    announce = "Deck not found.";
    content = (
      <div className="trouble-note">
        <h2>That deck isn&apos;t in the catalog.</h2>
        <p>
          It may have been removed, or the link may be misfiled. Your shelf is
          still where you left it.
        </p>
        <Link href="/">← back to your decks</Link>
      </div>
    );
  } else if (error && !data) {
    announce = "Trouble fetching this deck — retrying.";
    content = (
      <div className="trouble-note" role="alert">
        <p className="error">{error}</p>
        <p className="hint">retrying automatically — this page updates itself</p>
      </div>
    );
  } else if (!data) {
    content = (
      <div role="status">
        <span className="sr-only">Fetching this deck…</span>
        <div aria-hidden="true">
          <div className="skeleton-title skeleton-line" />
          <div className="skeleton-deck tall">
            <span className="skeleton-line" style={{ width: "70%" }} />
            <span className="skeleton-line thin" />
            <span className="skeleton-line thin" style={{ width: "45%" }} />
          </div>
        </div>
      </div>
    );
  } else {
    const { deck, cards, quiz } = data;

    if (deck.status === "awaiting-upload" || deck.status === "processing") {
      announce = "Claude is reading your pages and writing your cards.";
      content = (
        <>
          <h1>{deck.title}</h1>
          <div className="processing">
            <div className="ink-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <p className="processing-line">
              Claude is reading your pages and writing your cards…
            </p>
            <p className="hint">
              usually 20–60 seconds — this page updates itself
            </p>
            {error && (
              <p className="hint reconnect" role="alert">
                connection hiccup — retrying…
              </p>
            )}
          </div>
        </>
      );
    } else if (deck.status === "failed") {
      announce = "Processing failed.";
      content = (
        <>
          <h1>{deck.title}</h1>
          <div className="trouble-note">
            <span className="stamp stamp-failed">failed</span>
            <p className="error">
              Claude couldn&apos;t make a deck out of this one
              {deck.error ? ` — ${deck.error}` : "."}
            </p>
            <p>
              It usually helps to re-upload a clearer scan, a smaller file, or
              a text export instead of a photo.
            </p>
            <Link href="/">← try another upload</Link>
          </div>
        </>
      );
    } else {
      announce = `Deck ready — ${cards.length} cards, ${quiz.length} questions.`;
      content = (
        <>
          <h1>{deck.title}</h1>
          {deck.summary && (
            <details className="summary-note" open>
              <summary>Summary</summary>
              <p className="deck-summary">{deck.summary}</p>
            </details>
          )}

          <nav
            className="tabs"
            role="tablist"
            aria-label="Deck sections"
            onKeyDown={onTabKeyDown}
          >
            {TAB_ORDER.map((key) => (
              <button
                key={key}
                ref={(el) => {
                  tabRefs.current[key] = el;
                }}
                id={`tab-${key}`}
                role="tab"
                aria-selected={tab === key}
                aria-controls={`panel-${key}`}
                tabIndex={tab === key ? 0 : -1}
                className={tab === key ? "active" : ""}
                onClick={() => setTab(key)}
              >
                {key === "cards" && `Cards (${cards.length})`}
                {key === "quiz" && `Quiz (${quiz.length})`}
                {key === "history" && "History"}
              </button>
            ))}
          </nav>

          {/* cards & quiz stay mounted — flip position and in-progress answers survive tab switches */}
          <div
            id="panel-cards"
            role="tabpanel"
            aria-labelledby="tab-cards"
            hidden={tab !== "cards"}
          >
            <Flashcards cards={cards} />
          </div>
          <div
            id="panel-quiz"
            role="tabpanel"
            aria-labelledby="tab-quiz"
            hidden={tab !== "quiz"}
          >
            <Quiz
              deckId={deck.deckId}
              quiz={quiz}
              onSubmitted={() => setTab("history")}
            />
          </div>
          {tab === "history" && (
            <div
              id="panel-history"
              role="tabpanel"
              aria-labelledby="tab-history"
            >
              <AttemptHistory
                deckId={deck.deckId}
                onTakeQuiz={() => setTab("quiz")}
              />
            </div>
          )}
        </>
      );
    }
  }

  return (
    <main className="container">
      <p className="sr-only" role="status">
        {announce}
      </p>
      <Link href="/">← decks</Link>
      {content}
    </main>
  );
}
