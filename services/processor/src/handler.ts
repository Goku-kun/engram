import type { S3Event } from "aws-lambda";
import {
  generateText,
  NoObjectGeneratedError,
  Output,
  type ModelMessage,
} from "ai";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  BatchWriteCommand,
  type BatchWriteCommandInput,
  GetCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  cardSk,
  type Deck,
  deckSk,
  deckPk,
  getDocClient,
  quizSk,
  StudyPackSchema,
  type StudyPack,
  tableName,
  userPk,
} from "@engram/shared";
import { getModel } from "./model";

const s3 = new S3Client({});

const PROMPT = `You are an expert author of study material. The attachment is something
the user wants to learn deeply. Read all of it before writing anything, and give every
section equal weight — late sections matter as much as early ones. If the material is a
photo or scan, work only from what is legible. Write in the language of the material.

Produce a study pack:

title — short and descriptive, drawn from the material itself.

summary — 2-3 plain-prose paragraphs of the core ideas: what someone should still
remember a month from now, not a table of contents.

cards (8-30, scaled to the material's density) — one atomic fact or concept per card.
The front is a recall cue with a single specific answer: a question, a term to define,
or an "explain X". The back is that answer in 1-3 precise sentences. Every card must
stand alone — no "according to the passage", no "as covered in section 2". An example
of the standard: front "What problem does a presigned POST solve that a presigned PUT
cannot?" → back "Enforcing a maximum upload size: the POST policy carries a
content-length-range condition that S3 itself validates, while a PUT URL accepts
whatever the client sends."

quiz (5-15, scaled likewise) — multiple-choice questions that test understanding and
application: "which of these is an example of X", "what would happen if Y", "why does
Z work". All four options must be the same kind of thing, similar in length and detail.
Each wrong option reflects a real misconception a learner might hold; never use
"all of the above" or "none of the above". Spread the correct answer's position roughly
evenly across the four slots over the quiz. The explanation says why the correct answer
is right and why the most tempting wrong option fails, in 1-2 sentences.

Base everything strictly on the provided material. Always produce at least 8 cards and
5 quiz questions — for thin material, approach the same core ideas from different
angles (definition, application, contrast) rather than inventing facts.`;

interface ParsedKey {
  userId: string;
  deckId: string;
}

function parseKey(rawKey: string): ParsedKey | undefined {
  const key = decodeURIComponent(rawKey.replace(/\+/g, " "));
  const [prefix, userId, deckId] = key.split("/");
  if (prefix !== "uploads" || !userId || !deckId) return;
  return { userId, deckId };
}

function buildUserMessage(contentType: string, body: Buffer): ModelMessage {
  if (contentType === "application/pdf") {
    return {
      role: "user",
      content: [
        { type: "file", data: body, mediaType: "application/pdf" },
        { type: "text", text: PROMPT },
      ],
    };
  }
  if (contentType.startsWith("image/")) {
    return {
      role: "user",
      content: [
        { type: "image", image: body, mediaType: contentType },
        { type: "text", text: PROMPT },
      ],
    };
  }

  return {
    role: "user",
    content: [
      {
        type: "text",
        text: `<material>\n${body.toString("utf-8")}\n</material>`,
      },
      { type: "text", text: PROMPT },
    ],
  };
}

async function generateStudyPack(
  contentType: string,
  body: Buffer,
): Promise<StudyPack> {
  const model = await getModel();
  const message = buildUserMessage(contentType, body);

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // try
      const { output } = await generateText({
        model,
        output: Output.object({ schema: StudyPackSchema }),
        messages: [message],
        maxOutputTokens: 16_000,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(4 * 60 * 1000),
      });
      return output;
    } catch (error) {
      if (!NoObjectGeneratedError.isInstance(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

async function writeStudyPack(deckId: string, pack: StudyPack): Promise<void> {
  const doc = getDocClient();
  const items = [
    ...pack.cards.map((card, i) => {
      return {
        PK: deckPk(deckId),
        SK: cardSk(i + 1),
        ...card,
      };
    }),
    ...pack.quiz.map((q, i) => {
      return {
        PK: deckPk(deckId),
        SK: quizSk(i + 1),
        ...q,
      };
    }),
  ];

  for (let i = 0; i < items.length; i++) {
    let requestItems: BatchWriteCommandInput["RequestItems"] = {
      [tableName()]: items.slice(i, i + 25).map((item) => {
        return { PutRequest: { Item: item } };
      }),
    };

    for (
      let attempt = 0;
      requestItems && Object.keys(requestItems).length > 0;
      attempt++
    ) {
      if (attempt > 3)
        throw new Error("BatchWrite: unprocessed items after retries");
      if (attempt > 0)
        await new Promise((r) => setTimeout(r, 100 * 2 ** attempt));
      const out = (await doc.send(
        new BatchWriteCommand({ RequestItems: requestItems }),
      )) as { UnprocessedItems: BatchWriteCommandInput["RequestItems"] };
      requestItems = out.UnprocessedItems;
    }
  }
}

async function setDeckStatus(
  userId: string,
  deckId: string,
  fields: Record<string, unknown>,
  removeFields: string[] = [],
): Promise<void> {
  const names = Object.fromEntries(
    [...Object.keys(fields), ...removeFields].map((k) => [`#${k}`, k]),
  );

  const values = Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [`:${k}`, v]),
  );

  const setExpr = `SET ${Object.keys(fields)
    .map((k) => `#${k} = :${k}`)
    .join(", ")}`;
  const removeExpr = removeFields.length
    ? ` REMOVE ${removeFields.map((k) => `#${k}`).join(", ")}`
    : "";

  await getDocClient().send(
    new UpdateCommand({
      TableName: tableName(),
      Key: { PK: userPk(userId), SK: deckSk(deckId) },
      UpdateExpression: setExpr + removeExpr,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

export async function handler(event: S3Event): Promise<void> {
  for (const record of event.Records) {
    const parsed = parseKey(record.s3.object.key);
    if (!parsed) {
      console.warn("Skipping object with unexpected key", record.s3.object.key);
      continue;
    }
    const { userId, deckId } = parsed;

    const existing = await getDocClient().send(
      new GetCommand({
        TableName: tableName(),
        Key: { PK: userPk(userId), SK: deckSk(deckId) },
      }),
    );
    const deck = existing.Item as Deck | undefined;
    if (!deck) {
      console.warn("No deck record for upload; skipping", { deckId });
      continue;
    }
    if (deck.status === "ready" || deck.status === "processing") {
      console.log("Deck already handled; skipping duplicate event", { deckId });
      continue;
    }

    await setDeckStatus(userId, deckId, { status: "processing" });
    try {
      const object = await s3.send(
        new GetObjectCommand({
          Bucket: record.s3.bucket.name,
          Key: decodeURIComponent(record.s3.object.key.replace(/\+/g, " ")),
        }),
      );
      const body = Buffer.from(await object.Body!.transformToByteArray());

      console.log("Calling Claude", { deckId, bytes: body.length });
      const pack = await generateStudyPack(deck.contentType, body);

      await writeStudyPack(deckId, pack);

      await setDeckStatus(
        userId,
        deckId,
        {
          status: "ready",
          title: pack.title,
          summary: pack.summary,
          cardCount: pack.cards.length,
          quizCount: pack.quiz.length,
        },
        ["error"],
      );
      console.log("Deck ready", {
        deckId,
        cards: pack.cards.length,
        quiz: pack.quiz.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Processing failed", { deckId, message });
      await setDeckStatus(userId, deckId, { status: "failed", error: message });
    }
  }
}
