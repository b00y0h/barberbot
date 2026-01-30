---
plan: 06-03
title: Remove Legacy npm Dependencies
status: complete
duration: 5min
---

# Summary

Removed the OpenAI SDK from package.json dependencies. The @deepgram/sdk was already removed in a previous phase (during STT migration). The package.json description was already updated to reflect AWS services in an earlier commit. This cleanup reduces bundle size and eliminates unused dependencies.

## Changes Made

- Removed `openai` package from dependencies (commit 389e4ab)
- Updated pnpm-lock.yaml to reflect dependency removal

## Note on @deepgram/sdk

The plan specified removing @deepgram/sdk, but this dependency was already removed during the STT migration phase. The package.json at HEAD did not contain @deepgram/sdk.

## Test Results

All 106 tests pass:

```
tests 106
suites 48
pass 106
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 945.237108
```

## Verification

- [x] openai removed from package.json
- [x] @deepgram/sdk already removed (was not in package.json)
- [x] package.json description already mentions AWS services (from earlier commit)
- [x] `pnpm install` succeeds
- [x] TypeScript compiles: `npx tsc --noEmit`
- [x] All tests pass: `npm test`
