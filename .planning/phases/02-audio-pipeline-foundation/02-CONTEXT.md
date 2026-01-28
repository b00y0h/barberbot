# Phase 2: Audio Pipeline Foundation - Context

**Gathered:** 2026-01-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Build mulaw↔PCM audio format conversion layer for Twilio compatibility. Twilio sends/receives 8kHz mulaw audio, AWS services (Transcribe, Polly) use PCM. This phase creates the bidirectional conversion that enables STT and TTS migration.

</domain>

<decisions>
## Implementation Decisions

### Latency Constraints
- Target under 50ms end-to-end latency for audio conversion — imperceptible delay
- Latency prioritized over throughput — each call stays fast
- Design for 5-10 concurrent calls — small barbershop scale

### Claude's Discretion
- Conversion approach: Streaming vs buffered (pick based on what works best technically)
- API interface: Streaming EventEmitter vs simple functions vs both (match codebase patterns)
- Module location: Dedicated module vs inline in STT/TTS (separation of concerns)
- Library choice: Native TypedArrays vs existing packages (research and pick best option)
- Threading: Main thread vs worker threads (based on measured performance)
- Test methodology: Round-trip tests, manual listening, or both (appropriate for audio validation)
- Test data: Sample files vs generated audio (reliability vs repo cleanliness)
- Quality bar: Phone-quality vs clear voice (appropriate for barbershop booking)
- CI integration: Automated vs manual-only tests (based on what's practical)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. User trusts Claude to make appropriate technical decisions for audio conversion, with the key constraint being sub-50ms latency and support for 5-10 concurrent calls.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-audio-pipeline-foundation*
*Context gathered: 2026-01-28*
