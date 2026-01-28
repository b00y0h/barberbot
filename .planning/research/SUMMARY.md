# Project Research Summary

**Project:** BarberBot AWS Migration
**Domain:** Real-time voice AI telephony (OpenAI/Deepgram/ElevenLabs → AWS Bedrock/Transcribe/Polly)
**Researched:** 2026-01-28
**Confidence:** HIGH

## Executive Summary

This project migrates a production voice AI agent from third-party APIs (OpenAI GPT-4o, Deepgram STT, ElevenLabs TTS) to AWS-native services (Bedrock Claude, Transcribe Streaming, Polly). The migration is technically feasible with clear patterns documented across all services, but requires careful attention to three critical areas: audio format conversion (Twilio's mulaw ↔ AWS's PCM), tool calling format translation (OpenAI's function schema → Bedrock's toolSpec), and latency optimization to maintain real-time conversation feel.

The recommended approach is to migrate services incrementally, starting with audio format compatibility (Phase 1), then STT (Phase 2), TTS (Phase 3), and finally LLM with tool calling (Phase 4). This order isolates the most complex component (tool calling) until the audio pipeline is proven. AWS SDK v3 provides mature client libraries with streaming support, and all three services support the real-time patterns required for voice conversation. The primary risk is latency accumulation across the pipeline (mulaw→PCM conversion + Transcribe utterance detection + Bedrock multi-tenant spikes + Polly synthesis + PCM→mulaw conversion) potentially degrading from current 2s end-to-end to 5-8s, which destroys conversation naturalness.

Key mitigation strategies include using streaming APIs throughout (ConverseStream, not Converse), enabling Bedrock latency-optimized inference where available, configuring Transcribe for partial result stabilization, and testing end-to-end latency under production load during peak hours. The architecture preserves existing EventEmitter-based service abstractions, minimizing changes to the orchestration layer (call-manager) while replacing implementation details in STT, TTS, and conversation services.

## Key Findings

### Recommended Stack

AWS provides native equivalents for all current services with comparable feature sets. The migration path is well-documented with official AWS examples for Twilio integration, tool calling, and streaming patterns.

**Core technologies:**
- **AWS Bedrock (Claude 3.5 Sonnet)**: LLM for conversation and function calling via Converse API. Supports tool use with streaming, 200K-1M token context window, prompt caching for reduced latency on follow-up turns. Use ConverseStreamCommand for real-time responses.
- **AWS Transcribe Streaming**: Real-time speech-to-text with WebSocket (browser) or HTTP/2 (Node.js) support. Requires PCM input (mulaw conversion needed). Provides partial results with stabilization for lower latency, utterance detection via IsPartial field transitions.
- **AWS Polly**: Text-to-speech with neural voices. Outputs PCM at 8kHz or 16kHz (mulaw conversion needed for Twilio). Lower latency than ElevenLabs when configured for 8kHz output, eliminating resampling overhead.
- **AWS SDK v3 (@aws-sdk/client-*)**: Modular packages for each service. Requires Node.js 20+ (v18 support ends January 2026). Includes TypeScript definitions and automatic credential loading via environment variables.
- **wavefile (v11)**: Pure JavaScript library for mulaw ↔ PCM audio format conversion. No native dependencies, TypeScript-friendly. Essential for Twilio compatibility.

**Critical version requirement:** Node.js 20 LTS required. AWS SDK v3 drops Node.js 18 support in January 2026.

### Expected Features

Migration must achieve feature parity with current stack, with some AWS-specific differences requiring adaptation.

**Must have (table stakes):**
- **Tool calling / function calling** — Core to appointment booking flow. AWS supports via Bedrock Converse API with toolSpec format (different schema from OpenAI).
- **Real-time streaming STT** — Required for conversation input. Transcribe Streaming supports this but requires mulaw→PCM conversion.
- **Real-time streaming TTS** — Required for natural response timing. Polly SynthesizeSpeechCommand returns AudioStream.
- **Partial transcripts** — Enables responsive UI and faster utterance detection. Transcribe provides via IsPartial field.
- **Audio format: mulaw 8kHz** — Twilio Media Streams requirement. Neither Transcribe nor Polly natively support mulaw; conversion required both ways.
- **Barge-in / Interruption handling** — Users expect to interrupt bot mid-sentence. Same AbortController pattern works with AWS services.
- **Message history management** — Multi-turn conversation with context. Bedrock Converse API uses similar message array structure to OpenAI.
- **Streaming response generation** — LLM streams tokens for lower latency. ConverseStream API provides this.

