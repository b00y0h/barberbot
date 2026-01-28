# Architecture Research: AWS Service Integration

**Domain:** Voice AI telephony migration (OpenAI/Deepgram/ElevenLabs → AWS Bedrock/Transcribe/Polly)
**Researched:** 2026-01-28
**Confidence:** HIGH

## Current Architecture Overview

### System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Twilio Layer                             │
│  ┌──────────────┐     WebSocket      ┌──────────────┐           │
│  │ HTTP POST    │ ← /voice/incoming  │ Media Stream │           │
│  │ /voice/      │ → TwiML response   │ /voice/stream│           │
│  └──────────────┘                    └──────┬───────┘           │
└─────────────────────────────────────────────┼───────────────────┘
                                              │ mulaw 8kHz base64
                                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      Audio Pipeline Layer                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ handleMediaStream (WebSocket handler)                    │   │
│  │  • Receives: base64 mulaw chunks from Twilio            │   │
│  │  • Sends: base64 mulaw chunks to Twilio                 │   │
│  │  • Manages: start/stop/media/mark events                │   │
│  └────────┬─────────────────────────────────────────────────┘   │
└───────────┼─────────────────────────────────────────────────────┘
            │
            ↓
┌─────────────────────────────────────────────────────────────────┐
│                      Call Manager Layer                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Call Orchestration (per-call state)                      │   │
│  │  • initializeCall() → create services                    │   │
│  │  • sendGreeting() → initial TTS                          │   │
│  │  • handleUserUtterance() → STT → LLM → TTS cycle        │   │
│  │  • endCall() → cleanup, save transcript/summary         │   │
│  └────┬─────────┬─────────┬────────────────────────────────┘   │
└────────┼─────────┼─────────┼────────────────────────────────────┘
         │         │         │
         ↓         ↓         ↓
┌────────────┐ ┌──────────┐ ┌──────────┐
│ STT Service│ │ LLM Conv.│ │TTS Service│
│ (Deepgram) │ │ (OpenAI) │ │(11Labs)   │
│            │ │          │ │           │
│EventEmitter│ │Tool calls│ │EventEmit. │
│WebSocket   │ │Messages  │ │REST+chunk │
└────────────┘ └──────────┘ └──────────┘
```

### Component Responsibilities

| Component | Responsibility | Current Implementation |
|-----------|----------------|------------------------|
| **audio-pipeline.ts** | WebSocket lifecycle, Twilio event handling | Decodes base64 mulaw, routes to CallManager |
| **call-manager.ts** | Per-call orchestration, service coordination | Creates STT/TTS/Conversation per call, manages utterance flow |
| **stt.ts** | Speech-to-text streaming | DeepgramSTT class (EventEmitter), WebSocket connection, emits 'transcript' events |
| **tts.ts** | Text-to-speech streaming | TTSService class (EventEmitter), REST streaming, emits 'audio' chunks as mulaw |
| **conversation.ts** | LLM conversation management | OpenAI API with tool calling, maintains message history |

## AWS Service Integration Points

### 1. AWS Transcribe Streaming (replaces Deepgram STT)

**Connection Pattern:**
- Uses `@aws-sdk/client-transcribe-streaming` package
- Node.js uses **HTTP/2** (not WebSocket) via `StartStreamTranscription` command
- Requires **async generator** pattern to stream audio chunks

**Audio Format Change:**
```
Current:  mulaw 8kHz → Deepgram (accepts mulaw directly)
AWS:      mulaw 8kHz → PCM 16-bit 8kHz → Transcribe
```

**Critical: Transcribe ONLY accepts PCM**
- Must convert mulaw → PCM before sending
- Use `wavefile` library: `wav.fromMuLaw()` converts 8-bit mulaw to 16-bit PCM
- PCM chunks must be even number of bytes (2 bytes per sample)

**Event-Based Response:**
```typescript
// Transcribe returns async iterable of TranscriptResultStream events
for await (const event of response.TranscriptResultStream) {
  if (event.TranscriptEvent) {
    const results = event.TranscriptEvent.Transcript.Results;
    for (const result of results) {
      if (result.Alternatives && result.Alternatives.length > 0) {
        const transcript = result.Alternatives[0].Transcript;
        const isFinal = !result.IsPartial;
        // emit('transcript', transcript, isFinal)
      }
    }
  }
}
```

**Integration File: `src/services/stt.ts`**
- **Replace:** DeepgramSTT class with AWSTranscribeSTT class
- **Keep:** EventEmitter interface (emit 'transcript', 'utterance_end', 'error', 'close')
- **Add:** mulaw → PCM conversion in `sendAudio()` method
- **Change:** Connection from WebSocket to HTTP/2 streaming command
- **Change:** Event parsing from Deepgram format to Transcribe TranscriptEvent format

### 2. AWS Bedrock Converse API (replaces OpenAI)

**Connection Pattern:**
- Uses `@aws-sdk/client-bedrock-runtime` package
- `ConverseCommand` for single request/response
- `ConverseStreamCommand` for streaming responses (recommended for real-time)

**Tool Calling Workflow:**
```
1. Send message with toolConfig containing tool definitions
2. Model responds with stopReason: 'tool_use' + toolUse block
3. Extract tool name/input, execute tool locally
4. Send follow-up message with toolResult block
5. Model generates final response
```

**Tool Definition Structure:**
```typescript
toolConfig: {
  tools: [
    {
      toolSpec: {
        name: 'book_appointment',
        description: 'Book an appointment for the customer',
        inputSchema: {
          json: {
            type: 'object',
            properties: {
              service: { type: 'string' },
              date: { type: 'string' },
              time: { type: 'string' }
            },
            required: ['service', 'date', 'time']
          }
        }
      }
    }
  ]
}
```

**Message Format Difference:**
```
OpenAI:     { role: 'user', content: 'text' }
            { role: 'assistant', content: 'text', tool_calls: [...] }
            { role: 'tool', tool_call_id: '...', content: '...' }

