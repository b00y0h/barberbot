import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';

describe('bedrock-client', () => {
  let getBedrockRuntimeClient: () => import('@aws-sdk/client-bedrock-runtime').BedrockRuntimeClient;
  let BEDROCK_MODEL_CONVERSATION: string;
  let BEDROCK_MODEL_SUMMARY: string;

  beforeEach(async () => {
    // Fresh import for each test
    // Note: In production, we'd reset the singleton, but for unit tests
    // we're mainly testing the export structure
    const module = await import('./bedrock-client');
    getBedrockRuntimeClient = module.getBedrockRuntimeClient;
    BEDROCK_MODEL_CONVERSATION = module.BEDROCK_MODEL_CONVERSATION;
    BEDROCK_MODEL_SUMMARY = module.BEDROCK_MODEL_SUMMARY;
  });

  describe('getBedrockRuntimeClient()', () => {
    it('exports getBedrockRuntimeClient function', () => {
      assert.strictEqual(typeof getBedrockRuntimeClient, 'function');
    });

    it('returns a BedrockRuntimeClient instance', () => {
      const client = getBedrockRuntimeClient();
      assert.ok(client, 'should return a client');
      assert.strictEqual(typeof client.send, 'function', 'client should have send method');
    });

    it('returns the same instance on multiple calls (singleton)', () => {
      const client1 = getBedrockRuntimeClient();
      const client2 = getBedrockRuntimeClient();
      assert.strictEqual(client1, client2, 'should return same instance');
    });
  });

  describe('model constants', () => {
    it('exports BEDROCK_MODEL_CONVERSATION constant', () => {
      assert.strictEqual(
        BEDROCK_MODEL_CONVERSATION,
        'anthropic.claude-3-5-sonnet-20241022-v2:0',
        'should use Claude 3.5 Sonnet for conversation'
      );
    });

    it('exports BEDROCK_MODEL_SUMMARY constant', () => {
      assert.strictEqual(
        BEDROCK_MODEL_SUMMARY,
        'anthropic.claude-3-5-haiku-20241022-v1:0',
        'should use Claude 3.5 Haiku for summaries'
      );
    });
  });
});
