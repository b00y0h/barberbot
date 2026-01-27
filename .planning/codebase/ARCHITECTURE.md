# Architecture

**Analysis Date:** 2026-01-27

## Pattern Overview

**Overall:** Real-time voice AI agent with WebSocket media streaming and orchestrated service composition.

**Key Characteristics:**
- Event-driven architecture with WebSocket for bidirectional audio streaming
- Service-oriented design with clear separation between STT, LLM, TTS, and call management
- Stateful call management using in-memory map with connection lifecycle hooks
- Tool-calling agent pattern using OpenAI function calling for business logic
- Synchronous database operations with SQLite for persistence

## Layers

**Presentation/API Layer:**
- Purpose: HTTP endpoints for voice webhook integration, admin dashboard, and call management
- Location: `src/routes/voice.ts`, `src/routes/admin.ts`, `src/index.ts`
- Contains: Express route handlers, HTTP request/response handling
- Depends on: Call manager, customer services, Twilio client
- Used by: Twilio webhook callbacks, admin web interface

**WebSocket/Media Stream Layer:**
- Purpose: Handles bidirectional real-time audio streaming between Twilio and voice services
- Location: `src/services/audio-pipeline.ts`, `src/index.ts` (WebSocketServer setup)
- Contains: WebSocket connection lifecycle, Twilio Media Streams event handling
- Depends on: Call manager, STT service
- Used by: Twilio Media Streams, active calls

**Call Orchestration Layer:**
- Purpose: Manages active call state and coordinates between audio pipeline, conversation, STT, and TTS services
- Location: `src/services/call-manager.ts`
- Contains: `ActiveCall` interface, call lifecycle (initialize → handle utterances → end), interrupt handling
- Depends on: Conversation service, customer services, STT, TTS, database
- Used by: Audio pipeline, voice routes

**Conversation/AI Layer:**
- Purpose: OpenAI LLM integration with tool-calling for business logic execution
- Location: `src/services/conversation.ts`
- Contains: Conversation state machine, tool definitions, message history, tool call handlers
- Depends on: Customer services, business profile, OpenAI client
- Used by: Call manager

**Audio Processing Layer:**
- Purpose: Real-time speech-to-text and text-to-speech conversion with format conversion
- Location: `src/services/stt.ts`, `src/services/tts.ts`
- Contains: Deepgram STT client, ElevenLabs/Deepgram TTS with PCM↔mulaw codec conversion, resampling
- Depends on: Deepgram SDK, OpenAI SDK (for TTS in conversation), HTTP/fetch APIs
- Used by: Call manager

**Data Access Layer:**
- Purpose: SQLite database operations for customers, appointments, and call records
- Location: `src/services/customers.ts`, `src/database/index.ts`, `src/database/schema.ts`
- Contains: CRUD operations, query builders, dashboard stats aggregation
- Depends on: better-sqlite3, database connection pool
- Used by: Conversation service, call manager, admin routes

**Configuration Layer:**
- Purpose: Environment variables, business profile loading, system prompts
- Location: `src/config/env.ts`, `src/config/business.ts`, `src/prompts/system.ts`
- Contains: Environment schema, business profile interfaces, dynamic prompt building
- Depends on: dotenv, JSON business profile files
- Used by: All services

**Integration Layer:**
- Purpose: Third-party API clients and credentials management
- Location: `src/services/twilio.ts`, `src/services/stt.ts`, `src/services/tts.ts`, `src/services/conversation.ts`
- Contains: Twilio client factory, Deepgram client, OpenAI client, ElevenLabs HTTP calls
- Depends on: twilio SDK, @deepgram/sdk, openai SDK, fetch API
- Used by: All upper layers

## Data Flow

**Inbound Call Flow:**

1. Twilio receives call → POST `/voice/incoming` with CallSid
2. Returns TwiML with WebSocket stream URL to Twilio
3. Twilio connects WebSocket to `/voice/stream`, sends `start` event with CallSid
4. Audio pipeline creates call via `initializeCall(callSid, phoneNumber, direction)`
5. Call manager initializes: conversation state, STT connection, TTS service
6. Call manager sends initial greeting via TTS
7. Twilio sends incoming audio as base64-encoded mulaw via `media` events
8. Audio pipeline decodes and passes to STT
9. STT emits final transcripts via `transcript` event
10. Call manager buffers transcripts, sends to LLM via `processUserMessage()`
11. LLM may call tools (book_appointment, collect_customer_info, etc.)
12. Tool responses processed, LLM generates response
13. Response sent to TTS for audio synthesis
14. TTS streams mulaw chunks back through audio pipeline → Twilio → caller
15. Caller speaks, interrupts bot → STT detects speech → TTS aborted → cycle repeats
16. Call ends → Twilio sends `stop` event or status webhook
17. Call manager ends call, generates summary, updates database

