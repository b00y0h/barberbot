# Codebase Concerns

**Analysis Date:** 2026-01-27

## Security Considerations

**Missing Authentication on Admin APIs:**
- Issue: Admin endpoints (`/api/calls`, `/api/customers`, `/api/appointments`, `/api/calls/outbound`) have no authentication
- Files: `src/routes/admin.ts`
- Risk: Any client can query call transcripts, customer data, or initiate outbound calls
- Current mitigation: None
- Recommendations: Add API key validation or JWT-based auth before deploying to production. Consider using middleware to check auth headers.

**No Input Validation on Phone Numbers:**
- Issue: Phone numbers from Twilio webhooks and API requests are not validated before being used in database queries and API calls
- Files: `src/routes/voice.ts` (lines 12-13), `src/routes/admin.ts` (line 92)
- Risk: Invalid or malicious phone numbers could be stored or cause downstream service errors
- Recommendations: Validate phone number format before processing. Use a phone validation library (e.g., libphonenumber-js).

**JSON.parse Without Try-Catch in Audio Pipeline:**
- Issue: `audio-pipeline.ts` line 12 parses WebSocket messages without error handling
- Files: `src/services/audio-pipeline.ts` (line 12)
- Risk: Malformed JSON from WebSocket could crash the process unhandled
- Recommendations: Wrap in try-catch or validate JSON schema before parsing

**JSON.parse Without Validation in Conversation:**
- Issue: OpenAI tool call arguments parsed without validation (line 268)
- Files: `src/services/conversation.ts` (line 268)
- Risk: If OpenAI returns malformed arguments, parsing could fail silently or with unhandled errors
- Recommendations: Add try-catch and validate argument structure before processing

**No Query Limit Enforcement:**
- Issue: API query parameters (limit, offset) are not bounds-checked
- Files: `src/routes/admin.ts` (lines 48-49, 66-67, 85)
- Risk: Client can request arbitrarily large result sets causing memory/performance issues
- Recommendations: Set reasonable bounds (e.g., max 500 limit) and validate input ranges

**API Keys in Logs:**
- Issue: While environment variables are protected, API keys for Deepgram/OpenAI/ElevenLabs are used directly in fetch requests and may appear in error logs
- Files: `src/services/tts.ts` (line 111, 171), `src/services/conversation.ts` (line 12)
- Risk: If error logs are exposed or third-party services log requests, secrets could be leaked
- Recommendations: Ensure logs never include full API keys. Use structured logging with sensitive field masking.

## Tech Debt

**Memory Leak in TTS Service Creation:**
- Issue: `speakResponse()` creates a new TTSService instance per response instead of reusing the call's TTS instance
- Files: `src/services/call-manager.ts` (lines 170-211)
- Impact: Multiple TTS instances created per call, each with event listeners that may not clean up properly
- Fix approach: Use the existing `call.tts` instance instead of `new TTSService()` or ensure proper cleanup

**Race Condition in Utterance Handling:**
- Issue: `utteranceTimeout` can be cleared and reset multiple times rapidly without guaranteeing the pending utterance is processed before a new one arrives
- Files: `src/services/call-manager.ts` (lines 86-119)
- Impact: Utterances may be dropped or concatenated incorrectly if caller speaks rapidly
- Fix approach: Use a queue-based approach or state machine to ensure utterances are processed sequentially

**Global Mutable State Without Concurrency Control:**
- Issue: `activeCalls` Map in call-manager is shared global state accessed from multiple async contexts (WebSocket, STT events, HTTP handlers)
- Files: `src/services/call-manager.ts` (line 33)
- Impact: Potential race conditions when calls are created/ended simultaneously
- Fix approach: Add proper locking mechanism or use immutable updates with atomic operations

**No Resource Cleanup on WebSocket Errors:**
- Issue: If WebSocket connection fails during streaming, the associated call may remain in memory indefinitely
- Files: `src/services/audio-pipeline.ts` (lines 10-88)
- Impact: Memory leak on repeated connection failures
- Fix approach: Add explicit cleanup in error handlers and implement timeout-based cleanup for orphaned calls

