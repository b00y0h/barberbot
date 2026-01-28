# Technology Stack Research

**Project:** BarberBot AWS Migration
**Researched:** 2026-01-28
**Confidence:** HIGH

## Recommended Stack

### AWS Services (Core)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| AWS Bedrock (Claude) | Claude 3.5 Sonnet | LLM for conversation and function calling | Anthropic's Claude on AWS infrastructure. Use Converse API for consistent interface with built-in tool use support. More cost-effective than OpenAI when using AWS credits. |
| AWS Transcribe Streaming | Latest | Real-time speech-to-text | Native AWS streaming STT with WebSocket support. Requires PCM conversion from Twilio's mulaw but eliminates third-party dependencies. |
| AWS Polly | Latest | Text-to-speech synthesis | AWS-native TTS with neural voices. Outputs PCM at 8kHz compatible with telephony pipeline. Lower latency than ElevenLabs for real-time use. |

### AWS SDK v3 Packages (Node.js/TypeScript)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @aws-sdk/client-bedrock-runtime | ^3.966.0 | Bedrock API client for Claude inference | Primary package for LLM calls. Use ConverseCommand for function calling, ConverseStreamCommand for streaming responses. |
| @aws-sdk/client-transcribe-streaming | ^3.930.0 | Transcribe Streaming API client | Real-time STT. Use StartStreamTranscriptionCommand with async iterable audio stream. |
| @aws-sdk/client-polly | ^3.953.0 | Polly API client for TTS | Generate speech audio. Use SynthesizeSpeechCommand with PCM output at 8kHz sample rate. |

### Audio Processing Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| wavefile | ^11.0.0 | mulaw ↔ PCM conversion | Required for Twilio Media Streams. Use fromMuLaw() to decode incoming audio for Transcribe, toMuLaw() to encode Polly output for Twilio. |

### IAM and Credentials

| Tool | Purpose | Notes |
|------|---------|-------|
| AWS IAM | Credential management | Create IAM user/role with bedrock:InvokeModel, transcribe:StartStreamTranscription, polly:SynthesizeSpeech permissions. Use environment variables for credentials in Node.js. |
| AWS SDK Credential Provider | Automatic credential loading | SDK v3 automatically loads from environment variables, IAM roles, or credential files. No explicit configuration needed in most cases. |

## Installation

```bash
# AWS SDK v3 clients
npm install @aws-sdk/client-bedrock-runtime @aws-sdk/client-transcribe-streaming @aws-sdk/client-polly

# Audio format conversion
npm install wavefile

# Development (TypeScript types already included in SDK v3 packages)
# No additional dev dependencies needed
```

## Alternatives Considered

| Category | Recommended | Alternative | When to Use Alternative |
|----------|-------------|-------------|-------------------------|
| LLM API | Bedrock Converse API | Bedrock InvokeModel API | Use InvokeModel only if you need direct access to Anthropic's native message format or have existing code. Converse API is simpler and model-agnostic. |
| STT | Transcribe Streaming | Deepgram (existing) | Keep Deepgram if AWS migration is blocked or if native mulaw support is critical (avoids conversion overhead). Transcribe has broader AWS integration. |
| TTS | Polly | ElevenLabs (existing) | Keep ElevenLabs if voice quality/naturalness is the top priority. Polly neural voices are good but ElevenLabs may sound more natural for some use cases. |
| Audio conversion | wavefile | alawmulaw | Use alawmulaw for lower-level sample-by-sample encoding. wavefile is more full-featured with built-in WAV handling. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| AWS SDK v2 (`aws-sdk`) | Deprecated, monolithic package, no longer maintained | AWS SDK v3 modular clients (`@aws-sdk/client-*`) |
| Bedrock InvokeModel for function calling | More complex, model-specific format required | Bedrock Converse API with toolConfig parameter |
| Transcribe batch API | Not real-time, requires complete audio files | Transcribe Streaming with StartStreamTranscriptionCommand |
| Polly MP3 output for Twilio | Twilio Media Streams expect mulaw 8kHz, not MP3 | Polly PCM output at 8kHz, then convert to mulaw with wavefile |
| Direct mulaw to Transcribe | Transcribe doesn't support mulaw natively | Convert mulaw to PCM16 with wavefile.fromMuLaw() first |

## Stack Patterns by Use Case

