import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";

import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import {
  CreateUploadSchema,
  deckSk,
  getDocClient,
  tableName,
  userPk,
} from "@engram/shared";
import { error } from "node:console";

const s3 = new S3Client({});
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const URL_EXPIRY_SECONDS = 300;

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

function sanitizeFilename(filename: string): string {
  const base = filename.split("/").pop()!.split("\\").pop()!;
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "upload";
}

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  let raw: unknown;
  try {
    const body = event.isBase64Encoded
      ? Buffer.from(event.body ?? "", "base64").toString("utf-8")
      : (event.body ?? "{}");
    raw = JSON.parse(body);
  } catch (error) {
    console.error(error);
    return json(400, { error: "Request body must be valid JSON" });
  }

  const parsed = CreateUploadSchema.safeParse(raw);
  if (!parsed.success) {
    return json(400, { error: "Invalid request", issues: parsed.error.issues });
  }

  const userId = userIdFromEvent(event);
  if (!userId) return json(401, { error: "Unauthenticated" });

  const { filename, contentType } = parsed.data;
  const deckId = randomUUID();
  const key = `uploads/${userId}/${deckId}/${sanitizeFilename(filename)}`;
  const createdAt = new Date().toISOString();

  await getDocClient().send(
    new PutCommand({
      TableName: tableName(),
      Item: {
        PK: userPk(userId),
        SK: deckSk(deckId),
        deckId,
        userId: userId,
        title: filename,
        status: "awaiting-upload",
        sourceKey: key,
        contentType,
        createdAt,
      },
    }),
  );

  const upload = await createPresignedPost(s3, {
    Bucket: process.env.BUCKET_NAME!,
    Key: key,
    Conditions: [
      ["content-length-range", 1, MAX_UPLOAD_BYTES],
      ["eq", "$Content-Type", contentType],
    ],
    Fields: { "Content-Type": contentType },
    Expires: URL_EXPIRY_SECONDS,
  });

  return json(201, { upload, deckId });
}
