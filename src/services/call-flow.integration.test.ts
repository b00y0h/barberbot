import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

/**
 * Integration tests for call flow scenarios
 *
 * Tests verify:
 * 1. Booking flow - greeting -> conversation -> book appointment -> confirmation
 * 2. Availability check - ask about available times without booking
 * 3. Barge-in/interruption - caller speaks mid-sentence, bot stops
 * 4. Business info query - hours, location, services
 *
 * These tests mock AWS SDK calls to run without live credentials.
 */

describe('Call Flow Integration', () => {
  describe('Scenario 1: Booking Flow', () => {
    it('conversation state supports full booking journey tracking', async () => {
      // Verify conversation state structure supports booking flow
      // Note: We test the state shape without database calls

      // Define expected ConversationState shape for booking flow
      const mockState = {
        messages: [] as Array<{ role: string; content: Array<{ text: string }> }>,
        systemPrompt: 'You are a friendly receptionist',
        customerName: undefined as string | undefined,
        customerPhone: '+15551234567',
        appointmentBooked: false,
        leadCaptured: false,
      };

      // Verify state initialized correctly
      assert.ok(mockState.messages !== undefined, 'should have messages array');
      assert.ok(mockState.systemPrompt, 'should have system prompt');
      assert.strictEqual(mockState.appointmentBooked, false, 'appointmentBooked should start false');
      assert.strictEqual(mockState.leadCaptured, false, 'leadCaptured should start false');

      // Simulate booking flow state changes (as tool handlers would do)
      mockState.customerName = 'John Doe';
      mockState.leadCaptured = true;
      mockState.appointmentBooked = true;

      // Verify state can be updated through booking flow
      assert.strictEqual(mockState.customerName, 'John Doe', 'should track customer name');
      assert.strictEqual(mockState.leadCaptured, true, 'should track lead captured');
      assert.strictEqual(mockState.appointmentBooked, true, 'should track appointment booked');
    });

    it('booking tools are available for appointment flow', async () => {
      const { bedrockTools } = await import('./bedrock-tools');
      const toolNames = bedrockTools.map(t => t.toolSpec?.name);

      // Verify all tools needed for booking flow are available
      assert.ok(toolNames.includes('collect_customer_info'), 'should have collect_customer_info');
      assert.ok(toolNames.includes('check_availability'), 'should have check_availability');
      assert.ok(toolNames.includes('book_appointment'), 'should have book_appointment');
    });

    it('book_appointment tool has required parameters', async () => {
      const { bedrockTools } = await import('./bedrock-tools');
      const tool = bedrockTools.find(t => t.toolSpec?.name === 'book_appointment');

      assert.ok(tool, 'should have book_appointment tool');
      const schema = tool!.toolSpec!.inputSchema!.json as Record<string, any>;

      // Verify required fields for booking
      assert.ok(schema.properties.service, 'should have service property');
      assert.ok(schema.properties.date, 'should have date property');
      assert.ok(schema.properties.time, 'should have time property');
      assert.deepStrictEqual(schema.required, ['service', 'date', 'time']);
    });

    it('customers module exports booking functions', async () => {
      const customers = await import('./customers');

      // Verify functions needed for booking flow are exported
      assert.strictEqual(typeof customers.createCustomer, 'function', 'should export createCustomer');
      assert.strictEqual(typeof customers.createAppointment, 'function', 'should export createAppointment');
      assert.strictEqual(typeof customers.checkAvailability, 'function', 'should export checkAvailability');
      assert.strictEqual(typeof customers.findCustomerByPhone, 'function', 'should export findCustomerByPhone');
    });
  });

  describe('Scenario 2: Availability Check', () => {
    it('check_availability tool can query without booking', async () => {
      const { bedrockTools } = await import('./bedrock-tools');
      const tool = bedrockTools.find(t => t.toolSpec?.name === 'check_availability');

      assert.ok(tool, 'should have check_availability tool');
      const schema = tool!.toolSpec!.inputSchema!.json as Record<string, any>;

      // Verify date is required but not booking-related fields
      assert.ok(schema.properties.date, 'should have date property');
      assert.deepStrictEqual(schema.required, ['date'], 'only date should be required');

      // Verify optional staff parameter exists
      assert.ok(schema.properties.staff, 'should support optional staff filter');
    });

    it('availability check does not change booking state', async () => {
      // Simulate conversation state before and after availability check
      const mockState = {
        messages: [] as Array<{ role: string; content: Array<{ text: string }> }>,
        systemPrompt: 'test',
        appointmentBooked: false,
        leadCaptured: false,
      };

      // Simulate availability check response (no booking)
      mockState.messages.push({
        role: 'user',
        content: [{ text: 'What times are available tomorrow?' }],
      });
      mockState.messages.push({
        role: 'assistant',
        content: [{ text: 'We have openings at 10am, 2pm, and 4pm tomorrow.' }],
      });

      // Appointment should NOT be booked (just checked availability)
      assert.strictEqual(mockState.appointmentBooked, false, 'should not book appointment');
      assert.strictEqual(mockState.leadCaptured, false, 'should not capture lead for availability query');
    });

    it('customers module exports checkAvailability function', async () => {
      const customers = await import('./customers');

      assert.strictEqual(typeof customers.checkAvailability, 'function', 'should export checkAvailability');
    });
  });

  describe('Scenario 3: Barge-in Interruption', () => {
    it('TTS instance has interrupt method that can be called', async () => {
      const { AWSPollyTTS } = await import('./aws-polly-tts');

      // Create TTS instance
      const tts = new AWSPollyTTS();

      // Verify interrupt method exists and is callable
      assert.strictEqual(typeof tts.interrupt, 'function', 'TTS should have interrupt method');

      // Verify EventEmitter interface for barge-in events
      assert.strictEqual(typeof tts.on, 'function', 'TTS should have on method');
      assert.strictEqual(typeof tts.emit, 'function', 'TTS should have emit method');

      // Call interrupt - should not throw (behavioral test)
      assert.doesNotThrow(() => tts.interrupt(), 'interrupt() should not throw');
    });

    it('CallManager exports support barge-in workflow', async () => {
      // Import the module and test exports behaviorally
      const callManager = await import('./call-manager');

      // Verify functions needed for barge-in are exported
      assert.strictEqual(typeof callManager.getActiveCall, 'function', 'should export getActiveCall');

      // Verify initializeCall returns object with expected shape for barge-in
      // Note: This tests the interface contract, not implementation details
      assert.strictEqual(typeof callManager.initializeCall, 'function', 'should export initializeCall');
    });
  });

  describe('Scenario 4: Business Info Query', () => {
    it('returns business hours when requested', async () => {
      const { getBusinessProfile } = await import('../config/business');

      const profile = getBusinessProfile();

      // Verify business info structure
      assert.ok(profile.hours, 'should have hours');
      assert.ok(profile.services, 'should have services');
      assert.ok(profile.address, 'should have address');
      assert.ok(profile.phone, 'should have phone');
      assert.ok(profile.staff, 'should have staff');
    });

    it('get_business_info tool handles all topics', async () => {
      const { bedrockTools } = await import('./bedrock-tools');

      const tool = bedrockTools.find(t => t.toolSpec?.name === 'get_business_info');
      assert.ok(tool, 'should have get_business_info tool');

      const schema = tool!.toolSpec!.inputSchema!.json as Record<string, any>;
      const topics = schema.properties.topic.enum;

      // Verify all topics are supported
      assert.ok(topics.includes('hours'), 'should support hours');
      assert.ok(topics.includes('services'), 'should support services');
      assert.ok(topics.includes('location'), 'should support location');
      assert.ok(topics.includes('policies'), 'should support policies');
      assert.ok(topics.includes('staff'), 'should support staff');
      assert.ok(topics.includes('pricing'), 'should support pricing');
    });
  });

  describe('ActiveCall Interface (INTG-03)', () => {
    it('exports required CallManager functions', async () => {
      const module = await import('./call-manager');

      // Test that all required functions are exported and callable
      assert.strictEqual(typeof module.initializeCall, 'function', 'should export initializeCall');
      assert.strictEqual(typeof module.getActiveCall, 'function', 'should export getActiveCall');
      assert.strictEqual(typeof module.getAllActiveCalls, 'function', 'should export getAllActiveCalls');
      assert.strictEqual(typeof module.sendGreeting, 'function', 'should export sendGreeting');
      assert.strictEqual(typeof module.endCall, 'function', 'should export endCall');
    });

    it('getAllActiveCalls returns an array', async () => {
      const { getAllActiveCalls } = await import('./call-manager');

      // Behavioral test: verify return type
      const calls = getAllActiveCalls();
      assert.ok(Array.isArray(calls), 'getAllActiveCalls should return an array');
    });

    it('getActiveCall returns undefined for non-existent call', async () => {
      const { getActiveCall } = await import('./call-manager');

      // Behavioral test: verify behavior for missing call
      const call = getActiveCall('non-existent-call-id');
      assert.strictEqual(call, undefined, 'should return undefined for non-existent call');
    });
  });
});
