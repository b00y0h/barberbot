---
plan: 06-05
title: Update Environment Documentation
status: complete
duration: 3min
---

# Summary

Updated `.env.example` to reflect the AWS-only configuration after removing legacy providers. The file now clearly documents the required AWS credentials and includes a legacy provider notice to help developers migrating from older configurations.

## Changes Made

- `.env.example` updated (commit 2d48b56)
  - Removed active configuration for DEEPGRAM_API_KEY, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, and OPENAI_API_KEY
  - Added descriptive comments for AWS section explaining it handles all AI services (Bedrock LLM, Transcribe STT, Polly TTS)
  - Added required IAM permissions note (bedrock:*, transcribe:*, polly:*)
  - Added legacy provider notice explaining migration and startup validation behavior
  - Simplified BASE_URL example (removed Tailscale-specific reference)

## Verification

- [x] .env.example updated with AWS-only configuration
- [x] Legacy provider variables removed from active config
- [x] Comment block explains legacy provider removal
- [x] All required AWS variables documented (ACCESS_KEY_ID, SECRET_ACCESS_KEY, REGION)
- [x] File syntax is valid (verified with `source .env.example`)
