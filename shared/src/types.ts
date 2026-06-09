export type DeckStatus = 'awaiting-upload' | 'processing' | 'ready' | 'failed';

export interface Deck {
  deckId: string;
  userId: string;
  title: string;
  status: DeckStatus;
  sourceKey: string;
  contentType: string;
  createdAt: string; // ISO-8601
  summary?: string;
  cardCount?: number;
  quizCount?: number;
  error?: string;
}

export interface Card {
  front: string;
  back: string;
}

/** Quiz question as stored. The API strips answerIndex/explanation before sending to clients. */
export interface QuizQuestion {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

export interface Attempt {
  deckId: string;
  takenAt: string; // ISO-8601
  score: number;
  total: number;
  answers: number[];
}

