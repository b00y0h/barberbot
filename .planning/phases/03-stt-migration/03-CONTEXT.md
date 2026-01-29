# Phase 3: STT Migration - Context

**Gathered:** 2026-01-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Migrate speech-to-text from Deepgram to AWS Transcribe Streaming. The AWSTranscribeSTT class must emit the same events as DeepgramSTT (transcript, utterance_end, error, close) so CallManager orchestration continues unchanged. Caller speech during calls produces real-time transcript events.

</domain>

<decisions>
## Implementation Decisions

### Transcript delivery
- Filter filler words ('um', 'uh', 'like') — cleaner input for LLM
- Claude's discretion: partial vs final transcript handling, confidence thresholds, punctuation/formatting

### Utterance detection
- Use intelligent pause detection — distinguish mid-sentence pauses from end-of-turn
- Match current Deepgram barge-in behavior — preserve existing interruption handling
- Claude's discretion: silence timeout duration, background noise filtering sensitivity

### Language support
- Auto-detect language — let AWS Transcribe identify caller's language
- Broad accent support — handle UK, Australian, Indian English variants, not just US
- Allow mid-call language switching — re-detect if caller switches languages
- Claude's discretion: whether custom vocabulary for barbershop terms is worth the complexity

### Claude's Discretion
- Partial vs final transcript handling (match existing behavior or optimize)
- Confidence threshold for filtering low-confidence results
- Punctuation and capitalization formatting
- Exact silence timeout duration for utterance end detection
- Background noise filtering configuration
- Custom vocabulary decision for barbershop-specific terms

</decisions>

<specifics>
## Specific Ideas

- EventEmitter interface must match DeepgramSTT exactly — same event names, same payload shapes
- CallManager should require zero changes after migration
- Barge-in behavior must feel identical to current implementation

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-stt-migration*
*Context gathered: 2026-01-29*
