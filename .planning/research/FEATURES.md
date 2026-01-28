# Feature Research: AWS Migration for Voice AI

**Domain:** Voice AI telephony migration (OpenAI/Deepgram/ElevenLabs → AWS Bedrock/Transcribe/Polly)
**Researched:** 2026-01-28
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Existing Features That AWS Must Support)

Features already implemented with current providers. AWS services must match or provide workarounds.

| Feature | Why Expected | Complexity | AWS Support Status |
|---------|--------------|------------|-------------------|
| **Tool calling / Function calling** | LLM must trigger appointment booking, customer info collection, availability checks | MEDIUM | ✅ **Supported** - Bedrock Converse API with `toolSpec` format (different schema from OpenAI) |
| **Real-time streaming STT** | Voice conversation requires immediate transcription as caller speaks | HIGH | ✅ **Supported** - Transcribe Streaming via WebSocket or HTTP/2 |
| **Real-time streaming TTS** | Bot must respond with natural timing, not wait for full synthesis | MEDIUM | ✅ **Supported** - Polly `SynthesizeSpeechCommand` returns AudioStream |
| **Partial transcripts (interim results)** | Show transcripts as user speaks, before utterance completes | LOW | ✅ **Supported** - Transcribe Streaming `IsPartial` field in results |
| **Utterance end detection** | Detect when user stops speaking to send complete message to LLM | MEDIUM | ⚠️ **Different** - Transcribe uses partial results stabilization instead of explicit utterance_end event |
| **Audio format: mulaw 8kHz** | Twilio Media Streams sends/receives mulaw 8kHz only | HIGH | ❌ **Not native** - Requires conversion (Transcribe: mulaw→PCM; Polly: PCM→mulaw) |
| **Barge-in / Interruption handling** | User can interrupt bot mid-sentence, stop TTS immediately | MEDIUM | ✅ **Application-level** - Same pattern works (AbortController for streaming) |
| **Message history management** | Multi-turn conversation with context | LOW | ✅ **Supported** - Converse API accepts message array like OpenAI |
| **Streaming response generation** | LLM streams tokens as generated for lower latency | MEDIUM | ✅ **Supported** - ConverseStream API for token-by-token streaming |

### Gaps (Features AWS Handles Differently or Requires Extra Work)

Current features that have different implementations or limitations on AWS.

| Feature | Current Implementation | AWS Difference | Workaround / Migration Path |
|---------|----------------------|----------------|---------------------------|
| **Tool definition format** | OpenAI `function` with JSON Schema parameters | Bedrock `toolSpec` with different schema structure | Convert tool definitions from OpenAI format to Bedrock `toolSpec` format in `toolConfig` |
| **Audio encoding for STT** | Deepgram accepts mulaw directly at 8kHz | Transcribe requires PCM (signed 16-bit) - mulaw not listed in supported formats | Decode mulaw→PCM before sending to Transcribe (codec library needed) |
| **Audio encoding for TTS** | Custom pcmToMulaw() function converts Linear16→mulaw | Polly outputs PCM/MP3/OGG but not mulaw | Keep existing pcmToMulaw() conversion, use Polly PCM output as input |
| **Utterance end detection** | Deepgram emits explicit `UtteranceEnd` event with `utterance_end_ms: 1000` config | Transcribe uses partial results stabilization - no explicit utterance end event | Use `IsPartial: false` transition or timeout-based detection for complete utterances |
| **TTS fallback chain** | ElevenLabs primary → Deepgram fallback | AWS-only stack (no fallback to external providers) | Remove fallback logic, rely on Polly alone (simpler but less resilient) |
| **VAD events** | Deepgram provides `vad_events: true` for voice activity detection | Transcribe doesn't explicitly advertise VAD events in WebSocket API | May be implicit in partial results; needs testing |
| **Sample rate conversion** | 24kHz TTS output → 8kHz for Twilio | Polly default: 16kHz (PCM), 24kHz (neural voices) | Use existing resamplePCM() function, configure Polly for 8kHz or 16kHz PCM output |

### Bonuses (New AWS Features Not Currently Used)

Features available in AWS services that current stack doesn't provide.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Partial results stabilization** | Words marked as stable won't change in future partial results | LOW | Improves transcript reliability for real-time display |
| **Automatic language identification** | Detect caller's language automatically | MEDIUM | Requires language code list in Transcribe config |
| **Neural TTS voices** | Higher quality, more natural-sounding speech | LOW | Polly neural voices default to 24kHz, need resampling to 8kHz |
| **Long-form TTS** | Synthesize longer text passages (up to 200K chars with async API) | LOW | Current use case is short utterances, not needed for real-time conversation |
| **Custom vocabularies** | Improve Transcribe accuracy for domain-specific terms (barbershop jargon, staff names) | MEDIUM | Enhance recognition of service names, staff names |
| **Call Analytics** | Sentiment analysis, participant role detection | MEDIUM | Could add sentiment tracking to conversation insights |
| **Multi-model support** | Single Converse API works across multiple LLM providers on Bedrock | LOW | Future flexibility to switch between Claude, Llama, etc. |
| **Tool choice forcing** | Force Claude to use specific tool (useful for testing) | LOW | `toolChoice` field in Bedrock request |
| **1M token context window** | Claude Sonnet 4.5 supports 1M tokens on Bedrock (beta) | LOW | Far exceeds voice conversation needs, but available |

