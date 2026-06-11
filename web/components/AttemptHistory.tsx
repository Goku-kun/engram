"use client";

import { useEffect, useState } from "react";
import type { Attempt } from "@engram/shared";
import { listAttempts } from "@/lib/api";

interface AttemptHistoryProps {
  deckId: string;
  onTakeQuiz?: () => void;
}

export function AttemptHistory({ deckId, onTakeQuiz }: AttemptHistoryProps) {
  const [attempts, setAttempts] = useState<Attempt[]>();
  const [error, setError] = useState<string>();
  const [epoch, setEpoch] = useState(0); // bump to refetch

  useEffect(() => {
    let cancelled = false;
    listAttempts(deckId)
      .then((r) => {
        if (!cancelled) setAttempts(r.attempts);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load attempts");
      });
    return () => {
      cancelled = true;
    };
  }, [deckId, epoch]);

  const retry = () => {
    setError(undefined);
    setAttempts(undefined);
    setEpoch((n) => n + 1);
  };

  if (error)
    return (
      <div className="trouble-note" role="alert">
        <p className="error">{error}</p>
        <button type="button" onClick={retry}>
          try again
        </button>
      </div>
    );

  if (!attempts)
    return (
      <div role="status">
        <span className="sr-only">Fetching your attempts…</span>
        <div className="skeleton-deck" aria-hidden="true">
          <span className="skeleton-line" style={{ width: "40%" }} />
          <span className="skeleton-line thin" />
          <span className="skeleton-line thin" style={{ width: "55%" }} />
        </div>
      </div>
    );

  if (attempts.length === 0)
    return (
      <div className="empty-note">
        <p className="empty-title">No attempts on the ledger yet.</p>
        <p>
          Take the quiz once and your scores will start stacking up here.
          {onTakeQuiz && (
            <>
              {" "}
              <button type="button" onClick={onTakeQuiz}>
                take the quiz →
              </button>
            </>
          )}
        </p>
      </div>
    );

  return (
    <table className="history">
      <thead>
        <tr>
          <th scope="col">When</th>
          <th scope="col">Score</th>
        </tr>
      </thead>
      <tbody>
        {attempts.map((a) => (
          <tr key={a.takenAt}>
            <td>{new Date(a.takenAt).toLocaleString()}</td>
            <td>
              <span className="score-frac">
                {a.score} / {a.total}
              </span>
              <span className="score-bar" aria-hidden="true">
                <span
                  style={{
                    width:
                      a.total > 0
                        ? `${Math.round((a.score / a.total) * 100)}%`
                        : 0,
                  }}
                />
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
