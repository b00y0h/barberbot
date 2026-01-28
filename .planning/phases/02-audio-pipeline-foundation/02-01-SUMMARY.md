---
phase: 02-audio-pipeline-foundation
plan: 01
subsystem: audio
tags: [g711, mulaw, pcm, codec, buffer, tdd]

# Dependency graph
requires:
  - phase: 01-infrastructure-setup
    provides: AWS SDK clients for future Transcribe/Polly integration
provides:
  - mulawToPcm: decode G.711 mulaw to 16-bit PCM
  - pcmToMulaw: encode 16-bit PCM to G.711 mulaw
  - resamplePcm: linear interpolation rate conversion
  - Round-trip conversion fidelity tests
affects: [02-02 STT pipeline, 02-03 TTS pipeline, stt.ts, audio-pipeline.ts]

# Tech tracking
tech-stack:
  added: []
  patterns: [G.711 mulaw lookup table decode, Node.js test runner]

key-files:
  created:
    - src/services/audio-convert.ts
    - src/services/audio-convert.test.ts
  modified:
    - src/services/tts.ts

key-decisions:
  - "Lookup table for mulaw decode (faster than algorithm)"
  - "Test adjusted for G.711 +0/-0 silence ambiguity (0x7F and 0xFF both decode to 0)"

patterns-established:
  - "TDD with node:test runner for service modules"
  - "Shared audio conversion utilities in dedicated module"

# Metrics
duration: 3min
completed: 2026-01-28
---

# Phase 02 Plan 01: Audio Conversion Module Summary

**G.711 mulaw/PCM bidirectional conversion with TDD-verified round-trip fidelity**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-28T23:54:11Z
- **Completed:** 2026-01-28T23:57:01Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Created audio-convert.ts with mulawToPcm, pcmToMulaw, resamplePcm exports
- Verified round-trip conversion preserves audio fidelity (255/256 exact, 1 due to G.711 +0/-0)
- Refactored tts.ts to use shared module (removed 57 lines of duplicate code)
- 13 tests covering edge cases, round-trip, and performance

## Task Commits

Each task was committed atomically:

1. **Task 1: Create test file with round-trip and edge case tests** - `226d61d` (test)
2. **Task 2: Implement audio-convert module to pass all tests** - `6ce9334` (feat)
3. **Task 3: Refactor tts.ts to use shared audio-convert module** - `5b30178` (refactor)

## Files Created/Modified
- `src/services/audio-convert.ts` - G.711 mulaw codec: mulawToPcm, pcmToMulaw, resamplePcm
- `src/services/audio-convert.test.ts` - 13 tests: conversion, round-trip, edge cases, performance
- `src/services/tts.ts` - Now imports from audio-convert instead of inline functions

## Decisions Made
- Used lookup table for mulaw decode (faster than computing each time)
- Adjusted round-trip test to account for G.711 +0/-0 representation (0x7F and 0xFF both represent silence, re-encoding picks 0xFF)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed overly strict round-trip test assertion**
- **Found during:** Task 2 (GREEN phase test run)
- **Issue:** Test expected byte-exact round-trip for 0x7F, but G.711 has two representations of silence (+0 at 0x7F, -0 at 0xFF) which both decode to 0 and re-encode to 0xFF
- **Fix:** Modified test to verify the PCM value is 0 for non-matching bytes, accepting 254/256 exact matches
- **Files modified:** src/services/audio-convert.test.ts
- **Verification:** All 13 tests pass
- **Committed in:** 6ce9334 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor test adjustment for correct G.711 behavior. No scope creep.

## Issues Encountered
None - TDD cycle executed smoothly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Audio conversion utilities ready for STT pipeline (mulawToPcm)
- Audio conversion utilities ready for TTS pipeline (pcmToMulaw, resamplePcm)
- tts.ts already using shared module

---
*Phase: 02-audio-pipeline-foundation*
*Completed: 2026-01-28*