## Feature Dependencies

```
[Tool Calling Support]
    ├──requires──> [Bedrock Converse API]
    └──requires──> [Tool Definition Schema Conversion]

[Real-time Voice Conversation]
    ├──requires──> [Transcribe WebSocket Streaming]
    ├──requires──> [Polly AudioStream]
    └──requires──> [Audio Format Conversion (mulaw↔PCM)]
            ├──requires──> [mulaw decoder for STT input]
            └──requires──> [mulaw encoder for TTS output (already exists)]

[Barge-in / Interruption]
    ├──requires──> [Utterance End Detection]
    │       └──requires──> [Transcribe Partial Results Monitoring]
    └──requires──> [TTS Streaming Abort (AbortController - already implemented)]

[Message History]
    └──requires──> [Converse API Message Format]

[Audio Pipeline]
    ├──requires──> [Sample Rate Conversion (already exists)]
    └──requires──> [Codec Conversion (mulaw↔PCM)]
```

### Dependency Notes

- **Audio format conversion is critical** - Twilio uses mulaw 8kHz, but neither Transcribe nor Polly natively support mulaw. Must convert inbound (mulaw→PCM for Transcribe) and outbound (PCM→mulaw for Polly output).
- **Tool definition migration is one-time** - Convert OpenAI function schema to Bedrock toolSpec schema once, then use consistently.
- **Utterance detection changes behavior** - Deepgram's explicit `utterance_end` event vs Transcribe's partial results stabilization may affect conversation timing. Needs testing to tune thresholds.
- **No external fallbacks** - Current stack has ElevenLabs→Deepgram fallback for TTS. AWS-only approach removes this safety net.

## Migration Phases

### Phase 1: Audio Format Compatibility (CRITICAL)
**Why first:** Nothing works without mulaw↔PCM conversion for Twilio compatibility.

- [ ] Add mulaw→PCM decoder for Transcribe input (Twilio Media Streams → Transcribe)
- [ ] Test existing PCM→mulaw encoder with Polly PCM output
- [ ] Verify sample rate handling (8kHz from Twilio, 8kHz or 16kHz from Polly)
- [ ] Validate audio quality with real phone calls

### Phase 2: STT Migration (Deepgram → Transcribe)
**Why second:** Needed for conversation input; simpler than LLM migration.

- [ ] Replace DeepgramSTT with TranscribeSTT class
- [ ] Implement WebSocket streaming with AWS SDK `@aws-sdk/client-transcribe-streaming`
- [ ] Map Deepgram events to Transcribe events (transcript, utterance_end → IsPartial transitions)
- [ ] Port configuration (language, interim results, endpointing thresholds)
- [ ] Test utterance detection timing vs Deepgram

### Phase 3: TTS Migration (ElevenLabs/Deepgram → Polly)
**Why third:** Output quality is visible but less critical than input transcription.

- [ ] Replace ElevenLabs/Deepgram TTS with Polly `SynthesizeSpeechCommand`
- [ ] Configure Polly for PCM output (8kHz or 16kHz)
- [ ] Stream AudioStream chunks through existing pcmToMulaw() and resamplePCM()
- [ ] Remove fallback provider logic (single provider)
- [ ] Test interruption/barge-in with Polly streams
- [ ] Compare voice quality (neural vs standard)

### Phase 4: LLM Migration (OpenAI → Bedrock Claude)
**Why fourth:** Most complex due to tool calling format differences.

- [ ] Convert tool definitions from OpenAI function format to Bedrock toolSpec format
- [ ] Replace OpenAI client with Bedrock Runtime client (`@aws-sdk/client-bedrock-runtime`)
- [ ] Implement ConverseCommand for non-streaming, ConverseStream for streaming
- [ ] Update message format handling (OpenAI vs Bedrock message structures)
- [ ] Port tool call execution logic to Bedrock's tool_use response format
- [ ] Test all tools (book_appointment, check_availability, collect_customer_info, get_business_info)
- [ ] Validate conversation quality vs GPT-4o

### Phase 5: Integration Testing
**Why last:** Full end-to-end validation after all services migrated.

