import { createAnthropic } from "@ai-sdk/anthropic";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { EmbeddingModel, type LanguageModel } from "ai";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";

let model: LanguageModel | undefined;
let embeddingModel: EmbeddingModel | undefined;

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

export function getEmbeddingModel(): EmbeddingModel {
  if (!embeddingModel) {
    const bedrock = createAmazonBedrock({
      region: process.env.AWS_REGION,
      credentialProvider: fromNodeProviderChain(),
    });
    embeddingModel = bedrock.embedding("amazon.titan-embed-text-v2:0");
  }
  return embeddingModel;
}