Bedrock:    { role: 'user', content: [{ text: 'text' }] }
            { role: 'assistant', content: [{ toolUse: {...} }] }
            { role: 'user', content: [{ toolResult: {...} }] }
```

**Integration File: `src/services/conversation.ts`**
- **Replace:** OpenAI client with BedrockRuntimeClient
- **Change:** Message format from OpenAI schema to Bedrock schema
- **Change:** Tool definition format (OpenAI ChatCompletionTool → Bedrock toolSpec)
- **Change:** Tool calling response parsing (tool_calls array → content blocks with toolUse)
- **Change:** Tool result format (role: 'tool' → role: 'user' with toolResult content)
- **Keep:** Tool handler logic (handleToolCall function unchanged)
- **Keep:** ConversationState interface (adapt internal message storage)
- **Add:** Model ID configuration (e.g., 'anthropic.claude-3-5-sonnet-20241022-v2:0')

### 3. AWS Polly (replaces ElevenLabs/Deepgram TTS)

**Connection Pattern:**
- Uses `@aws-sdk/client-polly` package
- `SynthesizeSpeechCommand` returns streaming response
- Response body is ReadableStream of audio bytes

**Audio Format Change:**
```
Current:  ElevenLabs → PCM 24kHz → resample to 8kHz → convert to mulaw
          Deepgram → mulaw 8kHz directly

AWS:      Polly → PCM 8kHz → convert to mulaw
```

**Polly Output Configuration:**
```typescript
{
  OutputFormat: 'pcm',           // Polly outputs signed 16-bit PCM
  SampleRate: '8000',            // Match Twilio (8kHz)
  VoiceId: 'Joanna',             // Neural voice
  Engine: 'neural',              // Better quality than 'standard'
  Text: text,
  TextType: 'text'               // or 'ssml'
}
```

**Streaming Pattern:**
```typescript
const response = await polly.send(new SynthesizeSpeechCommand(params));
const stream = response.AudioStream;

