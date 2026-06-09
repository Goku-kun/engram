export const DEMO_USER_ID = 'demo-user'; // single user for now; Cognito integration is v2

export const userPk = (userId: string) => `USER#${userId}`;
export const deckSk = (deckId: string) => `DECK#${deckId}`;
export const deckPk = (deckId: string) => `DECK#${deckId}`;
export const cardSk = (n: number) => `CARD#${String(n).padStart(3, '0')}`;
export const quizSk = (n: number) => `QUIZ#${String(n).padStart(3, '0')}`;
export const attemptSk = (takenAt: string) => `ATTEMPT#${takenAt}`;