**Hardcoded Deepgram Keep-Alive Interval:**
- Issue: Keep-alive interval is hard-coded to 10 seconds
- Files: `src/services/stt.ts` (line 41)
- Impact: Not configurable per deployment or customer requirements
- Fix approach: Move to environment variable with sensible default

**Missing Error Recovery in TTS Streaming:**
- Issue: If ElevenLabs fails during streaming, fallback to Deepgram doesn't reset stream state properly
- Files: `src/services/tts.ts` (lines 86-98)
- Impact: Caller may hear partial audio or interruption
- Fix approach: Clear any partial pcmBuffer before fallback attempt, ensure clean abort signal handling

## Known Bugs

**Double-Ending of Calls:**
- Symptoms: endCall() may be called twice for the same callSid (from status webhook and WebSocket close)
- Files: `src/routes/voice.ts` (line 32), `src/services/audio-pipeline.ts` (line 82)
- Trigger: When both status callback fires AND WebSocket closes
- Workaround: Map.delete() is idempotent so second call is harmless, but creates duplicate cleanup logic
- Fix approach: Implement call state tracking (ended flag) to prevent duplicate cleanup

**Missing `name` Property in Tool Call Messages:**
- Issue: OpenAI tool response messages push role 'tool' without required `name` property
- Files: `src/services/conversation.ts` (lines 271-275)
- Risk: Some OpenAI SDK versions may reject malformed tool responses
- Recommendations: Add `name` field to match OpenAI spec (should match the tool function name)

## Performance Bottlenecks

**Synchronous Database Queries in Hot Path:**
- Problem: All database operations use better-sqlite3 synchronous API, blocking the event loop during queries
- Files: `src/services/customers.ts` (entire file), `src/routes/admin.ts` (lines 28, 50, 68, 86)
- Impact: If database is on slow storage or queries are complex, this blocks audio streaming and STT processing
- Improvement path: Consider async wrapper or worker thread for heavy queries (listCalls, getDashboardStats)

**Buffer Concatenation in TTS Streaming:**
- Problem: `Buffer.concat()` creates new buffer each chunk in ElevenLabs synthesis
- Files: `src/services/tts.ts` (line 143)
- Impact: 24kHz audio from ElevenLabs creates many intermediate buffers before emitting chunks
- Improvement path: Use a pre-allocated ringbuffer or stream-based approach instead of concatenation

**No Connection Pooling for OpenAI API:**
- Problem: New OpenAI client connection per message in conversation processing
- Files: `src/services/conversation.ts` (line 12 - created once but could be optimized)
- Impact: Currently not a bottleneck since client is singleton, but no HTTP keep-alive optimization
- Improvement path: Ensure HTTP agent reuse is configured in OpenAI client initialization

**Infinite Loop Prevention Using Attempt Counter:**
- Problem: Tool calling loop has hard-coded max 5 attempts before giving up
- Files: `src/services/conversation.ts` (lines 240-241)
- Impact: If LLM keeps calling tools, conversation silently fails after 5 attempts
- Improvement path: Add exponential backoff or different strategy for tool loops instead of hard count

## Fragile Areas

**Audio Pipeline State Machine:**
- Files: `src/services/audio-pipeline.ts`
- Why fragile: Complex state (callSid, call object, stream connections) spread across closures and event handlers with no explicit state validation
- Safe modification: Add state enum (DISCONNECTED, CONNECTING, CONNECTED, ENDING) and validate transitions before operations
- Test coverage: No tests for error cases (malformed messages, out-of-order events, rapid reconnection)

**Conversation State Management:**
- Files: `src/services/conversation.ts`
- Why fragile: ConversationState message history grows unbounded. Tool calling has complex control flow with no idempotency.
- Safe modification: Implement message history trimming/summarization after N messages, add explicit state for "expecting_tool_response"
- Test coverage: No tests for edge cases (extremely long conversations, concurrent tool calls, rapid successive messages)

