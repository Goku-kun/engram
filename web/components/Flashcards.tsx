"use client";

import { useState } from "react";
import type { Card } from "@engram/shared";

export function Flashcards({ cards }: { cards: Card[] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[index];
  if (!card)
    return (
      <div className="empty-note">
        <p className="empty-title">No cards in this deck.</p>
        <p>
          The source may have been too thin to study from — try uploading a
          longer or clearer document.
        </p>
      </div>
    );

  function go(delta: number) {
    setFlipped(false);
    setIndex((i) => Math.min(cards.length - 1, Math.max(0, i + delta)));
  }

  return (
    <div
      className="flashcards"
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          go(-1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          go(1);
        }
      }}
    >
      <div className="card-scene">
        <button
          className={`card3d ${flipped ? "flipped" : ""}`}
          onClick={() => setFlipped((f) => !f)}
          aria-label={flipped ? "Show the prompt" : "Show the answer"}
        >
          <span className="card-face card-front">
            <span className="card-corner">Q</span>
            <span className="card-text">{card.front}</span>
            <span className="card-hint">tap to flip</span>
          </span>
          <span className="card-face card-back">
            <span className="card-corner">A</span>
            <span className="card-text">{card.back}</span>
            <span className="card-hint">tap for the prompt</span>
          </span>
        </button>
      </div>
      <div className="card-nav">
        <button onClick={() => go(-1)} disabled={index === 0}>
          ← prev
        </button>
        <span className="card-count">
          {index + 1} / {cards.length}
        </span>
        <button onClick={() => go(1)} disabled={index === cards.length - 1}>
          next →
        </button>
      </div>
    </div>
  );
}
