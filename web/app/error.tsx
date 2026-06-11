"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="container">
      <div className="trouble-note" role="alert">
        <span className="stamp stamp-failed">mishap</span>
        <h2>This page tore.</h2>
        <p>
          Something unexpected kept it from rendering. Your decks are safe on
          the shelf.
          {error.digest && (
            <>
              {" "}
              <span className="hint">ref: {error.digest}</span>
            </>
          )}
        </p>
        <button type="button" onClick={() => unstable_retry()}>
          try again
        </button>
      </div>
    </main>
  );
}
