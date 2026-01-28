# Pitfalls Research

**Domain:** Real-time voice AI migration (OpenAI/Deepgram/ElevenLabs → AWS Bedrock/Transcribe/Polly)
**Researched:** 2026-01-28
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Audio Format Incompatibility Chain

**What goes wrong:**
Twilio sends mulaw 8kHz audio. AWS Transcribe does NOT support mulaw — it only accepts FLAC, Opus-in-Ogg, or PCM (signed 16-bit little-endian). Amazon Polly does NOT support mulaw output — it only produces mp3, ogg_vorbis, pcm, or json. You must implement mulaw↔PCM conversion for BOTH STT input and TTS output, or calls will fail with empty transcripts or distorted audio.

**Why it happens:**
Developers assume AWS services support telephony formats because they're "telephony-grade services," but AWS focuses on web/streaming formats (PCM, MP3) rather than legacy telephony formats (mulaw/G.711). Deepgram and ElevenLabs natively support mulaw, hiding this complexity.

**How to avoid:**
- Implement mulaw→PCM conversion BEFORE sending audio to AWS Transcribe (decode base64 → mulaw→PCM)
- Implement PCM→mulaw conversion AFTER receiving audio from Polly (PCM→mulaw → base64 encode)
- For Transcribe: Use PCM 8kHz or 16kHz (16kHz recommended for quality)
- For Polly: Request PCM output at 8kHz, then convert to mulaw
- Test with actual Twilio audio early — don't rely on file-based testing

**Warning signs:**
- AWS Transcribe returns empty transcripts (`{ Transcript: { Results: [] } }`)
- Twilio plays garbled/loud noise instead of speech
- Audio chunks have incorrect byte alignment (PCM requires even bytes for mono, 4-byte multiples for stereo)

**Phase to address:**
Phase 1 (Audio Pipeline Foundation) — must be working before LLM or conversation logic

