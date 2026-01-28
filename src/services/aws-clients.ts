import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { TranscribeStreamingClient } from '@aws-sdk/client-transcribe-streaming';
import { PollyClient } from '@aws-sdk/client-polly';
import { env } from '../config/env';

function getAwsConfig() {
  return {
    region: env.aws.region,
    credentials: {
      accessKeyId: env.aws.accessKeyId,
      secretAccessKey: env.aws.secretAccessKey,
    },
  };
}

let bedrockClient: BedrockRuntimeClient | null = null;
let transcribeClient: TranscribeStreamingClient | null = null;
let pollyClient: PollyClient | null = null;

export function getBedrockClient(): BedrockRuntimeClient {
  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient(getAwsConfig());
    console.log(`[AWS] Bedrock client initialized (region: ${env.aws.region})`);
  }
  return bedrockClient;
}

export function getTranscribeClient(): TranscribeStreamingClient {
  if (!transcribeClient) {
    transcribeClient = new TranscribeStreamingClient(getAwsConfig());
    console.log(`[AWS] Transcribe client initialized (region: ${env.aws.region})`);
  }
  return transcribeClient;
}

export function getPollyClient(): PollyClient {
  if (!pollyClient) {
    pollyClient = new PollyClient(getAwsConfig());
    console.log(`[AWS] Polly client initialized (region: ${env.aws.region})`);
  }
  return pollyClient;
}