- [ ] Full conversation flow testing (greeting → appointment booking → confirmation)
- [ ] Interruption handling across all AWS services
- [ ] Audio quality validation
- [ ] Latency measurement (compare to current stack)
- [ ] Error handling and edge cases
- [ ] Load testing with concurrent calls

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Phase |
|---------|------------|---------------------|----------|-------|
| Audio format conversion (mulaw↔PCM) | HIGH | HIGH | P1 | 1 |
| STT WebSocket streaming | HIGH | MEDIUM | P1 | 2 |
| TTS streaming synthesis | HIGH | MEDIUM | P1 | 3 |
| Tool calling with Bedrock | HIGH | HIGH | P1 | 4 |
| Message history | HIGH | LOW | P1 | 4 |
| Utterance end detection | HIGH | MEDIUM | P1 | 2 |
| Barge-in / Interruption | MEDIUM | LOW | P1 | 3 |
| Streaming LLM responses | MEDIUM | MEDIUM | P2 | 4 |
| Partial results stabilization | MEDIUM | LOW | P2 | 2 |
| Neural TTS voices | MEDIUM | LOW | P2 | 3 |
| Custom vocabularies | LOW | MEDIUM | P3 | Post-MVP |
| Call Analytics | LOW | MEDIUM | P3 | Post-MVP |
| Auto language detection | LOW | MEDIUM | P3 | Post-MVP |

**Priority key:**
- P1: Must have for AWS migration (feature parity with current stack)
- P2: Should have, improves quality
- P3: Nice to have, future enhancement

## AWS Service Feature Comparison

### Bedrock Claude vs OpenAI GPT-4o

| Feature | OpenAI GPT-4o | Bedrock Claude Sonnet 4.5 | Migration Impact |
|---------|---------------|--------------------------|------------------|
| **Function calling** | `function` type with JSON Schema | `toolSpec` with JSON Schema | Schema conversion required |
| **Streaming responses** | `stream: true` | ConverseStream API | API method change |
| **Message history** | `messages` array | `messages` array | Compatible structure |
| **Tool call format** | `tool_calls` in response | `stopReason: tool_use` + `content.toolUse` | Response parsing changes |
| **Context window** | 128K tokens (GPT-4o) | 200K standard, 1M beta (Claude Sonnet 4.5) | More capacity |
| **Latency** | ~300-800ms for tool calling | Similar (needs testing) | Comparable |

### Transcribe Streaming vs Deepgram

| Feature | Deepgram Nova-2 | AWS Transcribe Streaming | Migration Impact |
|---------|-----------------|--------------------------|------------------|
| **WebSocket support** | ✅ Native | ✅ Native | Compatible |
| **Mulaw encoding** | ✅ Direct support | ❌ PCM only | Requires decoder |
| **Sample rate** | 8kHz supported | 8kHz, 16kHz supported | Compatible with conversion |
| **Interim results** | `interim_results: true` | Partial results (IsPartial field) | Different event structure |
| **Utterance end** | Explicit `UtteranceEnd` event | Partial results stabilization | Detection logic changes |
| **VAD events** | `vad_events: true` | Not explicitly documented | May need alternative approach |
| **Endpointing** | `endpointing: 300` (ms) | Implicit in partial results | Timing tuning needed |
| **Smart formatting** | `smart_format: true` | Not documented | May lose auto-capitalization |

### Polly vs ElevenLabs/Deepgram TTS

| Feature | ElevenLabs + Deepgram | Amazon Polly | Migration Impact |
|---------|----------------------|--------------|------------------|
| **Streaming output** | ✅ Chunk-based | ✅ AudioStream | Compatible |
| **Output formats** | Linear16 PCM (both) | PCM, MP3, OGG | Compatible (use PCM) |
| **Mulaw output** | ❌ (convert manually) | ❌ (convert manually) | No change (keep conversion) |
| **Sample rates** | 24kHz (ElevenLabs), 16kHz (Deepgram) | 8kHz, 16kHz, 24kHz | More flexible |
| **Voice quality** | Very high (ElevenLabs) | High (neural), Standard | Quality needs comparison |
| **Latency** | ~200-400ms | Similar (needs testing) | Comparable |
| **Fallback chain** | ElevenLabs → Deepgram | Single provider | Simpler but less resilient |
| **Interruption** | AbortController | AbortController | Same pattern |

## Critical Technical Details

### Audio Format Conversion Requirements

**Inbound (Twilio → Transcribe):**
```
Twilio Media Streams → base64 mulaw 8kHz mono
     ↓ (decode base64)
Raw mulaw 8kHz mono buffer
     ↓ (mulaw→PCM decoder - NEW)
PCM 16-bit signed 8kHz mono
     ↓ (optional: resample to 16kHz if Transcribe prefers it)
Transcribe Streaming input
```

**Outbound (Polly → Twilio):**
```
Polly PCM output (8kHz or 16kHz configured)
     ↓ (resample 16kHz→8kHz if needed - existing resamplePCM())
PCM 16-bit signed 8kHz mono
     ↓ (existing pcmToMulaw())
mulaw 8kHz mono
     ↓ (encode base64)
Twilio Media Streams
```

