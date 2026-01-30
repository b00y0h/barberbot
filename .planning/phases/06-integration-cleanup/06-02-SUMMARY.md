---
plan: 06-02
title: Remove Legacy Provider Code
status: complete
duration: 5min
---

# Summary

Deleted the legacy provider modules (Deepgram STT, ElevenLabs/Deepgram TTS, OpenAI conversation) that were replaced by AWS equivalents during the LLM migration phase. Also removed an obsolete test that verified the deprecation notice in the now-deleted conversation.ts file.

## Changes Made

- Deleted `src/services/stt.ts` (Deepgram STT, 92 lines) - replaced by `aws-transcribe-stt.ts`
- Deleted `src/services/tts.ts` (ElevenLabs/Deepgram TTS, 145 lines) - replaced by `aws-polly-tts.ts`
- Deleted `src/services/conversation.ts` (OpenAI conversation, 330 lines) - replaced by `bedrock-conversation.ts`
- Updated `src/services/bedrock-conversation.integration.test.ts` to remove obsolete deprecation test

Note: Changes were included in commit `efb78a2` (feat(06-01): integration tests for call flow scenarios)

## Test Results

Unit tests (69 total): All pass
- audio-convert: 10 tests
- AWSPollyTTS: 8 tests
- AWSTranscribeSTT: 14 tests
- bedrock-client: 5 tests
- bedrock-conversation: 19 tests
- bedrock-tools: 17 tests (4 tools verified)

Integration tests (16 total): All pass
- Module structure verification
- Multi-turn conversation with context
- Tool schema validation (all 4 tools)
- Streaming responses
- Transcript generation
- Call Manager integration

TypeScript compilation: No errors with `npx tsc --noEmit`

## Verification

- [x] No production code imports from stt.ts, tts.ts, or conversation.ts
- [x] src/services/stt.ts deleted
- [x] src/services/tts.ts deleted
- [x] src/services/conversation.ts deleted
- [x] TypeScript compiles: `npx tsc --noEmit`
- [x] All tests pass: unit tests (69) and integration tests (16)

## must_haves

- [x] Delete stt.ts (Deepgram STT)
- [x] Delete tts.ts (ElevenLabs/Deepgram TTS)
- [x] Delete conversation.ts (OpenAI conversation)
- [x] Codebase compiles and tests pass after deletion
