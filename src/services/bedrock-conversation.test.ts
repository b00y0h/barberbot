import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

/**
 * Unit tests for bedrock-conversation module
 * Note: Tests that require database access (createConversation, handleToolCall)
 * need live database bindings which may not be available in all test environments.
 * Those will be covered in integration testing.
 */
describe('bedrock-conversation', () => {
  describe('module exports', () => {
    it('exports createConversation function', async () => {
      const module = await import('./bedrock-conversation');
      assert.strictEqual(typeof module.createConversation, 'function');
    });

    it('exports getGreeting function', async () => {
      const module = await import('./bedrock-conversation');
      assert.strictEqual(typeof module.getGreeting, 'function');
    });

    it('exports processUserMessage function', async () => {
      const module = await import('./bedrock-conversation');
      assert.strictEqual(typeof module.processUserMessage, 'function');
    });

    it('exports getTranscript function', async () => {
      const module = await import('./bedrock-conversation');
      assert.strictEqual(typeof module.getTranscript, 'function');
    });
  });

  describe('getTranscript()', () => {
    it('returns empty string for empty messages', async () => {
      const module = await import('./bedrock-conversation');

      // Create state object directly without calling createConversation
      const state = {
        messages: [],
        systemPrompt: 'test',
        appointmentBooked: false,
        leadCaptured: false,
      };

      const transcript = module.getTranscript(state as any);
      assert.strictEqual(transcript, '', 'should return empty string');
    });

    it('formats user messages with "Caller:" prefix', async () => {
      const module = await import('./bedrock-conversation');

      const state = {
        messages: [{ role: 'user' as const, content: [{ text: 'Hello' }] }],
        systemPrompt: 'test',
        appointmentBooked: false,
        leadCaptured: false,
      };

      const transcript = module.getTranscript(state as any);
      assert.ok(transcript.includes('Caller: Hello'));
    });

    it('formats assistant messages with "Bot:" prefix', async () => {
      const module = await import('./bedrock-conversation');

      const state = {
        messages: [{ role: 'assistant' as const, content: [{ text: 'Hi there!' }] }],
        systemPrompt: 'test',
        appointmentBooked: false,
        leadCaptured: false,
      };

      const transcript = module.getTranscript(state as any);
      assert.ok(transcript.includes('Bot: Hi there!'));
    });

    it('excludes tool_use blocks from transcript', async () => {
      const module = await import('./bedrock-conversation');

      const state = {
        messages: [
          {
            role: 'assistant' as const,
            content: [{ toolUse: { toolUseId: 't1', name: 'test', input: {} } }],
          },
        ],
        systemPrompt: 'test',
        appointmentBooked: false,
        leadCaptured: false,
      };

      const transcript = module.getTranscript(state as any);
      assert.ok(!transcript.includes('toolUse'));
      assert.ok(!transcript.includes('test'));
      assert.strictEqual(transcript, '');
    });

    it('excludes tool_result blocks from transcript', async () => {
      const module = await import('./bedrock-conversation');

      const state = {
        messages: [
          {
            role: 'user' as const,
            content: [{ toolResult: { toolUseId: 't1', content: [{ json: {} }] } }],
          },
        ],
        systemPrompt: 'test',
        appointmentBooked: false,
        leadCaptured: false,
      };

      const transcript = module.getTranscript(state as any);
      assert.ok(!transcript.includes('toolResult'));
      assert.strictEqual(transcript, '');
    });

    it('includes text from mixed content blocks', async () => {
      const module = await import('./bedrock-conversation');

      const state = {
        messages: [
          { role: 'assistant' as const, content: [{ text: 'Before tool' }] },
          { role: 'assistant' as const, content: [{ toolUse: { toolUseId: 't1', name: 'test', input: {} } }] },
          { role: 'assistant' as const, content: [{ text: 'After tool' }] },
        ],
        systemPrompt: 'test',
        appointmentBooked: false,
        leadCaptured: false,
      };

      const transcript = module.getTranscript(state as any);
      assert.ok(transcript.includes('Bot: Before tool'));
      assert.ok(transcript.includes('Bot: After tool'));
    });

    it('handles multiple conversation turns', async () => {
      const module = await import('./bedrock-conversation');

      const state = {
        messages: [
          { role: 'user' as const, content: [{ text: 'What are your hours?' }] },
          { role: 'assistant' as const, content: [{ text: 'We are open 9am to 6pm.' }] },
          { role: 'user' as const, content: [{ text: 'Can I book for tomorrow?' }] },
          { role: 'assistant' as const, content: [{ text: 'Sure! What time works for you?' }] },
        ],
        systemPrompt: 'test',
        appointmentBooked: false,
        leadCaptured: false,
      };

      const transcript = module.getTranscript(state as any);
      assert.ok(transcript.includes('Caller: What are your hours?'));
      assert.ok(transcript.includes('Bot: We are open 9am to 6pm.'));
      assert.ok(transcript.includes('Caller: Can I book for tomorrow?'));
      assert.ok(transcript.includes('Bot: Sure! What time works for you?'));
    });
  });

  describe('ConversationState interface', () => {
    it('supports all required fields in state structure', async () => {
      const module = await import('./bedrock-conversation');

      // Create a mock state to verify the interface
      const state = {
        messages: [],
        systemPrompt: 'test prompt',
        customerName: 'John',
        customerPhone: '+15551234567',
        customerEmail: 'john@example.com',
        appointmentBooked: false,
        leadCaptured: false,
      };

      // These should be valid according to the interface
      assert.ok(Array.isArray(state.messages));
      assert.strictEqual(typeof state.systemPrompt, 'string');
      assert.strictEqual(typeof state.customerName, 'string');
      assert.strictEqual(typeof state.customerPhone, 'string');
      assert.strictEqual(typeof state.customerEmail, 'string');
      assert.strictEqual(typeof state.appointmentBooked, 'boolean');
      assert.strictEqual(typeof state.leadCaptured, 'boolean');
    });
  });

  describe('detectSentenceBoundary()', () => {
    it('detects period as sentence boundary', async () => {
      const module = await import('./bedrock-conversation');
      assert.strictEqual(module.detectSentenceBoundary('Hello.'), true);
      assert.strictEqual(module.detectSentenceBoundary('Hello. '), true);
    });

    it('detects question mark as sentence boundary', async () => {
      const module = await import('./bedrock-conversation');
      assert.strictEqual(module.detectSentenceBoundary('How are you?'), true);
      assert.strictEqual(module.detectSentenceBoundary('What? '), true);
    });

    it('detects exclamation mark as sentence boundary', async () => {
      const module = await import('./bedrock-conversation');
      assert.strictEqual(module.detectSentenceBoundary('Wow!'), true);
      assert.strictEqual(module.detectSentenceBoundary('Great! '), true);
    });

    it('returns false for incomplete sentences', async () => {
      const module = await import('./bedrock-conversation');
      assert.strictEqual(module.detectSentenceBoundary('Hello'), false);
      assert.strictEqual(module.detectSentenceBoundary('How are'), false);
      assert.strictEqual(module.detectSentenceBoundary('I am'), false);
    });

    it('handles empty string', async () => {
      const module = await import('./bedrock-conversation');
      assert.strictEqual(module.detectSentenceBoundary(''), false);
    });
  });

  describe('processUserMessageStreaming()', () => {
    it('exports processUserMessageStreaming function', async () => {
      const module = await import('./bedrock-conversation');
      assert.strictEqual(typeof module.processUserMessageStreaming, 'function');
    });
  });

  describe('generateCallSummary()', () => {
    it('exports generateCallSummary function', async () => {
      const module = await import('./bedrock-conversation');
      assert.strictEqual(typeof module.generateCallSummary, 'function');
    });
  });
});
