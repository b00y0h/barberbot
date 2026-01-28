import { env } from '../config/env';
import { EventEmitter } from 'events';
import { pcmToMulaw, resamplePcm } from './audio-convert';

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
        const resampled = resamplePcm(chunk, 24000, 8000);
        const mulaw = pcmToMulaw(resampled);
        this.emit('audio', mulaw);
      }
    }

    // Process remaining samples
    if (pcmBuffer.length >= 2) {
      const resampled = resamplePcm(pcmBuffer, 24000, 8000);
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