**State Management:**

- **Call State:** `ActiveCall` map keyed by `callSid`, stored in memory in `call-manager.ts`
- **Conversation State:** `ConversationState` object with message history, customer info, booking flags
- **Persistence:** Call records, customers, appointments written to SQLite on call completion
- **Transient Data:** STT buffered transcripts, active TTS streams are not persisted until call ends

## Key Abstractions

**ActiveCall:**
- Purpose: Central state object representing a single phone call
- Location: `src/services/call-manager.ts` (interface definition and map storage)
- Contains: callSid, phone, conversation state, STT/TTS instances, audio sender function, timing info
- Pattern: Stateful object with event handlers attached to nested STT/TTS services

**ConversationState:**
- Purpose: Message history and extracted customer data for a conversation
- Location: `src/services/conversation.ts`
- Contains: OpenAI message array, customer name/phone/email, appointment/lead captured flags
- Pattern: Immutable append-only messages + mutable extracted info

**DeepgramSTT (EventEmitter):**
- Purpose: WebSocket client for Deepgram live transcription
- Location: `src/services/stt.ts`
- Contains: Connection management, keep-alive loop, transcript buffering, utterance end detection
- Pattern: EventEmitter wrapper around Deepgram SDK, emits `transcript`, `utterance_end`, `error`, `close`

**TTSService (EventEmitter):**
- Purpose: Text-to-speech with fallback chain and audio format conversion
- Location: `src/services/tts.ts`
- Contains: ElevenLabs and Deepgram API calls, PCM↔mulaw codec, resampling logic, AbortController for interruption
- Pattern: EventEmitter wrapper, emits `audio` (mulaw chunks), `done`, `error`; supports `interrupt()` for barge-in

**BusinessProfile:**
- Purpose: JSON-loaded configuration for business name, hours, services, staff, policies
- Location: `src/config/business.ts` with data in `data/business-profiles/classic-cuts.json`
- Contains: Lazy-loaded singleton business profile
- Pattern: Singleton loader, used in system prompt generation and tool handlers

## Entry Points

**HTTP Server Entry:**
- Location: `src/index.ts`
- Triggers: `npm start` or `npm dev`
- Responsibilities: Creates Express app, initializes database, sets up WebSocket server, starts HTTP listener on port 3100

**Incoming Call Webhook:**
- Location: `src/routes/voice.ts` → `POST /voice/incoming`
- Triggers: Twilio webhook on inbound call
- Responsibilities: Returns TwiML with WebSocket stream URL to Twilio

**WebSocket Connection:**
- Location: `src/index.ts` (WebSocketServer registration) → `src/services/audio-pipeline.ts`
- Triggers: Twilio Media Streams connects
- Responsibilities: Handles stream start/stop, routes audio through STT pipeline

**Admin API Routes:**
- Location: `src/routes/admin.ts`
- Triggers: Dashboard UI or external API calls
- Responsibilities: Serves call history, customer list, appointments, dashboard stats, initiates outbound calls

**Database Initialization:**
- Location: `src/database/index.ts`, `src/database/schema.ts`
- Triggers: First `getDatabase()` call from any service
- Responsibilities: Creates SQLite file, initializes schema, enables WAL mode and foreign keys

## Error Handling

**Strategy:** Try-catch with logging and graceful degradation; service failures emit error events.

**Patterns:**

- **STT Errors:** Call manager logs and continues; TTS responds with error fallback message
- **TTS Errors:** First tries interruption, then falls back to alternate provider (ElevenLabs → Deepgram)
- **LLM Tool Failures:** Tool returns error JSON, LLM retries with retry limit (maxAttempts = 5)
- **Database Errors:** Synchronous errors bubble up; calls proceed without persistence record on failure
- **WebSocket Errors:** Logged to console; call ends gracefully via endCall cleanup
- **API Integration:** No automatic retries; manual fallbacks in TTS layer only

## Cross-Cutting Concerns

**Logging:** Console.log with `[ComponentName]` prefix throughout (e.g., `[CallManager]`, `[STT]`, `[AudioPipeline]`)

**Validation:** Business profile required at startup (throws on missing file); environment variables warn but don't fail; tool call arguments validated by OpenAI schema

**Authentication:** Twilio credentials stored in environment; OpenAI, Deepgram, ElevenLabs API keys in env; no request-level auth on admin API (assumes trusted network)

**Interruption Handling:** When STT detects caller speech, `call.isBotSpeaking` flag set to false and TTS `abort()` called; TTS checks flag before emitting each audio chunk

---

*Architecture analysis: 2026-01-27*