// AudioStream is a ReadableStream
for await (const chunk of stream) {
  const pcmBuffer = Buffer.from(chunk);
  const mulawBuffer = pcmToMulaw(pcmBuffer);
  emit('audio', mulawBuffer);
}
```

**Integration File: `src/services/tts.ts`**
- **Replace:** ElevenLabs/Deepgram API calls with Polly SynthesizeSpeechCommand
- **Remove:** PCM resampling logic (24kHz→8kHz no longer needed, Polly outputs 8kHz directly)
- **Keep:** PCM to mulaw conversion function (pcmToMulaw)
- **Keep:** EventEmitter interface (emit 'audio', 'done', 'error')
- **Change:** Streaming from fetch ReadableStream to AWS SDK response.AudioStream
- **Simplify:** No fallback logic needed (single provider)
- **Keep:** interrupt() via AbortController pattern

## Data Flow Changes

### Current Audio Pipeline (Deepgram STT)
```
Twilio → mulaw base64 → decode → mulaw Buffer → Deepgram WebSocket
                                                      ↓
                                              transcript events
```

### AWS Audio Pipeline (Transcribe)
```
Twilio → mulaw base64 → decode → mulaw Buffer → PCM conversion → async generator
                                                                        ↓
                                                            Transcribe HTTP/2
                                                                        ↓
                                                              transcript events
```

### Current Audio Pipeline (TTS)
```
Text → ElevenLabs REST → PCM 24kHz stream → resample 8kHz → mulaw → base64 → Twilio
  OR
Text → Deepgram REST → mulaw 8kHz stream → base64 → Twilio
```

### AWS Audio Pipeline (Polly)
```
Text → Polly command → PCM 8kHz stream → mulaw → base64 → Twilio
```

## Component Boundaries

### Files That Change

| File | Change Type | Details |
|------|-------------|---------|
| `src/services/stt.ts` | **Replace implementation** | New class AWSTranscribeSTT, keep EventEmitter interface |
| `src/services/tts.ts` | **Replace implementation** | New Polly integration, simplified audio pipeline |
| `src/services/conversation.ts` | **Major refactor** | Message format conversion, tool calling adaptation |
| `src/config/env.ts` | **Add fields** | AWS credentials, region, model IDs |
| `package.json` | **Replace dependencies** | Remove @deepgram/sdk, openai, add AWS SDK packages |

### Files That Stay the Same

| File | Why Unchanged |
|------|---------------|
| `src/services/audio-pipeline.ts` | WebSocket handler, mulaw decode/encode unchanged |
| `src/services/call-manager.ts` | Orchestration logic unchanged, calls same EventEmitter APIs |
| `src/services/customers.ts` | Database operations unaffected |
| `src/database/` | Schema unchanged |
| `src/routes/voice.ts` | Twilio webhook handling unchanged |

### Interface Contracts (Must Preserve)

**STT Service Interface:**
```typescript
class STTService extends EventEmitter {
  async start(): Promise<void>
  sendAudio(audioData: Buffer): void
  stop(): void

  // Events emitted:
  on('transcript', (text: string, isFinal: boolean) => void)
  on('utterance_end', () => void)
  on('error', (err: Error) => void)
  on('close', () => void)
}
```

**TTS Service Interface:**
```typescript
class TTSService extends EventEmitter {
  async synthesize(text: string): Promise<void>
  interrupt(): void

