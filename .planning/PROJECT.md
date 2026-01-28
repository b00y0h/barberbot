# BarberBot Voice AI Agent

## What This Is

BarberBot is a voice AI agent that handles phone calls for barbershops — booking appointments, answering questions about services, and collecting customer information. It uses Twilio for telephony, real-time STT/TTS for audio processing, and an LLM with tool calling for conversation logic.

## Core Value

Callers can have a natural phone conversation with the bot and book an appointment without human intervention.

## Current Milestone: v1.0 — Migrate to AWS

**Goal:** Replace all third-party AI services (OpenAI, Deepgram, ElevenLabs) with AWS equivalents (Bedrock Claude, Transcribe Streaming, Polly).

**Target features:**
- LLM conversation via AWS Bedrock (Claude model) with tool calling
- Real-time speech-to-text via AWS Transcribe Streaming
- Text-to-speech via Amazon Polly
- IAM credential-based authentication for all AWS services
- Same business logic and tool definitions, new provider APIs

## Requirements

### Validated

- ✓ Inbound call handling via Twilio webhooks — existing
- ✓ WebSocket-based real-time audio streaming — existing
- ✓ Tool-calling conversation (book appointments, collect info) — existing
- ✓ TTS with audio format conversion (PCM↔mulaw, resampling) — existing
- ✓ STT with utterance detection and transcript buffering — existing
- ✓ SQLite database for customers, appointments, calls — existing
- ✓ Admin dashboard with call history and stats — existing
- ✓ Business profile configuration and dynamic prompts — existing
- ✓ Barge-in/interruption handling — existing
- ✓ Outbound call initiation — existing

### Active

- [ ] LLM calls use AWS Bedrock with Claude model
- [ ] Tool definitions ported to Bedrock Claude tool_use format
- [ ] STT uses AWS Transcribe Streaming
- [ ] TTS uses Amazon Polly
- [ ] AWS authentication via IAM access key + secret key
- [ ] No fallback to previous providers — AWS only

### Out of Scope

- Multi-provider fallback chains — simplifying to AWS-only stack
- Changing business logic or tool definitions — port as-is
- Changing Twilio telephony integration — stays the same
- Database changes — no schema changes needed
- Admin dashboard changes — no UI changes needed

## Context

- Existing codebase is TypeScript/Node.js with Express and WebSocket
- Currently uses OpenAI SDK 4.104.0 for LLM (GPT-4o with function calling)
- Currently uses Deepgram SDK for STT (Nova-2, mulaw, 8kHz)
- Currently uses ElevenLabs (primary) and Deepgram (fallback) for TTS
- Audio pipeline handles PCM↔mulaw conversion and 24kHz→8kHz resampling
- Twilio Media Streams sends mulaw audio at 8kHz

## Constraints

- **Audio format**: Twilio requires mulaw 8kHz — AWS services must produce/consume compatible formats
- **Latency**: Real-time voice conversation — all services must respond fast enough for natural dialogue
- **Tool calling**: Bedrock Claude tool_use API differs from OpenAI function calling — requires format translation
- **Streaming**: STT must support real-time WebSocket streaming (not batch)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Claude on Bedrock for LLM | Best conversational quality for voice AI | — Pending |
| AWS Transcribe Streaming for STT | Full AWS stack, real-time streaming support | — Pending |
| Amazon Polly for TTS | Full AWS stack, low latency | — Pending |
| No fallback providers | Simplify stack, single vendor | — Pending |
| IAM credentials auth | Simple, works everywhere | — Pending |

---
*Last updated: 2026-01-27 after initialization*