**For real-time voice conversation (current BarberBot use case):**
- Use Bedrock **ConverseStreamCommand** for streaming LLM responses
- Use Transcribe **StartStreamTranscriptionCommand** with HTTP/2 streaming on Node.js
- Use Polly **SynthesizeSpeechCommand** with OutputFormat: "pcm", SampleRate: "8000"
- Convert Twilio mulaw → PCM16 for Transcribe input
- Convert Polly PCM → mulaw for Twilio output

**If migrating to AWS Lambda/serverless:**
- Same SDK packages work in Lambda
- Consider cold start times (Bedrock Converse is faster to initialize than InvokeModel)
- Use Lambda environment variables for AWS credentials (automatic via IAM role)

**If adding voice analysis/sentiment:**
- Add `@aws-sdk/client-comprehend` for sentiment analysis
- Process transcribed text before sending to Claude

## API Pattern Examples

### Bedrock Converse API with Function Calling

```typescript
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient({ region: "us-east-1" });

const command = new ConverseCommand({
  modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
  messages: [
    {
      role: "user",
      content: [{ text: "What's the weather in San Francisco?" }],
    },
  ],
  toolConfig: {
    tools: [
      {
        toolSpec: {
          name: "get_weather",
          description: "Get current weather for a location",
          inputSchema: {
            json: {
              type: "object",
              properties: {
                location: { type: "string", description: "City name" },
              },
              required: ["location"],
            },
          },
        },
      },
    ],
  },
});

const response = await client.send(command);

// Check if model wants to use tool
if (response.stopReason === "tool_use") {
  // Execute tool, send result back to model
  // (Iterative pattern until stopReason === "end_turn")
}
```

### Transcribe Streaming with Async Iterable

```typescript
import { TranscribeStreamingClient, StartStreamTranscriptionCommand } from "@aws-sdk/client-transcribe-streaming";
import { WaveFile } from "wavefile";

const client = new TranscribeStreamingClient({ region: "us-east-1" });

// Convert mulaw stream to PCM16 async iterable
async function* audioStreamGenerator(mulawStream) {
  for await (const chunk of mulawStream) {
    const wav = new WaveFile();
    wav.fromScratch(1, 8000, "8m", chunk); // 8-bit mulaw
    wav.fromMuLaw(); // Convert to PCM16
    yield { AudioEvent: { AudioChunk: wav.data.samples } };
  }
}

const command = new StartStreamTranscriptionCommand({
  LanguageCode: "en-US",
  MediaEncoding: "pcm",
  MediaSampleRateHertz: 8000,
  AudioStream: audioStreamGenerator(twilioMediaStream),
});

const response = await client.send(command);

// Process transcription results
for await (const event of response.TranscriptResultStream) {
  if (event.TranscriptEvent) {
    const results = event.TranscriptEvent.Transcript.Results;
    // Handle transcribed text
  }
}
```

### Polly TTS with PCM Output

```typescript
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { WaveFile } from "wavefile";

const client = new PollyClient({ region: "us-east-1" });

const command = new SynthesizeSpeechCommand({
  Text: "Hello, this is your barber assistant.",
  VoiceId: "Joanna", // Neural voice
  OutputFormat: "pcm",
  SampleRate: "8000",
  Engine: "neural",
});

const response = await client.send(command);

// Convert PCM to mulaw for Twilio
const pcmBuffer = await response.AudioStream.transformToByteArray();
const wav = new WaveFile();
wav.fromScratch(1, 8000, "16", pcmBuffer); // PCM16
wav.toMuLaw(); // Convert to 8-bit mulaw
const mulawBuffer = wav.data.samples;

// Send mulawBuffer to Twilio Media Stream
```

## Audio Format Compatibility Notes

### Twilio Media Streams Format
- **Encoding:** mulaw (μ-law)
- **Sample Rate:** 8 kHz
- **Channels:** 1 (mono)
- **Bit Depth:** 8-bit

### AWS Transcribe Streaming Requirements
- **Supported Formats:** PCM (signed 16-bit little-endian), FLAC, Ogg Opus
- **NOT Supported:** mulaw (requires conversion)
- **Recommended Sample Rate:** 8 kHz or 16 kHz (16 kHz for best quality)
- **For Twilio:** Use 8 kHz to match source, convert mulaw → PCM16

