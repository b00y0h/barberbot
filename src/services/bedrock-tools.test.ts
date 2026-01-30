import { describe, it } from 'node:test';
import assert from 'node:assert';
import { bedrockTools, BedrockMessage, BedrockContentBlock, ToolUseBlock, ToolResultBlock } from './bedrock-tools';

// Helper type for schema assertions
type JsonSchema = {
  type?: string;
  properties?: Record<string, { type?: string; enum?: string[]; description?: string }>;
  required?: string[];
};

describe('bedrock-tools', () => {
  describe('bedrockTools array', () => {
    it('exports array of 4 tools', () => {
      assert.ok(Array.isArray(bedrockTools), 'bedrockTools should be an array');
      assert.strictEqual(bedrockTools.length, 4, 'should have 4 tools');
    });

    it('each tool has toolSpec with name, description, inputSchema', () => {
      for (const tool of bedrockTools) {
        assert.ok(tool.toolSpec, 'tool should have toolSpec');
        assert.ok(tool.toolSpec.name, 'toolSpec should have name');
        assert.ok(tool.toolSpec.description, 'toolSpec should have description');
        assert.ok(tool.toolSpec.inputSchema, 'toolSpec should have inputSchema');
        assert.ok(tool.toolSpec.inputSchema.json, 'inputSchema should have json property');
      }
    });

    it('has collect_customer_info tool', () => {
      const tool = bedrockTools.find(t => t.toolSpec?.name === 'collect_customer_info');
      assert.ok(tool, 'should have collect_customer_info tool');
      const schema = tool.toolSpec?.inputSchema?.json as JsonSchema;
      assert.ok(schema?.properties?.name, 'should have name property');
      assert.ok(schema?.properties?.phone, 'should have phone property');
      assert.ok(schema?.properties?.email, 'should have email property');
    });

    it('has check_availability tool with required date', () => {
      const tool = bedrockTools.find(t => t.toolSpec?.name === 'check_availability');
      assert.ok(tool, 'should have check_availability tool');
      const schema = tool.toolSpec?.inputSchema?.json as JsonSchema;
      assert.ok(schema?.properties?.date, 'should have date property');
      assert.ok(schema?.properties?.staff, 'should have staff property');
      assert.deepStrictEqual(schema?.required, ['date'], 'date should be required');
    });

    it('has book_appointment tool with required fields', () => {
      const tool = bedrockTools.find(t => t.toolSpec?.name === 'book_appointment');
      assert.ok(tool, 'should have book_appointment tool');
      const schema = tool.toolSpec?.inputSchema?.json as JsonSchema;
      assert.ok(schema?.properties?.service, 'should have service property');
      assert.ok(schema?.properties?.date, 'should have date property');
      assert.ok(schema?.properties?.time, 'should have time property');
      assert.deepStrictEqual(schema?.required, ['service', 'date', 'time'], 'service, date, time should be required');
    });

    it('has get_business_info tool with enum topic', () => {
      const tool = bedrockTools.find(t => t.toolSpec?.name === 'get_business_info');
      assert.ok(tool, 'should have get_business_info tool');
      const schema = tool.toolSpec?.inputSchema?.json as JsonSchema;
      assert.ok(schema?.properties?.topic?.enum, 'topic should have enum');
      assert.deepStrictEqual(
        schema?.properties?.topic?.enum,
        ['hours', 'services', 'location', 'policies', 'staff', 'pricing'],
        'enum should match expected values'
      );
    });
  });

  describe('type exports', () => {
    it('BedrockMessage type allows user and assistant roles', () => {
      const userMsg: BedrockMessage = {
        role: 'user',
        content: [{ text: 'hello' }]
      };
      const assistantMsg: BedrockMessage = {
        role: 'assistant',
        content: [{ text: 'hi' }]
      };
      assert.ok(userMsg.role === 'user');
      assert.ok(assistantMsg.role === 'assistant');
    });

    it('BedrockContentBlock supports text blocks', () => {
      const textBlock: BedrockContentBlock = { text: 'hello' };
      assert.ok('text' in textBlock);
    });

    it('ToolUseBlock has required fields', () => {
      const toolUse: ToolUseBlock = {
        toolUse: {
          toolUseId: 'test-id',
          name: 'test_tool',
          input: { key: 'value' }
        }
      };
      assert.strictEqual(toolUse.toolUse.toolUseId, 'test-id');
      assert.strictEqual(toolUse.toolUse.name, 'test_tool');
    });

    it('ToolResultBlock has required fields', () => {
      const toolResult: ToolResultBlock = {
        toolResult: {
          toolUseId: 'test-id',
          content: [{ json: { success: true } }]
        }
      };
      assert.strictEqual(toolResult.toolResult.toolUseId, 'test-id');
    });
  });
});
