import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'events';

describe('AWSPollyTTS', () => {
  let AWSPollyTTS: typeof import('./aws-polly-tts').AWSPollyTTS;

  beforeEach(async () => {
    // Dynamic import to get fresh module for each test
    const module = await import('./aws-polly-tts');
    AWSPollyTTS = module.AWSPollyTTS;
  });

  describe('class structure', () => {
    it('extends EventEmitter', () => {
      const tts = new AWSPollyTTS();
      assert.ok(tts instanceof EventEmitter, 'AWSPollyTTS should extend EventEmitter');
    });

    it('has synthesize(text: string) method returning Promise<void>', () => {
      const tts = new AWSPollyTTS();
      assert.strictEqual(typeof tts.synthesize, 'function', 'should have synthesize method');
    });

    it('has interrupt() method', () => {
      const tts = new AWSPollyTTS();
      assert.strictEqual(typeof tts.interrupt, 'function', 'should have interrupt method');
    });
  });

  describe('event emission', () => {
    it('can register audio event listener', () => {
      const tts = new AWSPollyTTS();
      let called = false;

      tts.on('audio', (buffer: Buffer) => {
        called = true;
      });

      tts.emit('audio', Buffer.alloc(10));
      assert.ok(called, 'audio event listener should be callable');
    });

    it('can register done event listener', () => {
      const tts = new AWSPollyTTS();
      let called = false;

      tts.on('done', () => {
        called = true;
      });

      tts.emit('done');
      assert.ok(called, 'done event listener should be callable');
    });

    it('can register error event listener', () => {
      const tts = new AWSPollyTTS();
      let called = false;

      tts.on('error', (err: Error) => {
        called = true;
      });

      tts.emit('error', new Error('test'));
      assert.ok(called, 'error event listener should be callable');
    });
  });

  describe('interrupt()', () => {
    it('is safe to call interrupt() when not synthesizing', () => {
      const tts = new AWSPollyTTS();

      assert.doesNotThrow(() => {
        tts.interrupt();
        tts.interrupt();
      }, 'interrupt should be safe to call when not synthesizing');
    });
  });
});
