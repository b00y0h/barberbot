# Requirements: BarberBot AWS Migration

**Defined:** 2026-01-27
**Core Value:** Callers can have a natural phone conversation with the bot and book an appointment without human intervention.

## v1 Requirements

Requirements for AWS migration milestone. Each maps to roadmap phases.

### Infrastructure

- [ ] **INFRA-01**: AWS IAM credentials (access key + secret key) configured via environment variables
- [ ] **INFRA-02**: AWS region configured for latency-optimized Bedrock inference
- [ ] **INFRA-03**: Old provider SDK dependencies removed (openai, @deepgram/sdk)
- [ ] **INFRA-04**: Old provider environment variables removed (OPENAI_API_KEY, DEEPGRAM_API_KEY, ELEVENLABS_API_KEY)

### Audio

- [ ] **AUDIO-01**: mulaw 8kHz → PCM conversion for STT input from Twilio
- [ ] **AUDIO-02**: PCM → mulaw 8kHz conversion for TTS output to Twilio
- [ ] **AUDIO-03**: Audio conversion works with concurrent calls without blocking

### STT

- [ ] **STT-01**: Real-time streaming transcription via AWS Transcribe Streaming
- [ ] **STT-02**: Utterance/endpoint detection triggers transcript events
- [ ] **STT-03**: EventEmitter interface preserved (transcript, utterance_end, error, close events)
- [ ] **STT-04**: Handles connection lifecycle (connect, send audio, close)

### TTS

- [ ] **TTS-01**: Text-to-speech audio generation via Amazon Polly
- [ ] **TTS-02**: Streaming audio chunks emitted via EventEmitter (audio, done, error events)
- [ ] **TTS-03**: Interruption/abort support for barge-in
- [ ] **TTS-04**: Neural voice selected for natural conversation quality

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
| INFRA-01 | TBD | Pending |
| INFRA-02 | TBD | Pending |
| INFRA-03 | TBD | Pending |
| INFRA-04 | TBD | Pending |
| AUDIO-01 | TBD | Pending |
| AUDIO-02 | TBD | Pending |
| AUDIO-03 | TBD | Pending |
| STT-01 | TBD | Pending |
| STT-02 | TBD | Pending |
| STT-03 | TBD | Pending |
| STT-04 | TBD | Pending |
| TTS-01 | TBD | Pending |
| TTS-02 | TBD | Pending |
| TTS-03 | TBD | Pending |
| TTS-04 | TBD | Pending |
| LLM-01 | TBD | Pending |
| LLM-02 | TBD | Pending |
| LLM-03 | TBD | Pending |
| LLM-04 | TBD | Pending |
| LLM-05 | TBD | Pending |
| INTG-01 | TBD | Pending |
| INTG-02 | TBD | Pending |
| INTG-03 | TBD | Pending |

**Coverage:**
- v1 requirements: 23 total
- Mapped to phases: 0
- Unmapped: 23 ⚠️

---
*Requirements defined: 2026-01-27*
*Last updated: 2026-01-27 after initial definition*