**Sources:**
- [AWS Transcribe Streaming Documentation](https://docs.aws.amazon.com/transcribe/latest/dg/streaming.html) - Confirms no mulaw support
- [Amazon Polly SynthesizeSpeech API](https://docs.aws.amazon.com/polly/latest/dg/API_SynthesizeSpeech.html) - OutputFormat options (no mulaw)
- [GitHub: Twilio + AWS Transcribe mulaw issue](https://github.com/aws/aws-sdk-js-v3/discussions/4648) - Community reports empty transcripts

---

### Pitfall 2: Tool Calling Format Translation Breaks at Runtime

**What goes wrong:**
OpenAI uses `functions` array with `function_call` in responses. AWS Bedrock Claude uses `tools` array with `tool_use` content blocks and `stopReason: "tool_use"`. The response structure is fundamentally different — OpenAI returns `choices[0].message.function_call`, Bedrock returns `content: [{ type: "tool_use", id, name, input }]`. Direct SDK swaps fail silently or throw parsing errors during actual tool calls, not during basic chat.

**Why it happens:**
Basic conversation works fine (text in, text out), so developers assume the migration is complete. Tool calling only triggers under specific conversational conditions (e.g., "I want to book an appointment"), making it easy to miss during initial testing. OpenAI and Anthropic use different tool definition schemas (`parameters` vs `input_schema`).

**How to avoid:**
- Write a translation layer between your existing tool handlers and Bedrock's format
- OpenAI `functions` schema → Bedrock `tools` with `input_schema` (both use JSON Schema, but key names differ)
- Parse Bedrock responses: extract `tool_use` blocks, map `input` to your function args, return results as `tool_result` blocks with `tool_use_id`
- Test with conversations that FORCE tool usage — use Bedrock's `toolChoice: { tool: { name: "specific_tool" } }` to verify each tool
- For OpenAI's `function_call: "auto"`, use Bedrock's `toolChoice: { auto: {} }` (default behavior)
- For forcing tools, use `toolChoice: { any: {} }` (must call at least one) or `toolChoice: { tool: { name: "book_appointment" } }` (specific tool)

**Warning signs:**
- Chat works but booking/data collection fails with "unexpected response format" errors
- Tool definitions accepted but never invoked during conversation
- Response parsing crashes when user triggers business logic ("book me for 2pm")
- `stopReason` is `end_turn` instead of `tool_use` when tools should be called

**Phase to address:**
Phase 2 (LLM Tool Calling Migration) — after basic chat works, before production

**Sources:**
- [AWS Bedrock Tool Use Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages-tool-use.html) - Format differences
- [AWS Bedrock ToolChoice API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ToolChoice.html) - auto/any/tool options
- [GitHub: Bedrock tool calling examples](https://github.com/aws-samples/function-calling-using-amazon-bedrock-anthropic-claude-3) - Reference implementation

---

### Pitfall 3: Latency Accumulation Breaks Real-Time Feel

**What goes wrong:**
OpenAI/Deepgram/ElevenLabs are optimized for real-time voice (sub-second latencies). AWS services add latency at each layer: (1) mulaw→PCM conversion adds processing time, (2) Transcribe utterance detection is less aggressive than Deepgram (longer wait for "final" transcripts), (3) Bedrock LLM calls can spike from 2s to 6s during peak US hours due to multi-tenancy, (4) Polly TTS averages 100ms-1s but can be slower for long text, (5) PCM→mulaw conversion adds processing time. Total latency can jump from <2s (current) to 5-8s (AWS), destroying conversation naturalness.

**Why it happens:**
Each service is tested in isolation and meets SLAs (e.g., "Polly responds in <1s"), but real-time voice requires end-to-end latency <2s. AWS Bedrock is multi-tenant, so "noisy neighbor" effects during peak hours cause unpredictable spikes. Developers optimize one service (e.g., Transcribe chunk size) but ignore cumulative pipeline latency.

**How to avoid:**
- **Transcribe optimization:**
  - Use 50-200ms audio chunks (calculate: `(chunk_ms/1000) * sample_rate * 2` bytes)
  - Enable `PartialResultsStabilization` with `PartialResultsStability: "high"` for lower latency (trades accuracy)
  - Use 16kHz sample rate if possible (better than 8kHz for quality/latency balance)
- **Bedrock optimization:**
  - Use `ConverseStream` API (streaming) instead of `Converse` (wait for full response)
  - Enable latency-optimized inference: `performanceConfig: { latency: "optimized" }` (available for Claude 3.5 Haiku, Nova Pro in specific regions)
  - Reduce system prompt tokens — shorter prompts = faster responses
  - Enable prompt caching for conversation context (reduces processing on follow-up turns)
  - Deploy in same AWS region as Bedrock endpoint (us-east-1, us-west-2 recommended)
  - Monitor latency during peak hours (2pm ET) and consider cross-region inference profiles if spikes occur
- **Polly optimization:**
  - Send short text blocks incrementally (not full paragraphs)
  - Use PCM 8kHz output (lower sample rate = faster generation)
  - Deploy in region close to Transcribe/Bedrock (minimize inter-service latency)
  - Consider caching common phrases (greetings, confirmations)
- **Pipeline optimization:**
  - Process audio conversion asynchronously (don't block on codec)
  - Pipeline STT→LLM→TTS (start TTS as soon as LLM streams first words)
  - Measure end-to-end latency with real Twilio calls, not file playback

**Warning signs:**
- Users complain of "long pauses" or "feels slow"
- Latency metrics show >3s from speech end to bot response start
- Latency is acceptable in mornings but degrades in afternoons (Bedrock multi-tenancy)
- Conversation feels "choppy" despite each service responding individually

**Phase to address:**
Phase 3 (Latency Optimization) — after functional migration, before production launch. Must measure end-to-end latency under production load.

**Sources:**
- [AWS Bedrock Latency-Optimized Inference](https://aws.amazon.com/blogs/machine-learning/optimizing-ai-responsiveness-a-practical-guide-to-amazon-bedrock-latency-optimized-inference/) - Performance optimization
- [AWS Transcribe Streaming Partial Results](https://docs.aws.amazon.com/transcribe/latest/dg/streaming-partial-results.html) - Utterance detection config
- [Amazon Polly Latency Tips](https://play.ht/blog/amazon-text-to-speech-latency/) - Optimization strategies
- [Bedrock 2026 Review: Noisy Neighbor Issues](https://www.truefoundry.com/blog/our-honest-review-of-amazon-bedrock-2026-edition) - Multi-tenant latency variance

---

### Pitfall 4: Region Availability and Cross-Region Confusion

**What goes wrong:**
Not all AWS services are available in all regions. Claude 3.5 Haiku with latency-optimized inference is ONLY in us-east-2 (Ohio) and us-west-2 (Oregon). Bedrock cross-region inference can route to regions NOT manually enabled in your account, which may violate data residency policies. Services (Transcribe, Bedrock, Polly) may be in different regions, adding inter-service latency. IAM errors like "Credential should be scoped to a valid region" occur when using wrong region for global services.

**Why it happens:**
Developers assume all AWS services are available everywhere and don't check regional feature matrices. Bedrock's cross-region inference "just works" but silently routes data across geographic boundaries. IAM is a global service requiring us-east-1 scoping, but this isn't obvious. Different services launch features in different regions at different times.

**How to avoid:**
- Check [Bedrock Models by Region](https://docs.aws.amazon.com/bedrock/latest/userguide/models-regions.html) for Claude model availability
- Check [Bedrock Latency-Optimized Regions](https://docs.aws.amazon.com/bedrock/latest/userguide/latency-optimized-inference.html) for performance features (us-east-2, us-west-2 for Claude 3.5 Haiku as of 2026-01)
- Deploy all services (Transcribe, Bedrock, Polly) in the SAME region to minimize latency
- Use regional Bedrock endpoints (not cross-region profiles) if you have data residency requirements
- IAM client requires `us-east-1` region (global service)
- Use AWS SDK default credential provider chain (don't hardcode credentials)
- Set `AWS_REGION` environment variable explicitly
- Test IAM credentials with `aws sts get-caller-identity` before application launch

**Warning signs:**
- "Model not found" errors despite correct model ID
- "Feature not available in this region" errors
- Unexpectedly high latency between service calls
- IAM authentication fails with "region scoping" errors
- CloudTrail logs show requests in regions you didn't configure

**Phase to address:**
Phase 0 (Infrastructure Setup) — before any implementation. Get region configuration right first.

**Sources:**
- [Bedrock Model Support by Region](https://docs.aws.amazon.com/bedrock/latest/userguide/models-regions.html) - Regional availability
- [Bedrock Cross-Region Inference](https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html) - Data routing behavior
- [AWS IAM Region Scoping Issue](https://github.com/aws/aws-sdk-java/issues/3108) - Common credential errors

---

### Pitfall 5: Streaming API Differences Break Interruption Handling

**What goes wrong:**
OpenAI streams token-by-token with `delta.content` events. Bedrock Claude streams with different event types: `ContentBlockStart`, `ContentBlockDelta`, `ContentBlockStop`, `MessageStop`. Your existing "abort current TTS on user speech" logic assumes you can immediately stop LLM streaming, but Bedrock tool calling with streaming has model-specific limitations (e.g., Mistral 2 Large doesn't support tool use in streaming mode). Interruption logic breaks because you can't cleanly abort Bedrock streams during tool execution.

**Why it happens:**
Interruption (barge-in) is complex with tool calling: if LLM is mid-tool-call when user interrupts, you must decide whether to (1) complete the tool call then abort, (2) abort immediately and lose tool result, or (3) queue the interruption. OpenAI SDK had one streaming pattern, Bedrock has multiple event types. Testing without interruptions misses this.

**How to avoid:**
- Use `ConverseStream` API for streaming, parse event types: `contentBlockStart`, `contentBlockDelta`, `metadata` (contains `stopReason`)
- Implement abort logic at event level, not token level
- For tool use + streaming:
  - Check model support ([Mistral 2 Large doesn't support it](https://repost.aws/questions/QU9LG7D9x9Sp-Rucl-AIeFVw/using-bedrock-with-mistral-2-large-converse-api-with-tools-would-not-let-me-use-streaming-feature))
  - Use Claude 3.5 Haiku or Sonnet 4 which DO support tool use + streaming
  - Hybrid approach: non-streaming for tool calls, streaming for text-only responses
- When user interrupts during tool execution:
  - Let current tool call complete (don't corrupt tool results)
  - Abort TTS immediately
  - Cancel next LLM turn and process interruption as new user message
- Test interruptions at EVERY conversation stage: greeting, mid-sentence, during tool call, during confirmation

**Warning signs:**
- Interruptions work in basic chat but fail during booking flow
- "Streaming not supported for this operation" errors
- Tool calls complete even after user interrupted
- Bot speaks over user despite STT detecting speech
- AbortController doesn't cleanly stop Bedrock streams

**Phase to address:**
Phase 4 (Interruption Handling) — after tool calling works, before production. Critical for natural conversation feel.

**Sources:**
- [Bedrock ConverseStream API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ConverseStream.html) - Streaming event types
- [Mistral streaming limitation](https://repost.aws/questions/QU9LG7D9x9Sp-Rucl-AIeFVw/using-bedrock-with-mistral-2-large-converse-api-with-tools-would-not-let-me-use-streaming-feature) - Tool use + streaming compatibility
- [AWS Bedrock Converse Tool Use Examples](https://docs.aws.amazon.com/bedrock/latest/userguide/tool-use-examples.html) - Streaming + tools pattern

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip mulaw conversion, assume 16kHz PCM everywhere | Faster initial development | Twilio integration fails; must rewrite audio pipeline | Never (Twilio ONLY supports mulaw 8kHz) |
| Use non-streaming Bedrock API (Converse instead of ConverseStream) | Simpler code | Latency too high for real-time voice; users complain | Only for batch processing, never real-time |
| Hardcode us-east-1 region for all services | Works initially | Locks out latency-optimized regions; data residency violations | Only if you've verified region requirements |
| Copy OpenAI tool definitions without schema translation | Tests pass for basic chat | Tool calls fail in production | Never (different schemas) |
| Disable Transcribe partial result stabilization | Higher accuracy | Higher latency; conversation feels sluggish | Only if accuracy is more critical than speed (transcription product, not conversation) |
| Use Polly 24kHz output, downsample later | Better audio quality | Slower generation + conversion overhead = latency spike | Never for real-time (use 8kHz or 16kHz) |
| Test with file playback, not real Twilio calls | Faster test iteration | Misses mulaw issues, WebSocket timing, real network latency | Only in early development; must switch to Twilio before QA |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Twilio → Transcribe | Sending base64 mulaw directly | Decode base64 → mulaw→PCM → send PCM to Transcribe with correct media encoding header |
| Polly → Twilio | Sending MP3 audio | Request PCM 8kHz from Polly → convert to mulaw → base64 encode → send to Twilio |
| Bedrock tool definitions | Copy OpenAI `parameters` JSON | Rename to `input_schema`, ensure valid JSON Schema (additionalProperties: false recommended) |
| Bedrock tool responses | Parse `choices[0].message.tool_calls` | Parse `content` array, filter `type === "tool_use"`, extract `id`, `name`, `input` |
| Transcribe chunk size | Send as soon as audio arrives (variable chunks) | Buffer to 50-200ms chunks with correct byte alignment (even bytes for mono PCM) |
| Bedrock streaming | Read response as single JSON | Iterate over event stream, handle `contentBlockDelta` events progressively |
| IAM credentials | Hardcode access key in code | Use environment variables or AWS credential provider chain |
| Cross-region inference | Assume it's "just faster" | Understand data routing — may violate compliance requirements |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Synchronous mulaw↔PCM conversion blocking audio pipeline | Latency spikes, choppy audio | Use async/worker threads for codec conversion, pipeline audio chunks | 5+ concurrent calls |
| Single-region Bedrock without failover | Latency spikes during peak US hours (2pm ET) | Use cross-region inference profiles or implement retry with region fallback | Peak hours, 20+ req/min |
| Unbounded Transcribe partial results buffer | Memory grows indefinitely on long calls | Clear buffer on utterance end, limit max buffer size | Calls >5 minutes |
| Polly synthesis for long text blocks | First audio chunk delayed by 3-5s | Split text into sentences, stream incrementally | Responses >100 words |
| Bedrock prompt including full call history | Token count grows, latency increases | Summarize conversation after 10 turns, keep only recent context | Calls >10 turns |
| No caching for Polly common phrases | Repeated API calls for "How can I help you?" | Cache greeting/confirmation audio files, reuse | 50+ calls/day |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| IAM credentials in code or version control | Credential leak, AWS bill spike from abuse | Use environment variables, AWS credential provider chain, IAM roles for EC2/ECS |
| Using root AWS account credentials | Full account compromise if leaked | Create IAM user with minimum permissions (Transcribe, Bedrock, Polly only) |
| No CloudTrail logging for Bedrock | Can't audit PII/PHI sent to LLM | Enable CloudTrail, log all Bedrock requests for compliance audit trail |
| Cross-region inference with PII | Data crosses geographic boundaries, GDPR violation | Use regional endpoints only, disable cross-region if data residency required |
| Storing call recordings without encryption | HIPAA/PII violation | Enable encryption at rest (S3 with KMS), encrypt in transit (HTTPS/TLS) |
| No input validation before Bedrock | Prompt injection attacks | Validate user input, sanitize before adding to conversation context |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Waiting for full Transcribe "final" transcript before responding | 2-3s dead air, feels broken | Use partial results with stabilization, respond faster with caveat handling |
| Playing full bot response even if user interrupts | Frustrating, feels like IVR not AI | Implement barge-in: abort TTS immediately on STT speech detection |
| No feedback during long Bedrock latency spikes | User thinks call dropped, hangs up | Play hold music or "thinking" sound after 2s with no response |
| Bot repeats "I didn't catch that" on Transcribe empty results | Annoying, seems unintelligent | Distinguish silence from unclear speech, prompt differently |
| Verbose bot responses (100+ words) | User tunes out, misses key info | Keep responses to 1-2 sentences for phone conversations |
| No confirmation before booking | User unsure if appointment is confirmed | Always confirm with specific details: "Booked for Tuesday at 2pm. Does that work?" |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Transcribe Integration:** Verify actual mulaw→PCM conversion with Twilio audio (not just file playback) — empty transcripts indicate format mismatch
- [ ] **Polly Integration:** Verify PCM→mulaw conversion produces clear audio on real phone call — loud noise indicates format corruption
- [ ] **Tool Calling:** Test EVERY tool with forced invocation (`toolChoice: { tool: { name: "X" } }`) — basic chat masks tool definition errors
- [ ] **Interruption Handling:** Test barge-in during greeting, mid-sentence, during tool call, during confirmation — different code paths fail differently
- [ ] **Latency Under Load:** Measure end-to-end latency with 10+ concurrent calls during peak hours — single-call testing misses multi-tenancy spikes
- [ ] **Region Configuration:** Verify all services in same region, latency-optimized features available — region mismatches add 100-300ms
- [ ] **Error Recovery:** Test Transcribe disconnect, Bedrock timeout, Polly failure — each requires different retry logic
- [ ] **Long Calls:** Test calls >5 minutes — memory leaks, token limits, buffer overflows only appear on long calls
- [ ] **Conversation Edge Cases:** Test interruptions, corrections ("no, not 2pm, 3pm"), ambiguity — happy path testing misses conversation repair logic

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Audio format incompatibility | LOW | Add mulaw↔PCM conversion library (e.g., wavefile for Node.js), redeploy — no architecture change |
| Tool calling format mismatch | MEDIUM | Write translation layer, re-test all tools, update integration tests — 2-3 days |
| Latency too high | MEDIUM-HIGH | Enable streaming APIs, partial result stabilization, latency-optimized inference, prompt caching — requires configuration changes and testing |
| Wrong region | LOW | Update environment variables, redeploy — unless data already processed in wrong region (compliance issue) |
| Streaming API incompatibility | HIGH | Rewrite streaming logic, update interruption handling, re-test all conversation flows — 1 week |
| No interruption handling | MEDIUM | Add AbortController for Bedrock, TTS abort on STT speech detection, re-test — 3-5 days |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Audio format incompatibility | Phase 1: Audio Pipeline | Twilio call produces clear transcripts and audio playback |
| Tool calling format mismatch | Phase 2: LLM Tool Calling | Force each tool, verify booking/data collection works |
| Latency accumulation | Phase 3: Latency Optimization | End-to-end latency <2s on real calls, peak hour testing |
| Region availability | Phase 0: Infrastructure Setup | All services deployed, `aws sts get-caller-identity` succeeds |
| Streaming API differences | Phase 4: Interruption Handling | User can interrupt at any conversation stage cleanly |

---

## Sources

**AWS Official Documentation:**
- [AWS Transcribe Streaming](https://docs.aws.amazon.com/transcribe/latest/dg/streaming.html)
- [AWS Transcribe Partial Results](https://docs.aws.amazon.com/transcribe/latest/dg/streaming-partial-results.html)
- [AWS Bedrock Tool Use](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages-tool-use.html)
- [AWS Bedrock ToolChoice API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ToolChoice.html)
- [AWS Bedrock ConverseStream](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ConverseStream.html)
- [Amazon Polly SynthesizeSpeech](https://docs.aws.amazon.com/polly/latest/dg/API_SynthesizeSpeech.html)
- [Bedrock Models by Region](https://docs.aws.amazon.com/bedrock/latest/userguide/models-regions.html)
- [Bedrock Latency-Optimized Inference](https://docs.aws.amazon.com/bedrock/latest/userguide/latency-optimized-inference.html)
- [Bedrock Cross-Region Inference](https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html)

**AWS Blogs:**
- [Bedrock Latency Optimization Guide](https://aws.amazon.com/blogs/machine-learning/optimizing-ai-responsiveness-a-practical-guide-to-amazon-bedrock-latency-optimized-inference/)
- [Transcribe + Twilio Medical Example](https://aws.amazon.com/blogs/machine-learning/perform-medical-transcription-analysis-in-real-time-with-amazon-transcribe-medical-and-amazon-comprehend-medical-with-twilio-media-streams/)

**Community/GitHub:**
- [GitHub: Twilio + Transcribe mulaw issue](https://github.com/aws/aws-sdk-js-v3/discussions/4648)
- [GitHub: Bedrock Tool Calling Examples](https://github.com/aws-samples/function-calling-using-amazon-bedrock-anthropic-claude-3)
- [GitHub: AWS SDK IAM Region Error](https://github.com/aws/aws-sdk-java/issues/3108)

**Third-Party Analysis:**
- [Amazon Bedrock 2026 Review](https://www.truefoundry.com/blog/our-honest-review-of-amazon-bedrock-2026-edition)
- [Amazon Polly Latency Tips](https://play.ht/blog/amazon-text-to-speech-latency/)
- [Best TTS APIs 2026 Benchmarks](https://inworld.ai/resources/best-voice-ai-tts-apis-for-real-time-voice-agents-2026-benchmarks)
- [AWS Re:Post: Bedrock Tool Use + Streaming Limitation](https://repost.aws/questions/QU9LG7D9x9Sp-Rucl-AIeFVw/using-bedrock-with-mistral-2-large-converse-api-with-tools-would-not-let-me-use-streaming-feature)

---
*Pitfalls research for: AWS voice AI migration (OpenAI/Deepgram/ElevenLabs → Bedrock/Transcribe/Polly)*
*Researched: 2026-01-28*