**Gaps requiring adaptation:**
- **Tool definition format** — OpenAI `function` → Bedrock `toolSpec` with `inputSchema.json` wrapper. One-time conversion needed.
- **Audio encoding for STT** — Deepgram accepts mulaw directly; Transcribe requires mulaw→PCM16 conversion before sending.
- **Audio encoding for TTS** — ElevenLabs outputs Linear16 PCM; Polly outputs PCM/MP3/OGG but not mulaw. Keep existing PCM→mulaw conversion.
- **Utterance end detection** — Deepgram emits explicit UtteranceEnd event; Transcribe uses IsPartial: false transitions. Detection logic changes.
- **TTS fallback chain** — Current ElevenLabs→Deepgram fallback removed. Single provider (Polly) simplifies but reduces resilience.

**AWS bonuses (not currently used):**
- **Partial results stabilization** — Words marked stable won't change in future partial results. Improves transcript reliability.
- **Neural TTS voices** — Higher quality than standard Polly voices. Default to 24kHz (needs resampling) or configure for 8kHz.
- **Custom vocabularies** — Improve Transcribe accuracy for domain-specific terms (barbershop services, staff names).
- **Call Analytics** — Sentiment analysis, participant role detection (could add conversation insights).
- **Multi-model support** — Converse API abstraction enables switching between Claude, Llama, Mistral without code changes.

### Architecture Approach

The existing architecture uses EventEmitter-based service abstractions (STT, TTS, Conversation) coordinated by a per-call manager. This pattern is preserved, replacing only service implementations while keeping orchestration logic unchanged.

**Major components:**
1. **audio-pipeline.ts** — WebSocket handler for Twilio Media Streams. Decodes base64 mulaw chunks, routes to CallManager. **Unchanged** (already handles mulaw encode/decode).
2. **call-manager.ts** — Per-call orchestration. Creates STT/TTS/Conversation instances per call, manages utterance flow, sends greeting, processes user speech. **Unchanged** (calls same EventEmitter APIs).
3. **stt.ts (services/)** — Speech-to-text streaming service. **Replace DeepgramSTT with AWSTranscribeSTT** class. Keep EventEmitter interface (emit 'transcript', 'utterance_end', 'error', 'close'). Add mulaw→PCM conversion in sendAudio(). Change connection from WebSocket to HTTP/2 async generator pattern.
4. **tts.ts (services/)** — Text-to-speech streaming service. **Replace ElevenLabs/Deepgram with Polly SynthesizeSpeechCommand**. Keep EventEmitter interface (emit 'audio', 'done', 'error'). Remove 24kHz→8kHz resampling (Polly outputs 8kHz directly). Keep PCM→mulaw conversion. Simplify by removing fallback logic.
5. **conversation.ts (services/)** — LLM conversation management with tool calling. **Major refactor** to convert message format (OpenAI schema → Bedrock schema), tool definitions (function → toolSpec), and tool response parsing (tool_calls array → content blocks with toolUse). Keep ConversationState interface and tool handler logic.

**Key architectural patterns preserved:**
- **Service abstraction via EventEmitter** — CallManager doesn't know about provider details. Easy to test with mock emitters.
- **Per-call state management** — Each call gets isolated STT, TTS, Conversation instances. No cross-call contamination.
- **Audio format conversion at boundaries** — Convert mulaw↔PCM at service boundaries. Services work with native formats, orchestration works with Twilio format.

**Data flow changes:**
```
Current STT: Twilio → mulaw → Deepgram WebSocket → transcript events
AWS STT:     Twilio → mulaw → PCM16 → Transcribe HTTP/2 → transcript events

Current TTS: Text → ElevenLabs → PCM 24kHz → resample 8kHz → mulaw → Twilio
AWS TTS:     Text → Polly → PCM 8kHz → mulaw → Twilio
```

### Critical Pitfalls