### Tool Definition Conversion

**OpenAI format (current):**
```typescript
{
  type: 'function',
  function: {
    name: 'book_appointment',
    description: 'Book an appointment',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date (YYYY-MM-DD)' },
        time: { type: 'string', description: 'Time (e.g., "2:00 PM")' }
      },
      required: ['date', 'time']
    }
  }
}
```

**Bedrock format (target):**
```typescript
{
  toolSpec: {
    name: 'book_appointment',
    description: 'Book an appointment',
    inputSchema: {
      json: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date (YYYY-MM-DD)' },
          time: { type: 'string', description: 'Time (e.g., "2:00 PM")' }
        },
        required: ['date', 'time']
      }
    }
  }
}
```

**Key differences:**
- `function` → `toolSpec`
- `parameters` → `inputSchema.json`
- Tool array in `toolConfig` vs `tools` directly

### Utterance Detection Pattern Change

**Current (Deepgram):**
```typescript
stt.on('transcript', (text, isFinal) => {
  // Accumulate transcripts
});

stt.on('utterance_end', () => {
  // User stopped speaking, send to LLM
});
```

**Target (Transcribe):**
```typescript
// Monitor partial results transitions
transcribeStream.on('TranscriptEvent', (event) => {
  const result = event.Transcript.Results[0];
  if (result.IsPartial) {
    // Accumulate interim transcript
  } else {
    // Final result - user stopped speaking, send to LLM
  }
});

// OR use timeout-based detection after stable partial results
```

## Sources

**AWS Bedrock Claude:**
- [Tool use - Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages-tool-use.html)
- [Use a tool to complete an Amazon Bedrock model response](https://docs.aws.amazon.com/bedrock/latest/userguide/tool-use.html)
- [Call a tool with the Converse API](https://docs.aws.amazon.com/bedrock/latest/userguide/tool-use-inference-call.html)
- [Invoke Anthropic Claude on Bedrock with response stream](https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-runtime_example_bedrock-runtime_ConverseStream_AnthropicClaude_section.html)
- [Claude on Amazon Bedrock - Anthropic docs](https://platform.claude.com/docs/en/build-with-claude/claude-on-amazon-bedrock)

**AWS Transcribe Streaming:**
- [Transcribing streaming audio - Amazon Transcribe](https://docs.aws.amazon.com/transcribe/latest/dg/streaming.html)
- [Transcribe speech to text in real time using WebSocket](https://aws.amazon.com/blogs/machine-learning/transcribe-speech-to-text-in-real-time-using-amazon-transcribe-with-websocket/)
- [Streaming and partial results - Amazon Transcribe](https://docs.aws.amazon.com/transcribe/latest/dg/streaming-partial-results.html)
- [UtteranceEvent API reference](https://docs.aws.amazon.com/transcribe/latest/APIReference/API_streaming_UtteranceEvent.html)
- [Perform medical transcription with Twilio Media Streams](https://aws.amazon.com/blogs/machine-learning/perform-medical-transcription-analysis-in-real-time-with-amazon-transcribe-medical-and-amazon-comprehend-medical-with-twilio-media-streams/)

**Amazon Polly:**
- [SynthesizeSpeech API reference](https://docs.aws.amazon.com/polly/latest/dg/API_SynthesizeSpeech.html)
- [Amazon Polly Features](https://aws.amazon.com/polly/features/)
- [How Amazon Polly works](https://docs.aws.amazon.com/polly/latest/dg/how-text-to-speech-works.html)
- [Integrating Polly with legacy IVR systems](https://aws.amazon.com/blogs/machine-learning/integrating-amazon-polly-with-legacy-ivr-systems-by-converting-output-to-wav-format/)

**AWS SDK for Node.js:**
- [@aws-sdk/client-bedrock-runtime - npm](https://www.npmjs.com/package/@aws-sdk/client-bedrock-runtime)
- [@aws-sdk/client-transcribe-streaming - npm](https://www.npmjs.com/package/@aws-sdk/client-transcribe-streaming)
- [@aws-sdk/client-polly - npm](https://www.npmjs.com/package/@aws-sdk/client-polly)
- [Bedrock Runtime examples using SDK for JavaScript (v3)](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_bedrock-runtime_code_examples.html)

**Audio Format Conversion:**
- [Issue Transcribing Twilio Media Stream with AWS Transcribe](https://github.com/aws/aws-sdk-js-v3/discussions/4648)
- [Convert Amazon Polly Audio Output From PCM to WAV](https://jun711.github.io/aws/convert-aws-polly-synthesized-speech-from-pcm-to-wav-format/)

---
*Feature research for: AWS voice AI migration*
*Researched: 2026-01-28*