### AWS Polly Output Options
- **Formats:** mp3, ogg_vorbis, pcm
- **PCM Sample Rates:** 8000 Hz or 16000 Hz (default 16000)
- **For Twilio:** Use pcm at 8000 Hz, then convert to mulaw

### Conversion Pipeline
```
Twilio → mulaw 8kHz → wavefile.fromMuLaw() → PCM16 8kHz → Transcribe
Claude → text response → Polly (PCM 8kHz) → wavefile.toMuLaw() → mulaw 8kHz → Twilio
```

## Version Compatibility

| Package | Version | Compatible With | Notes |
|---------|---------|-----------------|-------|
| @aws-sdk/client-bedrock-runtime@^3.966.0 | Node.js 18+ (20+ recommended) | AWS SDK v3 ecosystem | SDK v3 drops Node 18 support in January 2026. Use Node 20 LTS. |
| @aws-sdk/client-transcribe-streaming@^3.930.0 | Node.js 18+ (20+ recommended) | Uses HTTP/2 on Node.js, WebSocket on browsers | Async iterable support requires Node 10+ (already met). |
| @aws-sdk/client-polly@^3.953.0 | Node.js 18+ (20+ recommended) | All AWS SDK v3 packages share version alignment | Neural voices require Engine: "neural" parameter. |
| wavefile@^11.0.0 | Node.js 12+ | TypeScript-friendly (has type definitions) | Pure JavaScript, no native dependencies. |

**CRITICAL:** AWS SDK for JavaScript v3 will no longer support Node.js 18 starting January 2026. The current project should use Node.js 20 LTS to ensure compatibility. All AWS SDK v3 packages are aligned to the same major version and updated together.

## Sources

### Official AWS Documentation (HIGH Confidence)
- [AWS SDK v3 Bedrock Runtime Client](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/bedrock-runtime/) — Official API reference
- [AWS SDK v3 Transcribe Streaming Client](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/transcribe-streaming/) — Official API reference
- [AWS SDK v3 Polly Client](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/polly/) — Official API reference
- [Amazon Bedrock Converse API](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference-call.html) — Using Converse for multi-turn conversations
- [Amazon Bedrock Tool Use](https://docs.aws.amazon.com/bedrock/latest/userguide/tool-use.html) — Function calling with Converse API
- [Amazon Transcribe Streaming](https://docs.aws.amazon.com/transcribe/latest/dg/streaming.html) — Audio format requirements and streaming patterns
- [Amazon Polly SynthesizeSpeech API](https://docs.aws.amazon.com/polly/latest/dg/API_SynthesizeSpeech.html) — Output formats and sample rates

### npm Package Registry (HIGH Confidence)
- [@aws-sdk/client-bedrock-runtime@3.966.0](https://www.npmjs.com/package/@aws-sdk/client-bedrock-runtime) — Latest version verified 2026-01-28
- [@aws-sdk/client-transcribe-streaming@3.930.0](https://www.npmjs.com/package/@aws-sdk/client-transcribe-streaming) — Latest version verified 2026-01-28
- [@aws-sdk/client-polly@3.953.0](https://www.npmjs.com/package/@aws-sdk/client-polly) — Latest version verified 2026-01-28
- [wavefile npm package](https://www.npmjs.com/package/wavefile) — mulaw/PCM conversion library

### Community Resources (MEDIUM Confidence, verified with official docs)
- [AWS Bedrock Workshop - Invoke vs Converse](https://deepwiki.com/aws-samples/amazon-bedrock-workshop/2.1-bedrock-apis:-invoke-vs-converse) — Comparison of API patterns
- [Medium: Bedrock Converse API vs InvokeModel](https://medium.com/@rushenssamodya/bedrock-converse-api-vs-invokemodel-the-tale-of-two-apis-and-why-your-choice-actually-matters-d98b9bccabc0) — When to use each API
- [AWS Blog: Integrating Amazon Polly with legacy IVR systems](https://aws.amazon.com/blogs/machine-learning/integrating-amazon-polly-with-legacy-ivr-systems-by-converting-output-to-wav-format/) — PCM to WAV conversion patterns
- [GitHub Discussion: Transcribing Twilio Media Stream](https://github.com/aws/aws-sdk-js-v3/discussions/4648) — mulaw to PCM conversion for Transcribe

---
*Stack research for: AWS Migration (Bedrock/Transcribe/Polly)*
*Researched: 2026-01-28*
*Confidence: HIGH (verified with official AWS documentation and npm registry)*