Research identified 5 critical pitfalls that have caused production failures in similar AWS migrations. Each has clear prevention and recovery strategies.

1. **Audio Format Incompatibility Chain** — Twilio uses mulaw 8kHz; AWS Transcribe ONLY accepts PCM (no mulaw); AWS Polly ONLY outputs PCM/MP3/OGG (no mulaw). Forgetting either conversion direction causes empty transcripts or garbled audio. **Prevention:** Implement mulaw→PCM conversion BEFORE Transcribe input, PCM→mulaw conversion AFTER Polly output. Use wavefile library. Test with actual Twilio calls early. **Phase to address:** Phase 1 (Audio Pipeline Foundation).

2. **Tool Calling Format Translation Breaks at Runtime** — OpenAI uses `functions` array with `function_call` responses; Bedrock uses `tools` array with `tool_use` content blocks and different response structure. Basic chat works but tool calls fail silently. **Prevention:** Write translation layer for tool definitions (parameters → inputSchema.json) and response parsing (tool_calls → content.toolUse blocks). Test with forced tool invocation for EVERY tool. **Phase to address:** Phase 2 (LLM Tool Calling Migration).

3. **Latency Accumulation Breaks Real-Time Feel** — Current stack: <2s end-to-end. AWS stack: mulaw→PCM conversion + Transcribe utterance detection (less aggressive than Deepgram) + Bedrock multi-tenant spikes (2-6s during peak hours) + Polly synthesis + PCM→mulaw conversion = 5-8s total, destroying conversation naturalness. **Prevention:** Use ConverseStream API (not Converse), enable Bedrock latency-optimized inference (us-east-2/us-west-2 only), configure Transcribe partial result stabilization for faster utterance detection, use Polly PCM 8kHz output (skip resampling), pipeline STT→LLM→TTS (start TTS on first LLM tokens). Measure end-to-end latency under production load during peak hours (2pm ET). **Phase to address:** Phase 3 (Latency Optimization).

4. **Region Availability and Cross-Region Confusion** — Not all AWS services available in all regions. Claude 3.5 Haiku with latency-optimized inference ONLY in us-east-2 and us-west-2. Bedrock cross-region inference can route to regions not manually enabled, violating data residency policies. Services in different regions add inter-service latency. **Prevention:** Check Bedrock Models by Region documentation. Deploy all services in SAME region. Use regional endpoints (not cross-region profiles) if data residency required. Set AWS_REGION environment variable explicitly. **Phase to address:** Phase 0 (Infrastructure Setup).

5. **Streaming API Differences Break Interruption Handling** — OpenAI streams with simple delta.content events; Bedrock streams with ContentBlockStart, ContentBlockDelta, ContentBlockStop, MessageStop events. Interruption logic must abort cleanly, but tool calling during interruptions requires deciding whether to complete tool call or abort immediately. Some models (Mistral 2 Large) don't support tool use + streaming. **Prevention:** Use ConverseStream with Claude 3.5 (supports tool use + streaming). Implement abort at event level. When user interrupts during tool call, complete current tool (don't corrupt results), abort TTS immediately, cancel next LLM turn. Test interruptions at EVERY conversation stage. **Phase to address:** Phase 4 (Interruption Handling).

## Implications for Roadmap

Based on research, suggested phase structure follows dependency order and risk isolation:

### Phase 0: Infrastructure Setup
**Rationale:** Region configuration and IAM credentials must be correct before any implementation. Getting this wrong causes cascading failures across all services.
**Delivers:** AWS SDK clients configured, IAM permissions verified, region selection documented.
**Addresses:** Pitfall 4 (Region Availability). Ensures all services available in chosen region, IAM credentials work, no cross-region data routing surprises.
**Prerequisites:** AWS account with Bedrock access (requires model access request), IAM user/role with transcribe:StartStreamTranscription, bedrock:InvokeModel, polly:SynthesizeSpeech permissions.
**Research needed:** No (well-documented, standard AWS setup).

