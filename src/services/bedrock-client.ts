import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { env } from '../config/env';

/**
 * Claude model IDs for AWS Bedrock
 * Conversation uses Sonnet for quality, summaries use Haiku for speed/cost
 */
export const BEDROCK_MODEL_CONVERSATION = 'anthropic.claude-3-5-sonnet-20241022-v2:0';
export const BEDROCK_MODEL_SUMMARY = 'anthropic.claude-3-5-haiku-20241022-v1:0';

/**
 * Lazy singleton for BedrockRuntimeClient
 * Follows established pattern in codebase for AWS clients
 */
let bedrockClient: BedrockRuntimeClient | null = null;

export function getBedrockRuntimeClient(): BedrockRuntimeClient {
  if (!bedrockClient) {
    console.log('[AWS] Initializing BedrockRuntimeClient');
    bedrockClient = new BedrockRuntimeClient({
      region: env.aws.region,
      credentials: {
        accessKeyId: env.aws.accessKeyId,
        secretAccessKey: env.aws.secretAccessKey,
      },
    });
  }
  return bedrockClient;
}
