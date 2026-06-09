import { z } from "zod";

export const CardSchema = z.object({
  front: z
    .string()
    .describe("The prompt side: a question, term, or cue. Short and specfic."),
  back: z
    .string()
    .describe("The answer side: complete but concise. 1-3 sentences."),
});

export const QuizQuestionSchema = z.object({
  question: z
    .string()
    .describe("A multiple-choice question testing understanding, not trivia."),
  options: z
    .array(z.string())
    .length(4)
    .describe(
      "Exactly 4 plausible options. Distractors should reflect real misconceptions.",
    ),
  answerIndex: z
    .number()
    .int()
    .min(0)
    .max(3)
    .describe("Zero-based index of the correct option."),
  explanation: z
    .string()
    .describe("Why the correct answer is correct, 1-2 sentences."),
});

export const StudyPackSchema = z.object({
  title: z.string().describe("A short, descriptive title for this study deck."),
  summary: z
    .string()
    .describe("A 2-3 paragraph summary of the key ideas in the material."),
  cards: z.array(CardSchema).min(8).max(30),
  quiz: z.array(QuizQuestionSchema).min(5).max(15),
});

export type StudyPack = z.infer<typeof StudyPackSchema>;

// ---------- API request bodies ----------

export const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/plain",
  "text/markdown",
] as const;

export const CreateUploadSchema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.enum(ALLOWED_CONTENT_TYPES),
});

export const CreateAttemptSchema = z.object({
  answers: z.array(z.number().int().min(0).max(3)).min(1).max(50),
});