### Phase 1: Audio Format Compatibility (CRITICAL PATH)
**Rationale:** Nothing works without mulaw↔PCM conversion. This is the highest-risk technical component with no fallback — if audio format is wrong, transcripts are empty and Twilio plays noise.
**Delivers:** mulaw→PCM conversion for STT input, PCM→mulaw conversion verified with Polly output. Validates with test Twilio call producing clear transcripts and audio playback.
**Addresses:** Pitfall 1 (Audio Format Incompatibility). Implements wavefile library integration, validates PCM byte alignment, tests with actual Twilio audio chunks.
**Stack elements:** wavefile v11 for conversion, Transcribe MediaEncoding: "pcm", Polly OutputFormat: "pcm" at 8kHz.
**Research needed:** No (well-documented in AWS blogs and GitHub discussions).

### Phase 2: STT Migration (Deepgram → Transcribe)
**Rationale:** Needed for conversation input. Simpler than LLM migration (no tool calling complexity). Depends on Phase 1 audio conversion working.
**Delivers:** AWSTranscribeSTT class replacing DeepgramSTT, EventEmitter interface preserved, utterance end detection adapted to IsPartial transitions.
**Addresses:** Features: Real-time streaming STT, partial transcripts, utterance end detection. Uses Phase 1 mulaw→PCM conversion.
**Stack elements:** @aws-sdk/client-transcribe-streaming, StartStreamTranscriptionCommand with async generator pattern.
**Research needed:** No (standard pattern, well-documented).

### Phase 3: TTS Migration (ElevenLabs/Deepgram → Polly)
**Rationale:** Output quality visible but less critical than input transcription. Simpler than STT (no utterance detection complexity). Can develop in parallel with Phase 2 after Phase 1 completes.
**Delivers:** Polly SynthesizeSpeechCommand integration, PCM 8kHz output streaming, PCM→mulaw conversion verified, fallback logic removed.
**Addresses:** Features: Real-time streaming TTS, barge-in via AbortController. Uses Phase 1 PCM→mulaw conversion.
**Stack elements:** @aws-sdk/client-polly, SynthesizeSpeechCommand with AudioStream iteration.
**Research needed:** No (standard pattern, well-documented).

### Phase 4: LLM Migration (OpenAI → Bedrock Claude)
**Rationale:** Most complex due to tool calling format differences. Depends on Phases 2-3 complete for end-to-end testing. Isolating this last allows audio pipeline validation before tackling tool calling.
**Delivers:** Bedrock Converse API integration, tool definition schema conversion (function → toolSpec), tool response parsing updated, ConverseStream API for streaming, all tools tested with forced invocation.
**Addresses:** Features: Tool calling, message history, streaming response generation. Pitfall 2 (Tool Calling Format Translation).
**Stack elements:** @aws-sdk/client-bedrock-runtime, ConverseCommand and ConverseStreamCommand, toolConfig with toolSpec format.
**Research needed:** Yes (complex tool calling format translation, needs validation with all 4 existing tools: book_appointment, check_availability, collect_customer_info, get_business_info).

### Phase 5: Latency Optimization
**Rationale:** Functional migration complete, now optimize for production latency requirements. Must test under load during peak hours to catch Bedrock multi-tenant spikes.
**Delivers:** End-to-end latency <2s on real calls, streaming pipeline optimized (STT→LLM→TTS overlaps), Bedrock latency-optimized inference enabled (if region supports), Transcribe partial result stabilization configured, prompt caching enabled for conversation context.
**Addresses:** Pitfall 3 (Latency Accumulation). Validates production-ready performance.
**Stack elements:** ConverseStream API, Transcribe PartialResultsStabilization, Bedrock performanceConfig latency optimization, prompt caching.
**Research needed:** No (clear optimization patterns documented).

