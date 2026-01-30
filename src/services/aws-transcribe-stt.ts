/**
 * AWS Transcribe Streaming STT
 *
 * Drop-in replacement for DeepgramSTT with AWS Transcribe Streaming.
 * Implements the same EventEmitter interface for compatibility with CallManager.
 */

import { EventEmitter } from 'events';
import {
  StartStreamTranscriptionCommand,
  AudioStream,
  TranscriptResultStream,
  MediaEncoding,
  LanguageCode,
} from '@aws-sdk/client-transcribe-streaming';
import { getTranscribeClient } from './aws-clients';
import { mulawToPcm } from './audio-convert';

export interface STTEvents {
  transcript: (text: string, isFinal: boolean) => void;
  utterance_end: () => void;
  error: (err: Error) => void;
  close: () => void;
}

export class AWSTranscribeSTT extends EventEmitter {
  private audioBuffer: Buffer[] = [];
  private isStreaming = false;
  private isStopped = false;
  private streamController: {
    resolve: (value: void) => void;
    reject: (err: Error) => void;
  } | null = null;
  private utteranceEndTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly UTTERANCE_END_DEBOUNCE_MS = 300;

  /**
   * Start the AWS Transcribe streaming connection
   */
  async start(): Promise<void> {
    if (this.isStreaming) {
      return;
    }

    this.isStreaming = true;
    this.isStopped = false;
    this.audioBuffer = [];

    const client = getTranscribeClient();

    // Create async generator for audio stream
    const audioStreamGenerator = this.createAudioStreamGenerator();

    try {
      const command = new StartStreamTranscriptionCommand({
        LanguageCode: LanguageCode.EN_US,
        MediaEncoding: MediaEncoding.PCM,
        MediaSampleRateHertz: 8000,
        AudioStream: audioStreamGenerator,
        EnablePartialResultsStabilization: true,
        PartialResultsStability: 'high',
      });

      const response = await client.send(command);

      console.log('[AWS] Transcribe streaming connection opened');

      // Process transcript results in background
      this.processTranscriptStream(response.TranscriptResultStream);
    } catch (err) {
      this.isStreaming = false;
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('[AWS] Transcribe start error:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Send audio data to the transcription stream
   * @param audioData - Buffer containing mulaw 8kHz audio from Twilio
   */
  sendAudio(audioData: Buffer): void {
    if (this.isStopped || !this.isStreaming) {
      // Buffer audio until streaming starts, or ignore if stopped
      if (!this.isStopped) {
        this.audioBuffer.push(audioData);
      }
      return;
    }

    // Convert mulaw to PCM16 for AWS Transcribe
    const pcmData = mulawToPcm(audioData);
    this.audioBuffer.push(pcmData);
  }

  /**
   * Stop the transcription stream
   */
  stop(): void {
    if (this.isStopped) {
      return;
    }

    this.isStopped = true;
    this.isStreaming = false;

    // Clear utterance end timer to prevent memory leaks
    if (this.utteranceEndTimer) {
      clearTimeout(this.utteranceEndTimer);
      this.utteranceEndTimer = null;
    }

    // Signal the audio generator to stop
    if (this.streamController) {
      this.streamController.resolve();
      this.streamController = null;
    }

    console.log('[AWS] Transcribe connection closed');
    this.emit('close');
  }

  /**
   * Handle final transcript result - triggers utterance end detection
   * Called internally when AWS sends a final (non-partial) transcript result.
   * Uses debouncing to detect natural speech boundaries.
   * @param transcript - The final transcript text
   */
  handleFinalTranscript(transcript: string): void {
    if (!transcript || transcript.trim().length === 0) {
      return;
    }

    // Clear any existing timer - each new final resets the debounce
    if (this.utteranceEndTimer) {
      clearTimeout(this.utteranceEndTimer);
    }

    // Start new timer - utterance_end fires after silence (no new finals)
    this.utteranceEndTimer = setTimeout(() => {
      if (!this.isStopped) {
        this.emit('utterance_end');
      }
      this.utteranceEndTimer = null;
    }, this.UTTERANCE_END_DEBOUNCE_MS);
  }

  /**
   * Create async generator for audio stream
   */
  private async *createAudioStreamGenerator(): AsyncGenerator<AudioStream> {
    while (!this.isStopped) {
      // Yield buffered audio chunks
      while (this.audioBuffer.length > 0) {
        const chunk = this.audioBuffer.shift();
        if (chunk) {
          yield { AudioEvent: { AudioChunk: chunk } };
        }
      }

      // Wait a bit before checking for more audio
      await new Promise<void>((resolve) => {
        this.streamController = { resolve, reject: () => {} };
        setTimeout(resolve, 20); // 20ms chunks
      });
    }
  }

  /**
   * Process the transcript result stream from AWS
   */
  private async processTranscriptStream(
    stream: AsyncIterable<TranscriptResultStream> | undefined
  ): Promise<void> {
    if (!stream) {
      return;
    }

    try {
      let lastTranscript = '';

      for await (const event of stream) {
        if (this.isStopped) {
          break;
        }

        if (event.TranscriptEvent?.Transcript?.Results) {
          for (const result of event.TranscriptEvent.Transcript.Results) {
            if (result.Alternatives && result.Alternatives.length > 0) {
              const transcript = result.Alternatives[0].Transcript || '';
              const isFinal = !result.IsPartial;

              // Only emit if there's actual text
              if (transcript.trim().length > 0) {
                // Filter filler words per CONTEXT.md
                const filteredTranscript = this.filterFillerWords(transcript.trim());
                if (filteredTranscript.length > 0) {
                  this.emit('transcript', filteredTranscript, isFinal);
                }
              }

              // Trigger utterance end detection on final results
              if (isFinal && transcript.trim().length > 0) {
                lastTranscript = transcript;
                this.handleFinalTranscript(transcript);
              }
            }
          }
        }

        // Check for service errors
        if (event.BadRequestException) {
          const err = new Error(event.BadRequestException.Message || 'Bad request');
          this.emit('error', err);
        }

        if (event.LimitExceededException) {
          const err = new Error(event.LimitExceededException.Message || 'Limit exceeded');
          this.emit('error', err);
        }

        if (event.InternalFailureException) {
          const err = new Error(event.InternalFailureException.Message || 'Internal failure');
          this.emit('error', err);
        }

        if (event.ConflictException) {
          const err = new Error(event.ConflictException.Message || 'Conflict');
          this.emit('error', err);
        }

        if (event.ServiceUnavailableException) {
          const err = new Error(event.ServiceUnavailableException.Message || 'Service unavailable');
          this.emit('error', err);
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('[AWS] Transcribe stream error:', error);
      this.emit('error', error);
    } finally {
      if (!this.isStopped) {
        this.stop();
      }
    }
  }

  /**
   * Filter common filler words from transcript
   * Per CONTEXT.md: Filter filler words ('um', 'uh', 'like') for cleaner LLM input
   */
  private filterFillerWords(text: string): string {
    // Common filler words to remove
    const fillerPattern = /\b(um|uh|uh-huh|mm-hmm|er|ah|hmm|you know|i mean|like)\b/gi;

    // Remove filler words and clean up extra spaces
    return text
      .replace(fillerPattern, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
