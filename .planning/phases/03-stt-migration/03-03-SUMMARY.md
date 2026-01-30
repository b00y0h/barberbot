---
phase: 03-stt-migration
plan: 03
completed: 2026-01-30T04:55:00Z
duration: 3min
gap_closure: true
---

# Plan 03-03 Summary: Utterance End Detection

## What Was Done

Implemented utterance end detection in AWSTranscribeSTT by deriving it from AWS Transcribe's final result timing. AWS Transcribe doesn't have an explicit utterance_end event like Deepgram, so we synthesize it using a debounce strategy.

## Tasks Completed

| Task | Status | Commit |
|------|--------|--------|
| Task 1: RED - Add failing test for utterance_end emission | ✓ | 2d6c6e2 |
| Task 2: GREEN - Implement utterance_end detection | ✓ | 1893aa6 |

## Changes Made

### src/services/aws-transcribe-stt.ts
- Added `utteranceEndTimer` private member for debounce tracking
- Added `UTTERANCE_END_DEBOUNCE_MS = 300` constant
- Added `handleFinalTranscript()` method that:
  - Clears existing timer on each new final result
  - Starts 300ms timer that emits `utterance_end` when it fires
  - Handles rapid-fire finals during continuous speech
- Wired `handleFinalTranscript()` into `processTranscriptStream()`
- Added timer cleanup in `stop()` method to prevent memory leaks

### src/services/aws-transcribe-stt.test.ts
- Added test "emits utterance_end after final transcript with silence"
- Verifies debounce behavior via `handleFinalTranscript()` method

## Test Results

```
✔ AWSTranscribeSTT (585.120ms)
  ✔ class structure (4 tests)
  ✔ event emission (4 tests)
  ✔ sendAudio() (2 tests)
  ✔ stop() (2 tests)
  ✔ integration behavior (3 tests)
    ✔ emits utterance_end after final transcript with silence (306ms)

15 tests passing
```

## Gap Closed

This plan closes the verification gap from 03-VERIFICATION.md:

| Gap | Status | Resolution |
|-----|--------|------------|
| "Utterance end detection triggers at natural conversation boundaries" | CLOSED | `emit('utterance_end')` at line 143, triggered 300ms after final transcript |

## Design Decisions

- **300ms debounce** chosen because:
  - Deepgram uses 1000ms utterance_end_ms
  - CallManager has 700ms fallback timeout
  - 300ms is responsive but avoids mid-sentence triggers
- **Debounce strategy** (vs. single-shot): Each final result resets timer, so continuous speech doesn't trigger premature utterance_end

## Verification

```bash
# Confirms implementation exists
grep -n "emit('utterance_end')" src/services/aws-transcribe-stt.ts
# Output: 143:        this.emit('utterance_end');
```

## Next Steps

Phase 3 gap closure complete. Re-verify phase to confirm all must-haves pass.
