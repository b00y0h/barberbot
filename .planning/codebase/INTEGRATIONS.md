# External Integrations

**Analysis Date:** 2026-01-27

## APIs & External Services

**Telecommunications:**
- Twilio - Phone call infrastructure (inbound/outbound calls via SIP)
  - SDK/Client: `twilio` npm package v5.12.0
  - Implementation: `src/services/twilio.ts`
  - Auth: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` (environment variables)
  - Configuration: `TWILIO_PHONE_NUMBER` (your assigned phone number)
  - Used by: `src/routes/voice.ts` (incoming/outbound call handling)

**Speech-to-Text (STT):**
- Deepgram Nova-2 - Real-time speech recognition
  - SDK/Client: `@deepgram/sdk` npm package v3.13.0
  - Implementation: `src/services/stt.ts` (class `DeepgramSTT`)
  - Auth: `DEEPGRAM_API_KEY` (environment variable)
  - Model: `nova-2` with `mulaw` encoding, 8kHz sample rate, interim results enabled
  - Connection type: WebSocket (live transcription, keep-alive every 10s)
  - Events: `Transcript` (text), `UtteranceEnd`, `Error`, `Close`

**Text-to-Speech (TTS):**
- ElevenLabs (Primary) - High-quality voice synthesis
  - Implementation: REST API via native `fetch()` in `src/services/tts.ts`
  - Endpoint: `https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream`
  - Auth: `ELEVENLABS_API_KEY` (header `xi-api-key`)
  - Configuration: `ELEVENLABS_VOICE_ID` (defaults to "pNInz6obpgDQGcFmaJgB" - Adam voice)
  - Model: `eleven_turbo_v2`
  - Output format: PCM 24kHz (resampled to 8kHz for Twilio)
  - Audio processing: Linear16 PCM → μ-law compression, 24kHz → 8kHz resampling

- Deepgram (Fallback TTS) - Fallback if ElevenLabs fails
  - Implementation: REST API via native `fetch()` in `src/services/tts.ts`
  - Endpoint: `https://api.deepgram.com/v1/speak?model=aura-asteria-en&encoding=mulaw&sample_rate=8000&container=none`
  - Auth: `DEEPGRAM_API_KEY` (header `Authorization: Token {...}`)
  - Model: `aura-asteria-en`
  - Output format: μ-law 8kHz (native Twilio format)

**Large Language Model:**
- OpenAI GPT-4o - Conversation AI with tool calling
  - SDK/Client: `openai` npm package v4.104.0
  - Implementation: `src/services/conversation.ts`
  - Auth: `OPENAI_API_KEY` (environment variable)
  - Models:
    - `gpt-4o` - Main conversation and greetings
    - `gpt-4o-mini` - Call summary generation
  - Features: Tool calling (function execution), system prompts, message history, max_tokens limiting
  - Tools available to model:
    - `collect_customer_info` - Save customer details (name, phone, email)
    - `check_availability` - Check appointment slots for a date/staff
    - `book_appointment` - Create appointment with service, date, time, staff
    - `get_business_info` - Retrieve hours, services, pricing, location, policies, staff

**Business Configuration:**
- JSON-based profile system (no external API)
  - File location: `data/business-profiles/classic-cuts.json`
  - Loaded by: `src/config/business.ts`
  - Contains: business name, address, hours, services, pricing, staff, policies, bot personality

## Data Storage

**Databases:**
- SQLite 3 (Local)
  - Provider: Local filesystem
  - Client: `better-sqlite3` npm package v11.10.0
  - Connection: `./data/barberbot.db` (configurable via `DATABASE_PATH` env var)
  - Implementation: `src/database/index.ts`, `src/database/schema.ts`
  - Tables:
    - `customers` - Phone, name, email, notes (phone is unique key)
    - `appointments` - Customer appointments with date, time, service, staff, status
    - `calls` - Call logs with transcript, summary, direction, duration, outcomes
  - Indexes: phone numbers, call timestamps, appointment dates

**File Storage:**
- Local filesystem only
  - Database file: `./data/barberbot.db`
  - Business profiles: `./data/business-profiles/`
  - Static assets: `./src/public/` (served via Express)

**Caching:**
- None explicitly implemented
- In-memory: Active call state managed in `src/services/call-manager.ts`

## Authentication & Identity

