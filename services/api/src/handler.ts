import type {
  APIGatewayProxyResultV2,
  APIGatewayProxyEventV2WithJWTAuthorizer,
} from "aws-lambda";
import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  attemptSk,
  type Attempt,
  type Card,
  CreateAttemptSchema,
  type Deck,
  deckPk,
  deckSk,
  getDocClient,
  type QuizQuestion,
  tableName,
  userPk,
} from "@engram/shared";

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

function userIdFromEvent(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): string | undefined {
  const sub = event.requestContext.authorizer?.jwt?.claims?.sub;
  return typeof sub === "string" && sub ? sub : undefined;
}

async function listDecks(userId: string): Promise<APIGatewayProxyResultV2> {
  const result = await getDocClient().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": userPk(userId),
        ":sk": "DECK#",
      },
    }),
  );

  const items = (result.Items ?? []) as (Deck & { PK?: string; SK?: string })[];

  const decks = items.map(({ PK: _pk, SK: _sk, ...deck }) => deck);
  decks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return json(200, { decks });
}

async function getDeckMeta(
  userId: string,
  deckId: string,
): Promise<Deck | undefined> {
  const result = await getDocClient().send(
    new GetCommand({
      TableName: tableName(),
      Key: { PK: userPk(userId), SK: deckSk(deckId) },
    }),
  );
  return result.Item as Deck | undefined;
}

interface DeckContents {
  cards: Card[];
  quiz: QuizQuestion[];
}

async function getDeckContents(deckId: string): Promise<DeckContents> {
  const result = await getDocClient().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: "PK = :pk AND SK >= :card",
      ExpressionAttributeValues: { ":pk": deckPk(deckId), ":card": "CARD#" },
    }),
  );

  const items = result.Items ?? [];
  return {
    cards: items.filter((i) => String(i.SK).startsWith("CARD#")) as Card[],
    quiz: items.filter((i) =>
      String(i.SK).startsWith("QUIZ#"),
    ) as QuizQuestion[],
  };
}

async function getDeck(
  userId: string,
  deckId: string,
): Promise<APIGatewayProxyResultV2> {
  const found = await getDeckMeta(userId, deckId);
  if (!found) return json(404, { error: "Deck not found" });
  const {
    PK: _pk,
    SK: _sk,
    ...deck
  } = found as Deck & { PK?: string; SK?: string };

  if (deck.status !== "ready") {
    // Poll responses while processing: meta only, no contents yet.
    return json(200, { deck, cards: [], quiz: [] });
  }

  const { cards, quiz } = await getDeckContents(deckId);
  const clientCards = cards.map(({ front, back }) => ({ front, back }));
  const clientQuiz = quiz.map(({ question, options }) => ({
    question,
    options,
  }));
  return json(200, { deck, cards: clientCards, quiz: clientQuiz });
}

async function createAttempt(
  userId: string,
  deckId: string,
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  let raw: unknown;
  try {
    const body = event.isBase64Encoded
      ? Buffer.from(event.body ?? "", "base64").toString("utf-8")
      : (event.body ?? "{}");
    raw = JSON.parse(body || "{}");
  } catch {
    return json(400, { error: "Request body must be valid JSON" });
  }
  const parsed = CreateAttemptSchema.safeParse(raw);
  if (!parsed.success) {
    return json(400, { error: "Invalid request", issues: parsed.error.issues });
  }

  const deck = await getDeckMeta(userId, deckId);
  if (!deck) return json(404, { error: "Deck not found" });
  if (deck.status !== "ready")
    return json(409, { error: `Deck is ${deck.status}` });

  const { quiz } = await getDeckContents(deckId);
  const { answers } = parsed.data;
  if (answers.length !== quiz.length) {
    return json(400, {
      error: `Expected ${quiz.length} answers, got ${answers.length}`,
    });
  }

  const results = quiz.map((q, i) => ({
    correct: answers[i] === q.answerIndex,
    answerIndex: q.answerIndex,
    explanation: q.explanation,
  }));
  const score = results.filter((r) => r.correct).length;
  const takenAt = new Date().toISOString();

  const attempt: Attempt = {
    deckId,
    takenAt,
    score,
    total: quiz.length,
    answers,
  };
  await getDocClient().send(
    new PutCommand({
      TableName: tableName(),
      Item: { PK: deckPk(deckId), SK: attemptSk(takenAt), ...attempt },
    }),
  );

  return json(201, { attempt, results });
}

async function listAttempts(
  userId: string,
  deckId: string,
): Promise<APIGatewayProxyResultV2> {
  const deck = await getDeckMeta(userId, deckId);
  if (!deck) return json(404, { error: "Deck not found" });

  const result = await getDocClient().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": deckPk(deckId), ":sk": "ATTEMPT#" },
      ScanIndexForward: false,
    }),
  );
  const items = (result.Items ?? []) as (Attempt & {
    PK?: string;
    SK?: string;
  })[];
  return json(200, {
    attempts: items.map(({ PK: _pk, SK: _sk, ...attempt }) => attempt),
  });
}

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const deckId = event.pathParameters?.deckId;
  const userId = userIdFromEvent(event);
  if (!userId) return json(401, { error: "Unauthenticated" });

  try {
    switch (event.routeKey) {
      case "GET /decks":
        return await listDecks(userId);
      case "GET /decks/{deckId}":
        return await getDeck(userId, deckId!);
      case "POST /decks/{deckId}/attempts":
        return await createAttempt(userId, deckId!, event);
      case "GET /decks/{deckId}/attempts":
        return await listAttempts(userId, deckId!);
      default:
        return json(404, { error: `No route: ${event.routeKey}` });
    }
  } catch (err) {
    console.error("Unhandled error", { routeKey: event.routeKey, err });
    return json(500, { error: "Internal error" });
  }
}