### Phase 6: Interruption Handling & Polish
**Rationale:** After all services migrated and latency optimized, implement natural interruption flow. Requires all components working to test interruptions at every conversation stage.
**Delivers:** Barge-in working at all conversation stages (greeting, mid-sentence, during tool call, during confirmation), AbortController logic for Bedrock streams, tool call completion on interruption (don't corrupt results).
**Addresses:** Pitfall 5 (Streaming API Differences), Features: Barge-in/interruption handling.
**Stack elements:** ConverseStream event handling, AbortController for streams.
**Research needed:** No (standard pattern, Bedrock ConverseStream API documented).

### Phase Ordering Rationale

**Why audio format first?** Without mulaw↔PCM conversion, no AWS service works with Twilio. This is the foundation that unblocks everything else. It's also the highest-risk component with no workaround — if format is wrong, calls fail completely.

**Why STT before TTS?** Conversation input is more critical than output. Users tolerate imperfect voice synthesis more than failed speech recognition. STT is also simpler (no tool calling) and proves the audio pipeline works before adding LLM complexity.

**Why LLM last?** Tool calling format translation is the most complex component with the most edge cases (4 tools x multiple conversation paths). Isolating this until audio pipeline is proven reduces debugging complexity. End-to-end testing requires STT and TTS working.

**Why latency optimization as separate phase?** Optimization requires all services working to measure true end-to-end latency. Early optimization is premature — might optimize the wrong component. Must test under production load during peak hours to catch Bedrock multi-tenant spikes.

**Why interruption handling last?** Requires all components working to test interruptions at every stage. Tool calling + interruption is the most complex interaction. Polish phase after functional migration complete.

### Research Flags

**Phases likely needing deeper research during planning:**
- **Phase 4 (LLM Migration):** Complex tool calling format translation. Should use `/gsd:research-phase` to investigate all 4 existing tools, OpenAI→Bedrock schema mapping, tool response parsing differences, and test strategies for forced invocation.

**Phases with standard patterns (skip research-phase):**
- **Phase 0 (Infrastructure Setup):** Standard AWS setup, well-documented.
- **Phase 1 (Audio Format):** Clear pattern in AWS blogs and GitHub discussions.
- **Phase 2 (STT Migration):** Standard Transcribe integration, documented examples.
- **Phase 3 (TTS Migration):** Standard Polly integration, documented examples.
- **Phase 5 (Latency Optimization):** Clear optimization patterns documented in AWS blogs.
- **Phase 6 (Interruption Handling):** Standard ConverseStream event handling.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All packages verified on npm with latest versions (as of 2026-01-28). Official AWS SDK v3 documentation complete for all services. Node.js 20 compatibility confirmed. |
| Features | HIGH | Feature parity achievable with documented workarounds for format differences. Tool calling supported via Converse API with clear migration path from OpenAI schema. Streaming APIs mature. |
| Architecture | HIGH | EventEmitter pattern preserves existing abstractions. Clear component boundaries documented. Data flow changes well-understood. Integration points verified with AWS examples. |
| Pitfalls | HIGH | All pitfalls sourced from AWS official documentation, GitHub issues, and third-party production reports. Prevention strategies verified with official AWS blogs. Phase mapping clear. |

**Overall confidence:** HIGH

Research based on official AWS documentation, npm package registry verification, AWS SDK v3 examples, and community production reports. All critical paths have documented solutions. Migration is technically feasible with clear patterns.

### Gaps to Address

While confidence is high overall, the following areas need validation during implementation:

- **Actual Bedrock latency under production load** — Documentation shows "similar to OpenAI" but third-party reports mention multi-tenant spikes during peak hours. Must measure with real traffic during peak hours (2pm ET) in chosen region. If spikes occur, may need cross-region inference profiles or regional failover.

- **Transcribe utterance detection timing vs Deepgram** — Transcribe uses IsPartial: false transitions instead of explicit UtteranceEnd events. Documentation doesn't specify exact timing thresholds. May need tuning of PartialResultsStabilization settings to match current conversation timing feel. Validate with user testing after STT migration.

- **Polly voice quality comparison** — Neural voices documented as "high quality" but subjective comparison to ElevenLabs needed. If quality gap is significant for business requirements, may need to keep ElevenLabs or investigate Polly brand voices (premium option).

- **Tool calling edge cases** — OpenAI→Bedrock schema conversion documented for basic cases, but complex tool interactions (nested objects, optional parameters, tool choice forcing) need validation with actual BarberBot tools. Phase 4 research should investigate all 4 existing tools comprehensively.

- **Audio conversion CPU overhead** — mulaw↔PCM conversion adds processing. Documentation doesn't quantify CPU impact. May become bottleneck with many concurrent calls. Monitor CPU usage during load testing; if problematic, consider worker thread offloading or native codec.

## Sources

### Primary (HIGH confidence)

**AWS Official Documentation:**
- [AWS SDK v3 Bedrock Runtime Client](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/bedrock-runtime/) — API reference, verified all commands
- [AWS SDK v3 Transcribe Streaming Client](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/transcribe-streaming/) — API reference, verified streaming pattern
- [AWS SDK v3 Polly Client](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/polly/) — API reference, verified output formats
- [Amazon Bedrock Converse API](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference-call.html) — Multi-turn conversation patterns
- [Amazon Bedrock Tool Use](https://docs.aws.amazon.com/bedrock/latest/userguide/tool-use.html) — Function calling with toolSpec format
- [Amazon Transcribe Streaming](https://docs.aws.amazon.com/transcribe/latest/dg/streaming.html) — Audio format requirements, partial results
- [Amazon Polly SynthesizeSpeech API](https://docs.aws.amazon.com/polly/latest/dg/API_SynthesizeSpeech.html) — Output formats, sample rates
- [Bedrock Models by Region](https://docs.aws.amazon.com/bedrock/latest/userguide/models-regions.html) — Regional availability verified
- [Bedrock Latency-Optimized Inference](https://docs.aws.amazon.com/bedrock/latest/userguide/latency-optimized-inference.html) — Performance features by region

**npm Package Registry:**
- [@aws-sdk/client-bedrock-runtime@3.966.0](https://www.npmjs.com/package/@aws-sdk/client-bedrock-runtime) — Latest version verified 2026-01-28
- [@aws-sdk/client-transcribe-streaming@3.930.0](https://www.npmjs.com/package/@aws-sdk/client-transcribe-streaming) — Latest version verified 2026-01-28
- [@aws-sdk/client-polly@3.953.0](https://www.npmjs.com/package/@aws-sdk/client-polly) — Latest version verified 2026-01-28
- [wavefile@11.0.0](https://www.npmjs.com/package/wavefile) — mulaw/PCM conversion, TypeScript support verified

### Secondary (MEDIUM confidence)

**AWS Blogs:**
- [Bedrock Latency Optimization Guide](https://aws.amazon.com/blogs/machine-learning/optimizing-ai-responsiveness-a-practical-guide-to-amazon-bedrock-latency-optimized-inference/) — Performance tuning strategies
- [Transcribe + Twilio Medical Example](https://aws.amazon.com/blogs/machine-learning/perform-medical-transcription-analysis-in-real-time-with-amazon-transcribe-medical-and-amazon-comprehend-medical-with-twilio-media-streams/) — Twilio integration pattern
- [Integrating Polly with legacy IVR systems](https://aws.amazon.com/blogs/machine-learning/integrating-amazon-polly-with-legacy-ivr-systems-by-converting-output-to-wav-format/) — PCM to WAV conversion patterns

**GitHub:**
- [GitHub: Twilio + Transcribe mulaw issue](https://github.com/aws/aws-sdk-js-v3/discussions/4648) — Community solution for mulaw→PCM conversion
- [GitHub: Bedrock Tool Calling Examples](https://github.com/aws-samples/function-calling-using-amazon-bedrock-anthropic-claude-3) — Reference implementation
- [GitHub: stream-ai-assistant-using-bedrock-converse-with-tools](https://github.com/aws-samples/stream-ai-assistant-using-bedrock-converse-with-tools) — Streaming + tools pattern

### Tertiary (LOW confidence, needs validation)

**Third-Party Analysis:**
- [Amazon Bedrock 2026 Review](https://www.truefoundry.com/blog/our-honest-review-of-amazon-bedrock-2026-edition) — Reports multi-tenant latency spikes during peak hours
- [Amazon Polly Latency Tips](https://play.ht/blog/amazon-text-to-speech-latency/) — Optimization strategies from competitor
- [Best TTS APIs 2026 Benchmarks](https://inworld.ai/resources/best-voice-ai-tts-apis-for-real-time-voice-agents-2026-benchmarks) — Performance comparison
- [AWS Re:Post: Bedrock Tool Use + Streaming Limitation](https://repost.aws/questions/QU9LG7D9x9Sp-Rucl-AIeFVw/using-bedrock-with-mistral-2-large-converse-api-with-tools-would-not-let-me-use-streaming-feature) — Model-specific limitations

---
*Research completed: 2026-01-28*
*Ready for roadmap: yes*
