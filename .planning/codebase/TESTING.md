# Testing Patterns

**Analysis Date:** 2026-01-27

## Test Framework

**Runner:**
- Not detected - no test framework is configured in this codebase
- No jest.config.js, vitest.config.js, mocha, or similar test framework configuration
- `package.json` contains no test scripts or testing dependencies
- No `*.test.ts`, `*.spec.ts`, or `__tests__` directories present

**Assertion Library:**
- Not applicable - no testing framework is currently in use

**Run Commands:**
- Not configured - no test command defined in `package.json`
- Development command: `npm run dev` starts the application with hot-reload using `tsx`
- Build command: `npm run build` compiles TypeScript to JavaScript

## Current Testing Approach

**Manual Testing:**
- `scripts/test-call.ts` - Manual script for testing call flows
- `scripts/seed-db.ts` - Script to seed database with test data
- Testing appears to be integration/manual rather than unit-tested

**Development Workflow:**
- Hot-reload development: `tsx watch src/index.ts`
- Manual testing through live environment or test scripts
- TypeScript strict mode provides static type safety

## Testing Gaps & Recommendations

**Critical Untested Areas:**
- `src/services/conversation.ts` - Core LLM integration and tool calling logic
  - Files: `src/services/conversation.ts`
  - Risk: Tool call handling has multiple branching paths that could silently fail
  - Test needs: Unit tests for each tool type (collect_customer_info, check_availability, book_appointment, get_business_info)

- `src/services/call-manager.ts` - Call lifecycle management
  - Files: `src/services/call-manager.ts`
  - Risk: Complex async state management with timers; race conditions possible
  - Test needs: Integration tests for call initialization, utterance handling, concurrent calls

- `src/services/audio-pipeline.ts` - WebSocket message handling
  - Files: `src/services/audio-pipeline.ts`
  - Risk: Event message parsing and routing; JSON parsing could fail silently
  - Test needs: Unit tests for each message event type (connected, start, media, mark, stop)

- `src/database/` - Database operations
  - Files: `src/database/index.ts`, `src/services/customers.ts`
  - Risk: SQL queries, foreign key constraints, concurrent writes
  - Test needs: Integration tests with test database, transaction handling

- `src/routes/` - Express route handlers
  - Files: `src/routes/voice.ts`, `src/routes/admin.ts`
  - Risk: Request parsing, error responses, status code validation
  - Test needs: Integration tests using supertest or similar

- `src/services/stt.ts` - Speech-to-text integration
  - Files: `src/services/stt.ts`
  - Risk: Event handling, connection lifecycle, error propagation
  - Test needs: Mock Deepgram SDK, test event emission patterns

- `src/services/tts.ts` - Text-to-speech and audio encoding
  - Files: `src/services/tts.ts`
  - Risk: Audio buffer operations, PCM conversion, resampling edge cases
  - Test needs: Unit tests for `pcmToMulaw()` and `resamplePCM()` with known input/output pairs

## Patterns to Establish

**Unit Testing Pattern (Recommended):**
```typescript
// Example: Testing tool call handling in conversation.ts
import { handleToolCall } from '../src/services/conversation';

describe('handleToolCall', () => {
  it('should collect customer info and mark lead as captured', () => {
    const state = { messages: [], leadCaptured: false } as ConversationState;
    const result = handleToolCall('collect_customer_info',
      { name: 'John', phone: '555-1234', email: 'john@example.com' },
      state,
      '555-1234'
    );

    expect(state.leadCaptured).toBe(true);
    expect(JSON.parse(result).success).toBe(true);
  });
});
```

**Integration Testing Pattern (Recommended):**
```typescript
// Example: Testing call lifecycle
describe('Call Lifecycle', () => {
  it('should initialize call and setup STT handlers', async () => {
    const call = await initializeCall('test-sid', '555-1234');

    expect(call.stt).toBeDefined();
    expect(call.tts).toBeDefined();
    expect(call.conversation.messages.length).toBeGreaterThan(0);
  });
});
```

**Async Testing Pattern:**
- All async operations need to be awaited
- Promise rejection handling in try-catch blocks
- Timeout handling for operations like STT utterance buffering (700ms timeout in call-manager)

**Mocking Patterns (Recommended):**
- Mock Deepgram SDK in `src/services/stt.ts` tests
- Mock OpenAI SDK in `src/services/conversation.ts` tests
- Mock Twilio SDK in `src/services/twilio.ts` tests
- Mock database in `src/services/customers.ts` tests

**What to Mock:**
- External API services: OpenAI, Deepgram, Twilio, ElevenLabs
- Database connections (use in-memory SQLite for integration tests)
- WebSocket connections
- EventEmitter event handlers can be spied on