  // Events emitted:
  on('audio', (mulawChunk: Buffer) => void)
  on('done', () => void)
  on('error', (err: Error) => void)
}
```

**Conversation Service Interface:**
```typescript
// Functions that call-manager uses:
createConversation(callerPhone: string): ConversationState
getGreeting(state: ConversationState): Promise<string>
processUserMessage(state: ConversationState, text: string, phone: string): Promise<string>
generateCallSummary(state: ConversationState): Promise<string>
getTranscript(state: ConversationState): string
```

## Architectural Patterns

### Pattern 1: Service Abstraction via EventEmitter

**What:** STT and TTS services use EventEmitter to decouple streaming I/O from orchestration
**When to use:** When async streaming services need to notify caller of events
**Trade-offs:**
- ✅ Pro: CallManager doesn't know about provider details
- ✅ Pro: Easy to test with mock event emitters
- ❌ Con: Error handling can be tricky (events vs exceptions)

**Example:**
```typescript
// CallManager doesn't care if it's Deepgram or AWS Transcribe
stt.on('transcript', (text: string, isFinal: boolean) => {
  if (isFinal) {
    utteranceBuffer += text;
  }
});
```

### Pattern 2: Per-Call State Management

**What:** Each call gets isolated STT, TTS, and Conversation instances
**When to use:** Concurrent call handling where state must not be shared
**Trade-offs:**
- ✅ Pro: No cross-call contamination
- ✅ Pro: Independent cleanup per call
- ❌ Con: Higher memory usage (one set of services per call)

**Example:**
```typescript
async function initializeCall(callSid: string) {
  const stt = new DeepgramSTT();  // New instance per call
  const tts = new TTSService();
  const conversation = createConversation(phoneNumber);

  const call: ActiveCall = { stt, tts, conversation, ... };
  activeCalls.set(callSid, call);
}
```

### Pattern 3: Audio Format Conversion at Boundaries

**What:** Convert audio formats at service boundaries (mulaw ↔ PCM)
**When to use:** When external APIs require different formats than Twilio's mulaw
**Trade-offs:**
- ✅ Pro: Services work with native formats
- ❌ Con: CPU overhead for conversion
- ❌ Con: Must ensure correct sample rates and bit depths

**AWS Implementation:**
```typescript
// STT: mulaw → PCM conversion before sending to Transcribe
sendAudio(mulawData: Buffer): void {
  const wav = new WaveFile();
  wav.fromScratch(1, 8000, '8m', mulawData); // 1 channel, 8kHz, 8-bit mulaw
  wav.fromMuLaw();  // Converts to 16-bit PCM
  const pcmBuffer = Buffer.from(wav.data.samples);
  // Send pcmBuffer to Transcribe
}

// TTS: PCM → mulaw conversion after receiving from Polly
for await (const chunk of pollyStream) {
  const pcmBuffer = Buffer.from(chunk);
  const mulawBuffer = pcmToMulaw(pcmBuffer);
  emit('audio', mulawBuffer);
}
```

## Anti-Patterns

### Anti-Pattern 1: Mixing Message Formats

**What people do:** Try to keep OpenAI message format and convert on-the-fly to Bedrock
**Why it's wrong:** Creates impedance mismatch, especially with tool calling where structures differ significantly
**Do this instead:** Store messages in Bedrock format from the start, adapt ConversationState.messages structure

### Anti-Pattern 2: Blocking on Streaming APIs

**What people do:** Use `.then()` or `await` without handling stream events
**Why it's wrong:** Transcribe and Polly return streams; blocking loses real-time benefits
**Do this instead:** Use `for await...of` loops for async iterables, emit events as chunks arrive

### Anti-Pattern 3: Skipping Audio Format Validation

**What people do:** Send mulaw directly to Transcribe, assuming it accepts all formats
**Why it's wrong:** Transcribe only accepts PCM, will fail silently or produce garbage transcripts
**Do this instead:** Validate format conversion with test audio, verify PCM byte alignment (even number of bytes)

### Anti-Pattern 4: Reusing Long-Lived AWS Clients Incorrectly

**What people do:** Create one global Transcribe client and try to reuse the same stream connection for multiple calls
**Why it's wrong:** Transcribe streams are one-shot connections tied to a single transcription session
**Do this instead:** Create new stream command per call, share only the client instance (not the stream)

## AWS SDK Dependencies

### Required Packages

```bash
npm install @aws-sdk/client-transcribe-streaming
npm install @aws-sdk/client-bedrock-runtime
npm install @aws-sdk/client-polly
npm install wavefile  # For mulaw ↔ PCM conversion
```

### Remove Packages

```bash
npm uninstall @deepgram/sdk
npm uninstall openai
# Keep elevenlabs as optional fallback or remove entirely
```

### AWS Client Setup

```typescript
// src/config/aws.ts
import { TranscribeStreamingClient } from '@aws-sdk/client-transcribe-streaming';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { PollyClient } from '@aws-sdk/client-polly';

const region = process.env.AWS_REGION || 'us-east-1';

