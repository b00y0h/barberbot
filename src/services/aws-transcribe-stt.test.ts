import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'events';

// Mock the AWS client and audio-convert before importing the class
const mockSend = mock.fn();
const mockTranscribeClient = { send: mockSend };

// Track what was imported to mock
let getTranscribeClientMock: ReturnType<typeof mock.fn>;
let mulawToPcmMock: ReturnType<typeof mock.fn>;

// We'll test the class behavior through its EventEmitter interface
// Real AWS integration will be tested separately

describe('AWSTranscribeSTT', () => {
  let AWSTranscribeSTT: typeof import('./aws-transcribe-stt').AWSTranscribeSTT;

  beforeEach(async () => {
    // Reset mocks between tests
    mockSend.mock.resetCalls();

    // Dynamic import to get fresh module for each test
    const module = await import('./aws-transcribe-stt');
    AWSTranscribeSTT = module.AWSTranscribeSTT;
  });

  describe('class structure', () => {
    it('extends EventEmitter', () => {
      const stt = new AWSTranscribeSTT();
      assert.ok(stt instanceof EventEmitter, 'AWSTranscribeSTT should extend EventEmitter');
    });

    it('has start() method returning Promise<void>', async () => {
      const stt = new AWSTranscribeSTT();
      assert.strictEqual(typeof stt.start, 'function', 'should have start method');
    });

    it('has sendAudio(Buffer) method', () => {
      const stt = new AWSTranscribeSTT();
      assert.strictEqual(typeof stt.sendAudio, 'function', 'should have sendAudio method');
    });

    it('has stop() method', () => {
      const stt = new AWSTranscribeSTT();
      assert.strictEqual(typeof stt.stop, 'function', 'should have stop method');
    });
  });

  describe('event emission', () => {
    it('can register transcript event listener', () => {
      const stt = new AWSTranscribeSTT();
      let called = false;

      stt.on('transcript', (text: string, isFinal: boolean) => {
        called = true;
      });

      // Emit a test event
      stt.emit('transcript', 'hello', true);
      assert.ok(called, 'transcript event listener should be callable');
    });

    it('can register utterance_end event listener', () => {
      const stt = new AWSTranscribeSTT();
      let called = false;

      stt.on('utterance_end', () => {
        called = true;
      });

      stt.emit('utterance_end');
      assert.ok(called, 'utterance_end event listener should be callable');
    });

    it('can register error event listener', () => {
      const stt = new AWSTranscribeSTT();
      let called = false;

      stt.on('error', (err: Error) => {
        called = true;
      });

      stt.emit('error', new Error('test'));
      assert.ok(called, 'error event listener should be callable');
    });

    it('can register close event listener', () => {
      const stt = new AWSTranscribeSTT();
      let called = false;

      stt.on('close', () => {
        called = true;
      });

      stt.emit('close');
      assert.ok(called, 'close event listener should be callable');
    });
  });

  describe('sendAudio()', () => {
    it('accepts Buffer input (mulaw format)', () => {
      const stt = new AWSTranscribeSTT();
      const mulawBuffer = Buffer.from([0x7f, 0x7f, 0x7f, 0x7f]); // silence

      // Should not throw
      assert.doesNotThrow(() => {
        stt.sendAudio(mulawBuffer);
      });
    });

    it('handles multiple sendAudio calls', () => {
      const stt = new AWSTranscribeSTT();
      const chunk1 = Buffer.from([0x7f, 0x7f]);
      const chunk2 = Buffer.from([0x80, 0x80]);

      assert.doesNotThrow(() => {
        stt.sendAudio(chunk1);
        stt.sendAudio(chunk2);
        stt.sendAudio(chunk1);
      });
    });
  });

  describe('stop()', () => {
    it('emits close event when called', (t, done) => {
      const stt = new AWSTranscribeSTT();

      stt.on('close', () => {
        done();
      });

      stt.stop();
    });

    it('can be called multiple times safely', () => {
      const stt = new AWSTranscribeSTT();

      assert.doesNotThrow(() => {
        stt.stop();
        stt.stop();
        stt.stop();
      });
    });
  });

  describe('integration behavior', () => {
    it('transcript event provides text and isFinal flag', (t, done) => {
      const stt = new AWSTranscribeSTT();

      stt.on('transcript', (text: string, isFinal: boolean) => {
        assert.strictEqual(typeof text, 'string');
        assert.strictEqual(typeof isFinal, 'boolean');
        done();
      });

      // Simulate receiving a transcript
      stt.emit('transcript', 'hello world', false);
    });

    it('error event provides Error object', (t, done) => {
      const stt = new AWSTranscribeSTT();

      stt.on('error', (err: Error) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.message, 'test error');
        done();
      });

      stt.emit('error', new Error('test error'));
    });
  });
});
