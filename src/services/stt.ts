import { createClient, LiveTranscriptionEvents, LiveClient } from '@deepgram/sdk';
import { env } from '../config/env';
import { EventEmitter } from 'events';

export interface STTEvents {
  transcript: (text: string, isFinal: boolean) => void;
  utterance_end: () => void;
  error: (err: Error) => void;
  close: () => void;
}

export class DeepgramSTT extends EventEmitter {
  private connection: LiveClient | null = null;
  private keepAliveInterval: ReturnType<typeof setInterval> | null = null;

  async start(): Promise<void> {
    if (!env.deepgram.apiKey) {
      throw new Error('DEEPGRAM_API_KEY is required');
    }

    const deepgram = createClient(env.deepgram.apiKey);

    this.connection = deepgram.listen.live({
      model: 'nova-2',
      language: 'en-US',
      encoding: 'mulaw',
      sample_rate: 8000,
      channels: 1,
      punctuate: true,
      interim_results: true,
      utterance_end_ms: 1000,
      vad_events: true,
      endpointing: 300,
      smart_format: true,
    });

    this.connection.on(LiveTranscriptionEvents.Open, () => {
      console.log('[STT] Deepgram connection opened');

      // Keep-alive every 10s
      this.keepAliveInterval = setInterval(() => {
        if (this.connection) {
          this.connection.keepAlive();
        }
      }, 10000);
    });

    this.connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
      const transcript = data.channel?.alternatives?.[0]?.transcript;
      if (transcript && transcript.trim().length > 0) {
        const isFinal = data.is_final === true;
        this.emit('transcript', transcript.trim(), isFinal);
      }
    });

    this.connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
      this.emit('utterance_end');
    });

    this.connection.on(LiveTranscriptionEvents.Error, (err: Error) => {
      console.error('[STT] Deepgram error:', err);
      this.emit('error', err);
    });

    this.connection.on(LiveTranscriptionEvents.Close, () => {
      console.log('[STT] Deepgram connection closed');
      this.cleanup();
      this.emit('close');
    });
  }

  sendAudio(audioData: Buffer): void {
    if (this.connection) {
      this.connection.send(new Uint8Array(audioData) as any);
    }
  }

  stop(): void {
    if (this.connection) {
      this.connection.requestClose();
      this.connection = null;
    }
    this.cleanup();
  }

  private cleanup(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }
}
