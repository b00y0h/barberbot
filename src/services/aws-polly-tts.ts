import { SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { EventEmitter } from 'events';
import { getPollyClient } from './aws-clients';
import { pcmToMulaw } from './audio-convert';

export class AWSPollyTTS extends EventEmitter {
  private abortController: AbortController | null = null;
  private isRetrying = false;

  async synthesize(text: string): Promise<void> {
    this.abortController = new AbortController();

    try {
      await this.doSynthesize(text);
    } catch (err: any) {
      if (!this.isRetrying && this.isRetryableError(err)) {
        console.log('[AWS] Polly transient error, retrying once');
        this.isRetrying = true;
        try {
          this.abortController = new AbortController();
          await this.doSynthesize(text);
        } catch (retryErr) {
          this.handleError(retryErr);
        } finally {
          this.isRetrying = false;
        }
      } else {
        this.handleError(err);
      }
    } finally {
      this.emit('done');
    }
  }

  private async doSynthesize(text: string): Promise<void> {
    const pollyClient = getPollyClient();

    const command = new SynthesizeSpeechCommand({
      Engine: 'generative',
      VoiceId: 'Ruth',
      OutputFormat: 'pcm',
      SampleRate: '8000',
      Text: text,
      TextType: 'text',
    });

    const response = await pollyClient.send(command, {
      abortSignal: this.abortController!.signal as any,
    });

    if (!response.AudioStream) {
      throw new Error('No AudioStream in Polly response');
    }

    const stream = response.AudioStream as NodeJS.ReadableStream;
    const CHUNK_SIZE = 1600; // 100ms at 8kHz 16-bit mono PCM
    let buffer = Buffer.alloc(0);

    for await (const chunk of stream) {
      if (this.abortController?.signal.aborted) break;

      buffer = Buffer.concat([buffer, Buffer.from(chunk)]);

      while (buffer.length >= CHUNK_SIZE) {
        const pcmChunk = buffer.subarray(0, CHUNK_SIZE);
        buffer = buffer.subarray(CHUNK_SIZE);

        const mulawChunk = pcmToMulaw(pcmChunk);
        this.emit('audio', mulawChunk);
      }
    }

    if (buffer.length >= 2 && !this.abortController?.signal.aborted) {
      const mulawChunk = pcmToMulaw(buffer);
      this.emit('audio', mulawChunk);
    }
  }

  interrupt(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private isRetryableError(err: any): boolean {
    return err.name === 'ThrottlingException' ||
           err.name === 'ServiceUnavailableException' ||
           err.code === 'ECONNRESET' ||
           err.code === 'ETIMEDOUT';
  }

  private handleError(err: any): void {
    if (err.name === 'AbortError') {
      console.log('[AWS] Polly synthesis interrupted');
      return;
    }
    console.error('[AWS] Polly synthesis failed:', err);
    this.emit('error', err instanceof Error ? err : new Error(String(err)));
  }
}
