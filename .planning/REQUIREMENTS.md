# Requirements: BarberBot AWS Migration

**Defined:** 2026-01-27
**Core Value:** Callers can have a natural phone conversation with the bot and book an appointment without human intervention.

## v1 Requirements

Requirements for AWS migration milestone. Each maps to roadmap phases.

### Infrastructure

- [x] **INFRA-01**: AWS IAM credentials (access key + secret key) configured via environment variables
- [x] **INFRA-02**: AWS region configured for latency-optimized Bedrock inference
- [ ] **INFRA-03**: Old provider SDK dependencies removed (openai, @deepgram/sdk)
- [ ] **INFRA-04**: Old provider environment variables removed (OPENAI_API_KEY, DEEPGRAM_API_KEY, ELEVENLABS_API_KEY)

### Audio

- [x] **AUDIO-01**: mulaw 8kHz → PCM conversion for STT input from Twilio
- [x] **AUDIO-02**: PCM → mulaw 8kHz conversion for TTS output to Twilio
- [x] **AUDIO-03**: Audio conversion works with concurrent calls without blocking

### STT

- [x] **STT-01**: Real-time streaming transcription via AWS Transcribe Streaming
- [x] **STT-02**: Utterance/endpoint detection triggers transcript events
- [x] **STT-03**: EventEmitter interface preserved (transcript, utterance_end, error, close events)
- [x] **STT-04**: Handles connection lifecycle (connect, send audio, close)

### TTS

- [x] **TTS-01**: Text-to-speech audio generation via Amazon Polly
- [x] **TTS-02**: Streaming audio chunks emitted via EventEmitter (audio, done, error events)
- [x] **TTS-03**: Interruption/abort support for barge-in
- [x] **TTS-04**: Neural voice selected for natural conversation quality

### LLM

- [ ] **LLM-01**: Multi-turn conversation via AWS Bedrock Converse API with Claude model
- [ ] **LLM-02**: Tool calling ported: book_appointment, check_availability, collect_customer_info, get_business_info
- [ ] **LLM-03**: System prompt and business profile context passed to Claude
- [ ] **LLM-04**: Streaming responses for lower time-to-first-token
- [ ] **LLM-05**: Tool execution loop handles multi-step tool calls

### Integration

- [ ] **INTG-01**: End-to-end inbound call works: ring → greeting → conversation → booking → hangup
- [ ] **INTG-02**: Barge-in/interruption works at all conversation stages
- [ ] **INTG-03**: Call manager orchestration unchanged (same ActiveCall interface)

## v2 Requirements

Deferred to future milestones.

- **PERF-01**: Latency optimization with Bedrock prompt caching
- **PERF-02**: Audio conversion offloaded to worker threads for high concurrency
- **FALL-01**: Fallback provider support if AWS services fail

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-provider fallback chains | Simplifying to AWS-only stack per user decision |
| Business logic changes | Port tools as-is, no functional changes |
| Twilio telephony changes | Stays on Twilio, not migrating to AWS Connect |
| Database schema changes | No persistence changes needed |
| Admin dashboard changes | No UI changes for this migration |
| OAuth/SSO for AWS auth | IAM credentials sufficient for this milestone |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Complete |
| INFRA-02 | Phase 1 | Complete |
| AUDIO-01 | Phase 2 | Complete |
| AUDIO-02 | Phase 2 | Complete |
| AUDIO-03 | Phase 2 | Complete |
| STT-01 | Phase 3 | Complete |
| STT-02 | Phase 3 | Complete |
| STT-03 | Phase 3 | Complete |
| STT-04 | Phase 3 | Complete |
| TTS-01 | Phase 4 | Complete |
| TTS-02 | Phase 4 | Complete |
| TTS-03 | Phase 4 | Complete |
| TTS-04 | Phase 4 | Complete |
| LLM-01 | Phase 5 | Pending |
| LLM-02 | Phase 5 | Pending |
| LLM-03 | Phase 5 | Pending |
| LLM-04 | Phase 5 | Pending |
| LLM-05 | Phase 5 | Pending |
| INTG-01 | Phase 6 | Pending |
| INTG-02 | Phase 6 | Pending |
| INTG-03 | Phase 6 | Pending |
| INFRA-03 | Phase 6 | Pending |
| INFRA-04 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0 ✓

---
*Requirements defined: 2026-01-27*
*Last updated: 2026-01-30 after Phase 4 completion*
