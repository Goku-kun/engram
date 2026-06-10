import { createAnthropic } from "@ai-sdk/anthropic";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import type { LanguageModel } from "ai";

let model: LanguageModel | undefined;

export async function getModel(): Promise<LanguageModel> {
  if (model) return model;

  const paramName = process.env.ANTHROPIC_API_KEY_PARAM;
  if (!paramName) throw new Error("ANTHROPIC_API_KEY_PARAM env var is not set");

  const ssm = new SSMClient({});
  const result = await ssm.send(
    new GetParameterCommand({ Name: paramName, WithDecryption: true }),
  );
  const apiKey = result.Parameter?.Value;
  if (!apiKey) throw new Error(`SSM Parameter ${paramName} has no value`);

  const anthropic = createAnthropic({ apiKey });
  model = anthropic(process.env.ENGRAM_MODEL ?? "claude-opus-4-8");
  return model;
}
