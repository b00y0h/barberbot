---
plan: 06-04
title: Add Startup Validation for Legacy Environment Variables
status: complete
duration: 8min
---

# Summary

Added startup validation that detects and errors on legacy provider environment variables (OPENAI_API_KEY, DEEPGRAM_API_KEY, ELEVENLABS_API_KEY) that are no longer used after the migration to AWS services. This prevents misconfiguration where users might set these variables expecting them to work when the system now exclusively uses AWS.

## Changes Made

- `src/config/env.ts` - Added `validateNoLegacyProviders()` function and removed legacy provider configs from EnvConfig interface (commit b006ed1)
- `src/config/env.test.ts` - Created comprehensive tests for legacy variable detection (commit b006ed1)
- `src/index.ts` - Added startup validation call with helpful error messages and exit code 1 on detection (commit b006ed1)
- `package.json` - Added test script using Node.js test runner (commit b006ed1)

## Test Results

```
ℹ tests 106
ℹ suites 48
ℹ pass 106
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1024.660188
```

All 7 new environment configuration tests pass:
- validateNoLegacyProviders returns empty array when no legacy vars set
- validateNoLegacyProviders returns error for OPENAI_API_KEY
- validateNoLegacyProviders returns error for DEEPGRAM_API_KEY
- validateNoLegacyProviders returns error for ELEVENLABS_API_KEY
- returns multiple errors when multiple legacy vars set
- env.aws has required properties
- AWS region defaults to us-east-2

## Verification

- [x] validateNoLegacyProviders function added to env.ts
- [x] Function returns errors for OPENAI_API_KEY, DEEPGRAM_API_KEY, ELEVENLABS_API_KEY
- [x] Legacy provider configs removed from EnvConfig interface
- [x] index.ts calls validation on startup and exits if legacy vars found
- [x] Tests pass: `npm test -- src/config/env.test.ts`
- [x] TypeScript compiles: `npx tsc --noEmit`

## must_haves

- [x] validateNoLegacyProviders function exported from env.ts
- [x] Startup validation in index.ts with helpful error messages
- [x] Legacy provider config removed from EnvConfig interface
- [x] Process exits with error code 1 if legacy vars detected
