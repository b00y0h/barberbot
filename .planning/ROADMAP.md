# Roadmap: BarberBot AWS Migration

## Overview

This roadmap guides the migration from third-party AI services (OpenAI, Deepgram, ElevenLabs) to AWS-native equivalents (Bedrock Claude, Transcribe Streaming, Polly). The journey follows a dependency-ordered path: establish AWS infrastructure, build audio format compatibility foundation, migrate STT and TTS services independently, tackle complex LLM tool calling migration, and finally validate end-to-end integration while cleaning up legacy dependencies.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Infrastructure Setup** - AWS credentials, region selection, SDK configuration
- [x] **Phase 2: Audio Pipeline Foundation** - mulaw↔PCM conversion for Twilio compatibility
- [x] **Phase 3: STT Migration** - Deepgram → AWS Transcribe Streaming
- [ ] **Phase 4: TTS Migration** - ElevenLabs/Deepgram → Amazon Polly
- [ ] **Phase 5: LLM Migration** - OpenAI → AWS Bedrock Claude with tool calling
- [ ] **Phase 6: Integration & Cleanup** - End-to-end validation and legacy removal

## Phase Details

### Phase 1: Infrastructure Setup
**Goal**: AWS SDK clients configured and authenticated for all services in latency-optimized region

**Depends on**: Nothing (first phase)

**Requirements**: INFRA-01, INFRA-02

**Success Criteria** (what must be TRUE):
  1. AWS IAM credentials loaded from environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
  2. AWS region configured for Bedrock latency-optimized inference (us-east-2 or us-west-2)
  3. Bedrock, Transcribe, and Polly SDK clients instantiate without authentication errors
  4. Claude 3.5 model available in selected region (verified via Bedrock API)

**Plans:** 1 plan

Plans:
- [x] 01-01-PLAN.md — AWS SDK install, env config, and client factory module

### Phase 2: Audio Pipeline Foundation
**Goal**: Audio format conversion working bidirectionally for Twilio compatibility

**Depends on**: Phase 1

**Requirements**: AUDIO-01, AUDIO-02, AUDIO-03

**Success Criteria** (what must be TRUE):
  1. mulaw 8kHz audio from Twilio converts to PCM16 without distortion
  2. PCM audio from AWS services converts to mulaw 8kHz for Twilio output
  3. Audio conversion handles concurrent calls without blocking event loop
  4. Test harness validates round-trip conversion (mulaw → PCM → mulaw) produces intelligible audio

**Plans:** 1 plan

Plans:
- [x] 02-01-PLAN.md — TDD audio conversion module (mulaw↔PCM, resample)

### Phase 3: STT Migration
**Goal**: Real-time speech transcription via AWS Transcribe Streaming with EventEmitter interface preserved

**Depends on**: Phase 2

**Requirements**: STT-01, STT-02, STT-03, STT-04

**Success Criteria** (what must be TRUE):
  1. Caller speech during test call produces real-time transcript events
  2. Utterance end detection triggers at natural conversation boundaries (silence detection)
  3. AWSTranscribeSTT class emits same events as DeepgramSTT (transcript, utterance_end, error, close)
  4. CallManager orchestration continues working without changes (same EventEmitter API)

**Plans:** 3 plans

Plans:
- [x] 03-01-PLAN.md — TDD AWSTranscribeSTT class with EventEmitter interface
- [x] 03-02-PLAN.md — Wire AWSTranscribeSTT into CallManager
- [x] 03-03-PLAN.md — Gap closure: Implement utterance_end detection

### Phase 4: TTS Migration
**Goal**: Natural voice responses via Amazon Polly with streaming audio delivery

**Depends on**: Phase 2

**Requirements**: TTS-01, TTS-02, TTS-03, TTS-04

**Success Criteria** (what must be TRUE):
  1. Bot speaks responses to caller with natural voice quality (neural voice)
  2. Audio streams in chunks for low latency (first audio within 500ms of request)
  3. Interruption/abort works mid-sentence when caller speaks (barge-in preserved)
  4. Audio output sounds clear on Twilio call (no distortion from PCM→mulaw conversion)

**Plans:** 2 plans

Plans:
- [ ] 04-01-PLAN.md — TDD AWSPollyTTS class with EventEmitter interface
- [ ] 04-02-PLAN.md — Wire AWSPollyTTS into CallManager

### Phase 5: LLM Migration
**Goal**: Multi-turn conversation with tool calling via AWS Bedrock Claude model

**Depends on**: Phase 3, Phase 4 (needs STT/TTS for end-to-end testing)

**Requirements**: LLM-01, LLM-02, LLM-03, LLM-04, LLM-05

**Success Criteria** (what must be TRUE):
  1. Bot maintains multi-turn conversation with context across utterances
  2. All 4 tools work when invoked: book_appointment, check_availability, collect_customer_info, get_business_info
  3. System prompt and business profile context influence bot responses appropriately
  4. Streaming responses deliver first token within 1-2 seconds of request
  5. Multi-step tool calls execute in sequence (e.g., check availability → book appointment)

**Plans**: TBD

Plans:
- [ ] 05-01: TBD during planning

### Phase 6: Integration & Cleanup
**Goal**: Complete end-to-end call flow working with AWS services only, legacy dependencies removed

**Depends on**: Phase 5

**Requirements**: INTG-01, INTG-02, INTG-03, INFRA-03, INFRA-04

**Success Criteria** (what must be TRUE):
  1. Inbound call completes full journey: ring → greeting → conversation → booking → hangup
  2. Caller can interrupt bot at any conversation stage (greeting, mid-sentence, during tool call)
  3. CallManager orchestration unchanged (same ActiveCall interface as before migration)
  4. Old provider dependencies removed from package.json (openai, @deepgram/sdk)
  5. Old provider environment variables removed from configuration (OPENAI_API_KEY, DEEPGRAM_API_KEY, ELEVENLABS_API_KEY)

**Plans**: TBD

Plans:
- [ ] 06-01: TBD during planning

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Infrastructure Setup | 1/1 | ✓ Complete | 2026-01-28 |
| 2. Audio Pipeline Foundation | 1/1 | ✓ Complete | 2026-01-29 |
| 3. STT Migration | 3/3 | ✓ Complete | 2026-01-30 |
| 4. TTS Migration | 0/2 | Planned | - |
| 5. LLM Migration | 0/TBD | Not started | - |
| 6. Integration & Cleanup | 0/TBD | Not started | - |

---
*Roadmap created: 2026-01-28*
*Last updated: 2026-01-30 after Phase 4 planning*
