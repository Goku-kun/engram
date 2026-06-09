import { describe, expect, it } from "vitest";
import {
  CreateUploadSchema,
  QuizQuestionSchema,
  StudyPackSchema,
} from "./schemas";

const validQuestion = {
  question: "What does the S3 event notification trigger?",
  options: [
    "The api Lambda",
    "The processor Lambda",
    "API Gateway",
    "DynamoDB Streams",
  ],
  answerIndex: 1,
  explanation: "Object-created events under uploads/ invoke the processor.",
};

const validPack = {
  title: "Serverless Basics",
  summary: "A summary.\n\nMore summary.",
  cards: Array.from({ length: 8 }, (_, i) => ({
    front: `Q${i}`,
    back: `A${i}`,
  })),
  quiz: Array.from({ length: 5 }, () => validQuestion),
};

describe("StudyPackSchema", () => {
  it("accepts a valid pack", () => {
    expect(StudyPackSchema.safeParse(validPack).success).toBe(true);
  });

  it("rejects too few cards", () => {
    const result = StudyPackSchema.safeParse({
      ...validPack,
      cards: validPack.cards.slice(0, 3),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an out-of-range answerIndex", () => {
    const bad = { ...validQuestion, answerIndex: 4 };
    expect(QuizQuestionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a quiz question with the wrong option count", () => {
    const bad = {
      ...validQuestion,
      options: validQuestion.options.slice(0, 3),
    };
    expect(QuizQuestionSchema.safeParse(bad).success).toBe(false);
  });
});

describe("CreateUploadSchema", () => {
  it("accepts a pdf upload", () => {
    expect(
      CreateUploadSchema.safeParse({
        filename: "notes.pdf",
        contentType: "application/pdf",
      }).success,
    ).toBe(true);
  });

  it("rejects disallowed content types", () => {
    expect(
      CreateUploadSchema.safeParse({
        filename: "evil.exe",
        contentType: "application/x-msdownload",
      }).success,
    ).toBe(false);
  });
});