**What NOT to Mock:**
- Internal service coordination (call-manager to conversation to STT flow)
- Database schema and queries (use test database)
- Express routing and middleware

## Test File Organization

**Recommended Location:**
- Co-located with source: `src/services/conversation.test.ts` alongside `src/services/conversation.ts`
- Or separate directory: `tests/services/` mirroring `src/services/`

**Naming Convention:**
- Use `.test.ts` suffix: `conversation.test.ts`, `call-manager.test.ts`
- Or `.spec.ts` suffix: `conversation.spec.ts` (either pattern works)

**Recommended Structure:**
```
src/
  services/
    conversation.ts
    conversation.test.ts
  routes/
    voice.ts
    voice.test.ts
  database/
    index.ts
    index.test.ts
```

## Setup & Teardown

**Database Test Setup:**
```typescript
beforeEach(() => {
  // Create test database
  const db = new Database(':memory:');
  initializeSchema(db);
  // ... set current db for tests
});

afterEach(() => {
  // Close test database
  closeDatabase();
});
```

**WebSocket Mocking:**
```typescript
beforeEach(() => {
  // Mock WebSocket connections for audio pipeline tests
  jest.mock('ws');
});

afterEach(() => {
  jest.unmock('ws');
});
```

## Test Types

**Unit Tests:**
- Scope: Single function/method in isolation
- Examples needed:
  - `pcmToMulaw()` audio conversion
  - `resamplePCM()` resampling
  - Tool argument parsing and validation
  - Date/time formatting for business hours
- Approach: Mock all external dependencies, test return values and side effects on state objects

**Integration Tests:**
- Scope: Multiple services working together
- Examples needed:
  - Full conversation flow: message in → LLM processing → tool calls → responses
  - Call lifecycle: initialization → STT → conversation → summary generation → cleanup
  - API endpoints: request → handler → database → response
- Approach: Use test database, mock external APIs (OpenAI, Deepgram, Twilio), verify database state changes

**E2E Tests:**
- Framework: Not currently implemented
- Recommended: Twilio's test API with real or simulated phone calls
- Could use: Custom script with test-call.ts as model
- Focus areas: Full inbound/outbound call flow, appointment booking, customer capture

## Coverage Targets

**Requirements:** Not enforced - no coverage thresholds configured

**Recommended Coverage:**
- Unit tests: Aim for 80%+ coverage of utility functions
- Integration tests: Cover all major service flows
- Critical paths (conversation handling, database operations): 90%+
- Less critical (admin routes, logging): 50-70%

**View Coverage:**
```bash
# Once testing framework is established:
npm test -- --coverage
npm run test:watch
```

## Common Testing Scenarios

**Testing Async Operations:**
```typescript
it('should process user message and return response', async () => {
  const state = createConversation('555-1234');
  const response = await processUserMessage(state, 'Hello', '555-1234');

  expect(response).toBeTruthy();
  expect(state.messages.length).toBeGreaterThan(1);
});
```

**Testing Event Emission:**
```typescript
it('should emit transcript events from STT', (done) => {
  const stt = new DeepgramSTT();
  stt.on('transcript', (text, isFinal) => {
    expect(text).toBeDefined();
    done();
  });

  stt.start();
  // ... simulate audio
});
```

**Testing Error Cases:**
```typescript
it('should handle missing API key gracefully', () => {
  const originalKey = env.deepgram.apiKey;
  env.deepgram.apiKey = '';

  expect(() => new DeepgramSTT().start()).rejects.toThrow('DEEPGRAM_API_KEY is required');

  env.deepgram.apiKey = originalKey;
});
```

**Testing Database Operations:**
```typescript
it('should upsert customer by phone number', () => {
  const customer1 = createCustomer({ name: 'John', phone: '555-1234' });
  const customer2 = createCustomer({ name: 'John Updated', phone: '555-1234', email: 'john@ex.com' });

  expect(customer2.id).toBe(customer1.id);
  expect(customer2.email).toBe('john@ex.com');
  expect(customer2.name).toBe('John Updated');
});
```

## Implementation Priority

**Phase 1 (Critical):**
1. Unit tests for `src/services/stt.ts` - audio event handling
2. Unit tests for `src/services/tts.ts` - PCM conversion functions
3. Integration tests for `src/services/conversation.ts` - tool calling

**Phase 2 (High):**
1. Integration tests for `src/services/call-manager.ts` - call lifecycle
2. Unit tests for `src/routes/voice.ts` - webhook handling
3. Database integration tests for `src/services/customers.ts`

**Phase 3 (Medium):**
1. Unit tests for `src/config/` - configuration validation
2. Integration tests for `src/routes/admin.ts` - admin endpoints
3. E2E tests for complete call flow

---

*Testing analysis: 2026-01-27*
