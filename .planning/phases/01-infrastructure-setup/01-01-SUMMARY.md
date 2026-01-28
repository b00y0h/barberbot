---
phase: 01-infrastructure-setup
plan: 01
subsystem: infra
tags: [aws-sdk, bedrock, transcribe, polly, iam]

# Dependency graph
requires: []
provides:
  - AWS SDK v3 client factories for Bedrock, Transcribe, Polly
  - IAM credential configuration via environment variables
  - Lazy singleton pattern for client instantiation
affects: [02-llm-migration, 03-stt-migration, 04-tts-migration]

# Tech tracking
tech-stack:
  added: [@aws-sdk/client-bedrock-runtime, @aws-sdk/client-transcribe-streaming, @aws-sdk/client-polly]
  patterns: [lazy-singleton-clients, shared-aws-config]

key-files:
  created: [src/services/aws-clients.ts]
  modified: [src/config/env.ts, .env.example, package.json]

key-decisions:
  - "Default region us-east-2 (Bedrock latency-optimized)"
  - "Lazy singleton pattern matching existing twilio.ts style"
  - "[AWS] log prefix for consistency with codebase conventions"

patterns-established:
  - "AWS client factory: getAwsConfig() shared, lazy singleton getters per service"
  - "Log prefix [AWS] for all AWS-related initialization logs"

# Metrics
duration: 4min
completed: 2026-01-28
---

# Phase 01 Plan 01: AWS SDK Setup Summary

**AWS SDK v3 clients for Bedrock, Transcribe, and Polly with IAM credential authentication via lazy singleton factories**

## Performance

- **Duration:** 4 min
- **Started:** 2026-01-28T00:00:00Z
- **Completed:** 2026-01-28T00:04:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Installed AWS SDK v3 modular packages for Bedrock, Transcribe Streaming, and Polly
- Added AWS credential configuration to env.ts (accessKeyId, secretAccessKey, region)
- Created aws-clients.ts with lazy singleton factories for all three AWS services
- Updated .env.example with AWS environment variable documentation

## Task Commits

Each task was committed atomically:

1. **Task 1: Install AWS SDK packages and add AWS config to env.ts** - `bf8c1f3` (feat)
2. **Task 2: Create AWS client factory module** - `2371558` (feat)

## Files Created/Modified
- `src/services/aws-clients.ts` - Lazy singleton factories: getBedrockClient(), getTranscribeClient(), getPollyClient()
- `src/config/env.ts` - Added aws section with IAM credentials and region
- `.env.example` - Documented AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
- `package.json` - Added @aws-sdk/client-bedrock-runtime, @aws-sdk/client-transcribe-streaming, @aws-sdk/client-polly

## Decisions Made
- **Default region us-east-2:** Bedrock latency-optimized region, user can override via AWS_REGION env var
- **Lazy singleton pattern:** Matches existing codebase style (see twilio.ts), avoids creating clients until first use
- **[AWS] log prefix:** Consistent with existing log prefixes like [CallManager], [STT], [Twilio]

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
- pnpm not installed initially; installed via npm before proceeding with package installation

## User Setup Required

**External services require manual configuration.** The plan frontmatter documents:
- AWS IAM credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
- IAM permissions required: bedrock:InvokeModel, transcribe:StartStreamTranscription, polly:SynthesizeSpeech
- Enable Claude 3.5 Sonnet model access in AWS Bedrock Console

## Next Phase Readiness
- AWS infrastructure layer complete and ready for service migration
- Bedrock client ready for LLM migration (Phase 2)
- Transcribe client ready for STT migration (Phase 3)
- Polly client ready for TTS migration (Phase 4)
- No blockers - TypeScript compiles cleanly

---
*Phase: 01-infrastructure-setup*
*Completed: 2026-01-28*
