# Phase 6 Context: Integration & Cleanup

## Purpose
Decisions captured here guide research and planning for Phase 6. Downstream agents should not need to ask the user about these topics again.

## Validation Approach

### Success Bar
- **Multiple scenarios required** — not just happy path
- Four must-have scenarios:
  1. **Booking flow** — greeting → conversation → book appointment → confirmation
  2. **Availability check** — ask about available times without booking
  3. **Barge-in/interruption** — caller speaks mid-sentence, bot stops and listens
  4. **Business info query** — hours, location, services

### Test Execution
- **Both automated and manual validation**
- Automated tests:
  - Mocked integration tests for PR checks (no AWS credentials needed)
  - Live AWS integration tests for nightly/release builds
- Manual verification:
  - Real test calls to verify actual call quality
  - User will make calls to confirm behavior

### Error Coverage
- **Basic error scenarios** — test obvious failures
- Examples: unavailable time slots, invalid dates
- Not required: network drops, bad audio quality, timeouts (deferred)

## Fallback Behavior

### Cut-Over Strategy
- **Hard cut** — remove old providers completely
- AWS-only from this phase forward
- No feature flags or gradual migration needed

### Rollback Approach
- **Not applicable** — system hasn't deployed yet
- Git history serves as the restoration path if ever needed
- No need for commented code or disabled providers

### Old Code Removal
- **Delete entirely** — do not keep in legacy/ folder
- Git history preserves code if reference needed later
- Clean codebase with no dead code

### Dependency Cleanup
- **Remove dependencies + add validation**
- Remove from package.json: openai, @deepgram/sdk, elevenlabs (and related)
- Remove from .env.example and documentation
- **Add startup validation**: error if old env vars still set (OPENAI_API_KEY, DEEPGRAM_API_KEY, ELEVENLABS_API_KEY)
- This prevents misconfiguration where someone sets old vars expecting them to work

## Deferred Ideas

None captured during discussion.

## Decisions Not Made Here

These remain for researcher/planner to determine:
- Specific file structure changes
- Test file organization
- Order of cleanup operations
- CI/CD configuration details

---
*Created: 2026-01-30*
*Phase: 6 of 6 (Integration & Cleanup)*
