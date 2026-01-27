import { env } from '../config/env';
import { EventEmitter } from 'events';

/**
 * Linear16 PCM → G.711 μ-law conversion
 * Input: 16-bit signed PCM samples
 * Output: 8-bit μ-law encoded samples
 */
function pcmToMulaw(pcmBuffer: Buffer): Buffer {
  const BIAS = 0x84;
  const CLIP = 32635;
  const mulaw = Buffer.alloc(pcmBuffer.length / 2);

  for (let i = 0; i < pcmBuffer.length; i += 2) {
    let sample = pcmBuffer.readInt16LE(i);

    const sign = (sample >> 8) & 0x80;
    if (sign !== 0) sample = -sample;
    if (sample > CLIP) sample = CLIP;
    sample = sample + BIAS;

    let exponent = 7;
    let mask = 0x4000;
    for (; exponent > 0; exponent--) {
      if ((sample & mask) !== 0) break;
      mask >>= 1;
    }

    const mantissa = (sample >> (exponent + 3)) & 0x0f;
    const mulawByte = ~(sign | (exponent << 4) | mantissa) & 0xff;
    mulaw[i / 2] = mulawByte;
  }

  return mulaw;
}

/**
 * Resample PCM audio from one sample rate to another (simple linear interpolation)
 */
function resamplePCM(input: Buffer, fromRate: number, toRate: number): Buffer {
  if (fromRate === toRate) return input;

  const ratio = fromRate / toRate;
  const inputSamples = input.length / 2;
  const outputSamples = Math.floor(inputSamples / ratio);
  const output = Buffer.alloc(outputSamples * 2);

  for (let i = 0; i < outputSamples; i++) {
    const srcPos = i * ratio;
    const srcIndex = Math.floor(srcPos);
    const frac = srcPos - srcIndex;

    const s0 = input.readInt16LE(Math.min(srcIndex, inputSamples - 1) * 2);
    const s1 = input.readInt16LE(Math.min(srcIndex + 1, inputSamples - 1) * 2);
    const sample = Math.round(s0 + (s1 - s0) * frac);
    output.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), i * 2);
  }

  return output;
}

export class TTSService extends EventEmitter {
  private abortController: AbortController | null = null;

  /**
   * Convert text to mulaw audio for Twilio.
   * Returns chunks via 'audio' event for streaming.
   */
  async synthesize(text: string): Promise<void> {
    this.abortController = new AbortController();

    try {
      if (env.elevenlabs.apiKey) {
        await this.synthesizeElevenLabs(text);
      } else if (env.deepgram.apiKey) {
        await this.synthesizeDeepgram(text);
      } else {
        throw new Error('No TTS provider configured');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('[TTS] Synthesis interrupted');
        return;
      }

      // Fallback to Deepgram if ElevenLabs fails
      if (env.deepgram.apiKey && env.elevenlabs.apiKey) {
        console.warn('[TTS] ElevenLabs failed, falling back to Deepgram:', err.message);
        try {
          await this.synthesizeDeepgram(text);
        } catch (fallbackErr) {
          console.error('[TTS] Deepgram fallback also failed:', fallbackErr);
          this.emit('error', fallbackErr);
        }
      } else {
        console.error('[TTS] Synthesis failed:', err);
        this.emit('error', err);
      }
    } finally {
      this.emit('done');
    }
  }

  private async synthesizeElevenLabs(text: string): Promise<void> {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${env.elevenlabs.voiceId}/stream`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': env.elevenlabs.apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
        output_format: 'pcm_24000',
      }),
      signal: this.abortController?.signal as any,
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('No response body from ElevenLabs');
    }

    const reader = response.body.getReader();
    let pcmBuffer = Buffer.alloc(0);
    const CHUNK_SIZE = 4800; // 100ms of 24kHz 16-bit mono

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      pcmBuffer = Buffer.concat([pcmBuffer, Buffer.from(value)]);

      while (pcmBuffer.length >= CHUNK_SIZE) {
        const chunk = pcmBuffer.subarray(0, CHUNK_SIZE);
        pcmBuffer = pcmBuffer.subarray(CHUNK_SIZE);

        // Resample 24kHz → 8kHz, then convert to mulaw
        const resampled = resamplePCM(chunk, 24000, 8000);
        const mulaw = pcmToMulaw(resampled);
        this.emit('audio', mulaw);
      }
    }

    // Process remaining samples
    if (pcmBuffer.length >= 2) {
      const resampled = resamplePCM(pcmBuffer, 24000, 8000);
      const mulaw = pcmToMulaw(resampled);
      this.emit('audio', mulaw);
    }
  }

  private async synthesizeDeepgram(text: string): Promise<void> {
    const url = `https://api.deepgram.com/v1/speak?model=aura-asteria-en&encoding=mulaw&sample_rate=8000&container=none`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${env.deepgram.apiKey}`,
      },
      body: JSON.stringify({ text }),
      signal: this.abortController?.signal as any,
    });

    if (!response.ok) {
      throw new Error(`Deepgram TTS error: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('No response body from Deepgram');
    }

    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Deepgram outputs mulaw directly with these params
      this.emit('audio', Buffer.from(value));
    }
  }

  interrupt(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}
