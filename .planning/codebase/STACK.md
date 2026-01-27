# Technology Stack

**Analysis Date:** 2026-01-27

## Languages

**Primary:**
- TypeScript 5.9.3 - Full project codebase: `src/`, scripts, configuration
- JavaScript (transpiled) - Runtime output from TypeScript compilation

## Runtime

**Environment:**
- Node.js 24.12.0+ (ES2022 target)

**Package Manager:**
- pnpm (v9+)
- Lockfile: `pnpm-lock.yaml` (present)

## Frameworks

**Core Web Framework:**
- Express.js 4.22.1 - HTTP server, request routing, middleware (`src/index.ts`)
- TypeScript 5.9.3 - Type safety and compilation

**Networking:**
- ws 8.19.0 - WebSocket server for Twilio media streams (`src/index.ts`, `/voice/stream` path)
- ws 8.19.0 - Used by OpenAI client for real-time features

**Build/Development:**
- tsx 4.21.0 - TypeScript execution for development (`npm run dev`), seeding, testing
- TypeScript Compiler - Production builds via `npm run build`

**Middleware:**
- cors 2.8.6 - Cross-origin resource sharing configuration
- express.json() - JSON body parsing (built-in Express)
- express.urlencoded() - Form data parsing (built-in Express)
- express.static() - Serve static files from `src/public/`

## Key Dependencies

**Critical - Telecommunications:**
- twilio 5.12.0 - Phone call management, inbound/outbound calls, TwiML generation (`src/services/twilio.ts`)

**Critical - Speech-to-Text (STT):**
- @deepgram/sdk 3.13.0 - Real-time transcription with Nova-2 model, `mulaw` encoding, 8kHz sample rate (`src/services/stt.ts`)

**Critical - Text-to-Speech (TTS):**
- ElevenLabs API (REST calls via `fetch`) - Primary TTS provider with `eleven_turbo_v2` model
- Deepgram API (REST calls via `fetch`) - Fallback TTS with `aura-asteria-en` voice
- Custom audio processing: Linear16 PCM → μ-law conversion, 24kHz → 8kHz resampling (`src/services/tts.ts`)

**Critical - Large Language Model:**
- openai 4.104.0 - GPT-4o and GPT-4o-mini models, tool calling for function execution (`src/services/conversation.ts`)

**Database:**
- better-sqlite3 11.10.0 - SQLite 3 synchronous client, local database at `./data/barberbot.db` (`src/database/`)

**Utilities:**
- dotenv 16.6.1 - Environment variable loading from `.env` file
- uuid 9.0.1 - Unique identifier generation
- cors 2.8.6 - CORS middleware configuration

## Configuration

**Environment:**
- Configuration via `.env` file (`.env.example` provided)
- Environment variables parsed in `src/config/env.ts`
- Runtime port defaults to 3100
- Base URL supports HTTPS with Tailscale hostnames

**Build:**
- `tsconfig.json` - TypeScript compiler configuration:
  - Target: ES2022
  - Module: CommonJS
  - Output: `dist/` directory
  - Strict mode enabled
  - Source maps enabled
  - Declaration files generated

**Database:**
- SQLite3 schema in `src/database/schema.ts`
- Auto-initialized on first run
- Tables: customers, appointments, calls
- Indexes on: phone numbers, call date, appointment dates

## Platform Requirements

**Development:**
- Node.js 24.12.0+ (built with v24)
- pnpm (9.0+)
- TypeScript knowledge (project is 100% TypeScript)
- Tailscale or publicly accessible hostname for Twilio webhooks

**Production:**
- Node.js 24.12.0+ with ESM/CommonJS support
- HTTPS endpoint (required by Twilio webhooks)
- Publicly routable hostname (for Twilio callbacks)
- SQLite database file storage (`./data/barberbot.db`)
- Environment variables for all external service credentials

**Build Process:**
```bash
pnpm install        # Install dependencies
pnpm build         # Compile TypeScript → dist/
npm start          # Run production build
npm run dev        # Run in development with watch
npm run seed       # Seed sample data
npm run test-call  # Initiate test call
```

---

*Stack analysis: 2026-01-27*