**Auth Provider:**
- Custom (API key pattern)

**Implementation:**
- Twilio: Account SID + Auth Token (SDK-managed)
- OpenAI: API key authentication (SDK-managed)
- Deepgram: API key (Authorization header)
- ElevenLabs: API key (xi-api-key header)
- No user authentication on admin API (open localhost/trusted network)
- No session management (stateless HTTP endpoints)

## Monitoring & Observability

**Error Tracking:**
- None (no external service configured)
- Errors logged to console via `console.error()`

**Logs:**
- Console-based logging with prefixes: `[STT]`, `[TTS]`, `[Twilio]`, `[Voice]`, `[Conversation]`, etc.
- Structured messages for call lifecycle, API errors, connection events
- No persistent logging or log aggregation service

**Call Tracking:**
- Call records stored in SQLite `calls` table
- Transcripts stored as text in database
- Summaries generated via OpenAI and saved
- No real-time call monitoring dashboard (admin endpoints return historical data)

## CI/CD & Deployment

**Hosting:**
- Self-hosted Node.js server
- Supports Tailscale for secure tunnel to Twilio webhooks
- HTTPS required (Twilio enforces HTTPS for webhooks)
- Port: 3100 (configurable)

**CI Pipeline:**
- None configured
- Manual build/deploy process

**Environment Configuration:**
- `.env` file (local development)
- Environment variable injection for production
- No Docker/containerization configured

## Environment Configuration

**Required env vars for operation:**
- `PORT` - Server port (default: 3100)
- `BASE_URL` - Public HTTPS URL for Twilio callbacks (e.g., `https://your-tailscale-hostname:3100`)
- `TWILIO_ACCOUNT_SID` - Twilio account identifier
- `TWILIO_AUTH_TOKEN` - Twilio authentication token
- `TWILIO_PHONE_NUMBER` - Your Twilio phone number (E.164 format)
- `DEEPGRAM_API_KEY` - Deepgram API key (required)
- `OPENAI_API_KEY` - OpenAI API key (required)
- `ELEVENLABS_API_KEY` - ElevenLabs API key (optional, defaults to Deepgram for TTS)
- `ELEVENLABS_VOICE_ID` - ElevenLabs voice ID (optional, defaults to "pNInz6obpgDQGcFmaJgB")
- `DATABASE_PATH` - SQLite database file path (default: `./data/barberbot.db`)

**Secrets location:**
- Environment variables via `.env` file (local development)
- Process environment (production deployment)
- No secrets manager integration configured

## Webhooks & Callbacks

**Incoming Webhooks (from Twilio to your server):**
- `POST /voice/incoming` - Twilio incoming call webhook
  - Payload: `CallSid`, `From`, `To` (caller phone, recipient phone)
  - Response: TwiML with WebSocket media stream URL
  - Implementation: `src/routes/voice.ts`

- `POST /voice/status` - Twilio call status callback
  - Payload: `CallSid`, `CallStatus`, `CallDuration`
  - Statuses handled: `completed`, `failed`, `no-answer`, `busy`
  - Response: 200 status code
  - Implementation: `src/routes/voice.ts`

- `WebSocket /voice/stream` - Twilio media stream
  - Duplex connection for real-time audio
  - Receives: Mulaw audio from caller
  - Sends: Mulaw audio to caller
  - Implementation: `src/services/audio-pipeline.ts`
  - Handled via `ws` library on port 3100

**Outgoing Webhooks (from your server to external APIs):**
- OpenAI Chat Completions API - HTTP POST with conversation messages
- Deepgram STT - WebSocket connection for transcription
- Deepgram TTS - HTTP POST for text-to-speech
- ElevenLabs TTS - HTTP POST for text-to-speech
- Twilio REST API - HTTP POST for initiating outbound calls

**Admin API Endpoints (internal):**
- `GET /api/health` - Health check with uptime and active call count
- `GET /api/dashboard` - Dashboard stats (calls, customers, appointments, active calls)
- `GET /api/calls` - List recent calls with pagination
- `GET /api/calls/:id` - Get call details with transcript
- `GET /api/customers` - List customers
- `GET /api/customers/:id` - Get customer details
- `GET /api/appointments` - List appointments
- `POST /api/calls/outbound` - Initiate outbound call

---

*Integration audit: 2026-01-27*