**TTS/STT Interrupt Handling:**
- Files: `src/services/call-manager.ts` (lines 166-211), `src/services/tts.ts`
- Why fragile: Interrupt signal (`AbortController.abort()`) may not stop all pending audio if called during specific timing windows
- Safe modification: Add state flags to track abort in progress, wait for 'done' event before allowing new synthesis
- Test coverage: No tests for interrupt scenarios or rapid speak/interrupt cycles

**Database Connection Lifecycle:**
- Files: `src/database/index.ts`
- Why fragile: Singleton pattern with no reference counting means any module can call `closeDatabase()` and break others
- Safe modification: Add reference counting or explicit lifecycle manager instead of global close function
- Test coverage: No tests for connection edge cases (close called multiple times, concurrent access after close)

## Scaling Limits

**In-Memory Call Tracking:**
- Current capacity: Limited by Node.js memory (typically 1000-5000 concurrent calls per instance depending on message history size)
- Limit: Each ActiveCall stores full ConversationState with message history. 1MB per call * 1000 calls = 1GB
- Scaling path: Offload conversation state to Redis or external session store once concurrent call count > 100

**SQLite Concurrency:**
- Current capacity: Single writer, multiple readers. Better-sqlite3 uses WAL mode but not designed for high-volume concurrent writes
- Limit: Appointment bookings + call records + customer updates compete for write lock
- Scaling path: Migrate to PostgreSQL or implement write queue when handling >50 concurrent calls

**API Response Pagination:**
- Current capacity: `listCalls` and `listCustomers` can return up to 1000+ records
- Limit: Client memory and network bandwidth for large datasets
- Scaling path: Implement cursor-based pagination instead of offset, add result size limits

## Missing Critical Features

**No Rate Limiting:**
- Problem: Outbound call endpoint and API endpoints have no rate limiting
- Blocks: Cannot prevent abuse (millions of API calls, thousands of outbound call attempts)
- Fix approach: Add express-rate-limit middleware on `/api/*` and `/voice/*` endpoints

**No Call Recording or Audit Trail:**
- Problem: Transcripts are stored but not raw audio or detailed event logs
- Blocks: Cannot replay calls for quality assurance or dispute resolution
- Fix approach: Add audio recording to WebSocket stream handler, implement structured event logging

**No Analytics/Call Quality Metrics:**
- Problem: No tracking of call duration distribution, success rates, STT/TTS error rates
- Blocks: Cannot identify performance issues or quality trends
- Fix approach: Add metrics collection and emit to external service (e.g., StatsD, Datadog)

**No Graceful Degradation:**
- Problem: If OpenAI fails, bot returns generic fallback message but doesn't attempt any retry
- Blocks: Users get poor experience even on transient API failures
- Fix approach: Implement retry with exponential backoff, queue failed conversations for retry

## Test Coverage Gaps

**No Unit Tests:**
- What's not tested: All service layers (STT, TTS, conversation, call-manager)
- Files: `src/services/*`
- Risk: Refactoring or adding features may silently break core functionality
- Priority: High - At minimum test conversation tool calling and error handling

**No Integration Tests:**
- What's not tested: WebSocket message handling, full call lifecycle, database operations
- Files: `src/services/audio-pipeline.ts`, `src/routes/*`
- Risk: Breaking changes to message format or database schema go undetected until production
- Priority: High - Need tests for main call flow and API endpoints

**No Error Scenario Testing:**
- What's not tested: STT failure, TTS failure, OpenAI timeout, database unavailable, network issues
- Files: All service files
- Risk: Error paths may hang processes or corrupt state without notice
- Priority: Medium - Need at least happy path tests before error scenarios

**No Load/Performance Testing:**
- What's not tested: Behavior under 10+ concurrent calls, memory usage growth, database lock contention
- Files: All files
- Risk: Scaling issues discovered only in production
- Priority: Medium - Should test concurrent call handling and memory stability

---

*Concerns audit: 2026-01-27*
