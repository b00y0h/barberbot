# 🪒 BarberBot

AI-powered voice bot agent that acts as a barber shop receptionist. Handles inbound and outbound phone calls using real-time voice AI.

## Architecture

```
Caller → Twilio → WebSocket Media Stream → Deepgram STT → OpenAI GPT-4 → ElevenLabs TTS → Audio back to caller
```

## Features

- **Real-time voice conversations** — sub-second latency voice pipeline
- **Appointment booking** — check availability, book, and manage appointments
- **Customer recognition** — greets returning callers by name
- **Smart receptionist** — answers questions about hours, services, pricing, staff
- **Interrupt handling** — stops talking when the caller speaks
- **Admin dashboard** — web UI for calls, customers, appointments, and stats
- **Call transcripts** — automatic transcription and AI-generated summaries
- **Configurable** — JSON-based business profiles, works for any service business

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your API keys
```

Required API keys:
- **Twilio** — Account SID, Auth Token, Phone Number
- **Deepgram** — API key (for speech-to-text)
- **OpenAI** — API key (for conversational AI)
- **ElevenLabs** — API key + Voice ID (for text-to-speech, optional — falls back to Deepgram TTS)

### 3. Build & run

```bash
pnpm build
pnpm start
```

Or for development:

```bash
pnpm dev
```

### 4. Configure Twilio

Point your Twilio phone number webhooks to:
- **Voice webhook:** `POST https://your-host:3100/voice/incoming`
- **Status callback:** `POST https://your-host:3100/voice/status`

### 5. Seed sample data (optional)

```bash
pnpm seed
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/voice/incoming` | Twilio incoming call webhook |
| POST | `/voice/status` | Twilio call status callback |
| GET | `/api/health` | Health check |
| GET | `/api/dashboard` | Dashboard stats |
| GET | `/api/calls` | List recent calls |
| GET | `/api/calls/:id` | Call details + transcript |
| GET | `/api/customers` | List customers |
| GET | `/api/customers/:id` | Customer details |
| GET | `/api/appointments` | List appointments |
| POST | `/api/calls/outbound` | Initiate outbound call |

## Business Profile

Edit `data/business-profiles/classic-cuts.json` to customize:
- Business name, address, phone
- Operating hours
- Services & pricing
- Staff members
- Policies
- Bot personality

## Tech Stack

- **Node.js + TypeScript** — Runtime
- **Express + ws** — HTTP & WebSocket server
- **Twilio** — Phone infrastructure
- **Deepgram Nova-2** — Speech-to-text
- **OpenAI GPT-4o** — Conversational AI with tool calling
- **ElevenLabs** — Text-to-speech (Deepgram TTS fallback)
- **SQLite** — Local database via better-sqlite3

## License

MIT
