# BarberBot Voice AI Agent

## What This Is

BarberBot is a voice AI agent that handles phone calls for barbershops — booking appointments, answering questions about services, and collecting customer information. It uses Twilio for telephony, real-time STT/TTS for audio processing, and an LLM with tool calling for conversation logic.

## Core Value

Callers can have a natural phone conversation with the bot and book an appointment without human intervention.

## Current State (v1.0 Shipped)

**Shipped:** 2026-01-30

The codebase now uses AWS services exclusively:
- **LLM:** AWS Bedrock with Claude 3.5 Sonnet (tool calling, streaming)
- **STT:** AWS Transcribe Streaming (real-time, EventEmitter-based)
- **TTS:** Amazon Polly (generative engine, Ruth voice)

Legacy providers (OpenAI, Deepgram, ElevenLabs) fully removed.

### Validated Capabilities

- Inbound call handling via Twilio webhooks
- WebSocket-based real-time audio streaming
- Tool-calling conversation (book appointments, collect info)
- Bidirectional audio format conversion (PCM↔mulaw)
- STT with utterance detection and transcript buffering
- TTS with barge-in/interruption handling
- SQLite database for customers, appointments, calls
- Admin dashboard with call history and stats
- Business profile configuration and dynamic prompts
- Outbound call initiation

### Test Coverage

- 106 tests passing
- Full integration test coverage for call flows

## Next Milestone Goals

*Run `/gsd:new-milestone` to define v1.1 or v2.0 goals.*

Potential directions:
- Latency optimization with Bedrock prompt caching
- High-concurrency audio processing with worker threads
- Fallback provider support for reliability
- New conversation capabilities

## Constraints

- **Audio format**: Twilio requires mulaw 8kHz — AWS services must produce/consume compatible formats
- **Latency**: Real-time voice conversation — all services must respond fast enough for natural dialogue
- **Tool calling**: Bedrock Claude tool_use API format for function calling
- **Streaming**: STT must support real-time WebSocket streaming (not batch)

## Key Decisions

| Decision | Rationale | Status |
|----------|-----------|--------|
| Claude on Bedrock for LLM | Best conversational quality for voice AI | ✓ Shipped |
| AWS Transcribe Streaming for STT | Full AWS stack, real-time streaming support | ✓ Shipped |
| Amazon Polly for TTS | Full AWS stack, low latency | ✓ Shipped |
| No fallback providers | Simplify stack, single vendor | ✓ Shipped |
| IAM credentials auth | Simple, works everywhere | ✓ Shipped |

---
*Last updated: 2026-01-30 after v1.0 milestone completion*