export const transcribeClient = new TranscribeStreamingClient({ region });
export const bedrockClient = new BedrockRuntimeClient({ region });
export const pollyClient = new PollyClient({ region });
```

**Credentials:** AWS SDK automatically uses environment variables:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- Or IAM role if running on EC2/ECS/Lambda

## Suggested Build Order

### Phase 1: TTS Migration (Lowest Risk)
**Why first:** Independent of other services, straightforward streaming
**Files:** `src/services/tts.ts`
**Test:** Generate audio, verify mulaw output quality

### Phase 2: STT Migration (Medium Risk)
**Why second:** EventEmitter interface similar, audio conversion well-documented
**Files:** `src/services/stt.ts`
**Dependencies:** Mulaw→PCM conversion library
**Test:** Stream test audio, verify transcript accuracy

### Phase 3: LLM Migration (Highest Risk)
**Why last:** Message format transformation complex, tool calling workflow different
**Files:** `src/services/conversation.ts`, `src/config/env.ts`
**Dependencies:** Phase 1 & 2 complete (for end-to-end testing)
**Test:** Tool calling with real appointment booking, multi-turn conversations

### Recommended Testing Strategy

1. **Unit test:** Each service in isolation with mock audio/text
2. **Integration test:** Call flow with test WebSocket connection
3. **Production test:** Single inbound call, verify transcript/summary

## Scaling Considerations

| Concern | Current (10-50 calls/day) | AWS Migration Impact |
|---------|---------------------------|----------------------|
| **API costs** | ~$0.02/min (Deepgram + OpenAI + ElevenLabs) | ~$0.01/min (Transcribe + Bedrock + Polly) - 50% savings |
| **Latency** | 200-400ms STT, 800ms LLM, 300ms TTS | Similar latencies, Bedrock may be faster for streaming |
| **Concurrent calls** | Limited by WebSocket connections (Deepgram) | Better with HTTP/2 multiplexing (Transcribe) |
| **AWS region** | Single region deployment | Can use regional endpoints for lower latency |

**Scaling Recommendations:**
- Use AWS CloudWatch for monitoring Transcribe/Bedrock/Polly usage
- Set up AWS request throttling alerts (avoid quota limits)
- Consider AWS Lambda for serverless call handling if traffic spikes

## Sources

**AWS Transcribe Streaming:**
- [Amazon Transcribe Streaming with WebSockets](https://aws.amazon.com/blogs/aws/amazon-transcribe-streaming-now-supports-websockets/)
- [AWS SDK client-transcribe-streaming](https://www.npmjs.com/package/@aws-sdk/client-transcribe-streaming)
- [Transcribe streaming documentation](https://docs.aws.amazon.com/transcribe/latest/dg/streaming.html)
- [Issue: Transcribing Twilio Media Stream with AWS SDK](https://github.com/aws/aws-sdk-js-v3/discussions/4648)

**AWS Polly:**
- [Amazon Polly SynthesizeSpeech API](https://docs.aws.amazon.com/polly/latest/dg/API_SynthesizeSpeech.html)
- [AWS SDK client-polly](https://www.npmjs.com/package/@aws-sdk/client-polly)
- [Polly examples - AWS SDK for JavaScript](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/polly-examples.html)

**AWS Bedrock Converse API:**
- [Using the Converse API](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference-call.html)
- [ConverseStream API Reference](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ConverseStream.html)
- [Call a tool with the Converse API](https://docs.aws.amazon.com/bedrock/latest/userguide/tool-use-inference-call.html)
- [GitHub: stream-ai-assistant-using-bedrock-converse-with-tools](https://github.com/aws-samples/stream-ai-assistant-using-bedrock-converse-with-tools)

**Audio Format Conversion:**
- [Data input and output - Amazon Transcribe](https://docs.aws.amazon.com/transcribe/latest/dg/how-input.html)
- [Deepgram: Calling Your Video Game With Your Phone (mulaw conversion)](https://deepgram.com/learn/calling-your-video-game-with-your-phone-part-2)

---
*Architecture research for: BarberBot AWS Migration*
*Researched: 2026-01-28*
