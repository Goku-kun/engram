"use client";

import { useActionState } from "react";
import {
  type AttemptResult,
  type ClientQuizQuestion,
  submitAttempt,
} from "@/lib/api";

interface QuizProps {
  deckId: string;
  quiz: ClientQuizQuestion[];
  onSubmitted: () => void;
}

interface QuizState {
  score?: number;
  answers?: number[];
  results?: AttemptResult[];
  error?: string;
}

export function Quiz({ deckId, quiz, onSubmitted }: QuizProps) {
  const [state, formAction, isPending] = useActionState<QuizState, FormData>(
    async (_previous, formData) => {
      const answers = quiz.map((_, qi) => Number(formData.get(`q${qi}`)));
      try {
        const res = await submitAttempt(deckId, answers);
        return { score: res.attempt.score, results: res.results, answers };
      } catch (e) {
        // Keep the picked answers (inputs stay mounted); only surface the error.
        return { error: e instanceof Error ? e.message : "Submit failed" };
      }
    },
    {},
  );
  const { score, answers, results, error } = state;

  if (quiz.length === 0)
    return (
      <div className="empty-note">
        <p className="empty-title">No questions for this one.</p>
        <p>
          The source may have been too short to quiz on. The cards tab has
          whatever Claude could glean.
        </p>
      </div>
    );

  return (
    <form className="quiz" action={formAction}>
      {score !== undefined && (
        <p className="score" role="status">
          Score: {score} / {quiz.length}{" "}
          <button type="button" onClick={onSubmitted}>
            view history →
          </button>
        </p>
      )}
      {quiz.map((q, qi) => {
        const result = results?.[qi];
        return (
          <fieldset
            key={qi}
            className="question"
            disabled={isPending || !!results}
          >
            <legend>
              {qi + 1}. {q.question}
            </legend>
            {q.options.map((option, oi) => {
              const cls = result
                ? oi === result.answerIndex
                  ? "correct"
                  : answers?.[qi] === oi
                    ? "incorrect"
                    : ""
                : "";
              return (
                <label key={oi} className={`option ${cls}`}>
                  <input
                    type="radio"
                    name={`q${qi}`}
                    value={oi}
                    required
                    defaultChecked={answers?.[qi] === oi}
                  />
                  <span className="option-letter" aria-hidden="true">
                    {String.fromCharCode(65 + oi)}
                  </span>
                  <span className="option-text">{option}</span>
                </label>
              );
            })}
            {result && <p className="explanation">{result.explanation}</p>}
          </fieldset>
        );
      })}
      {!results && (
        <button type="submit" disabled={isPending}>
          {isPending ? "Grading…" : error ? "Try again" : "Submit"}
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error} Your answers are still on the sheet.
        </p>
      )}
    </form>
  );
}
