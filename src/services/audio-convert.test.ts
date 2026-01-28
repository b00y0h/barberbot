import { describe, it } from 'node:test';
import assert from 'node:assert';
import { mulawToPcm, pcmToMulaw, resamplePcm } from './audio-convert';

describe('audio-convert', () => {
  describe('mulawToPcm', () => {
    it('converts mulaw bytes to PCM16 samples with correct length', () => {
      // Create some known mulaw bytes
      const mulawInput = Buffer.from([0x00, 0x7f, 0xff, 0x80]);
      const pcmOutput = mulawToPcm(mulawInput);

      // Output should be 2x the input length (2 bytes per sample)
      assert.strictEqual(pcmOutput.length, mulawInput.length * 2);

      // Output should be a Buffer
      assert.ok(Buffer.isBuffer(pcmOutput));
    });

    it('returns empty buffer for empty input', () => {
      const result = mulawToPcm(Buffer.alloc(0));
      assert.strictEqual(result.length, 0);
    });

    it('handles single sample correctly', () => {
      const singleSample = Buffer.from([0x7f]); // silence in mulaw
      const result = mulawToPcm(singleSample);
      assert.strictEqual(result.length, 2);
    });
  });

  describe('pcmToMulaw', () => {
    it('converts PCM16 samples to mulaw bytes with correct length', () => {
      // Create PCM16 samples (2 bytes each, little-endian)
      const pcmInput = Buffer.alloc(8);
      pcmInput.writeInt16LE(0, 0);
      pcmInput.writeInt16LE(1000, 2);
      pcmInput.writeInt16LE(-1000, 4);
      pcmInput.writeInt16LE(16000, 6);

      const mulawOutput = pcmToMulaw(pcmInput);

      // Output should be 0.5x the input length (1 byte per sample)
      assert.strictEqual(mulawOutput.length, pcmInput.length / 2);

      // Output should be a Buffer
      assert.ok(Buffer.isBuffer(mulawOutput));
    });

    it('returns empty buffer for empty input', () => {
      const result = pcmToMulaw(Buffer.alloc(0));
      assert.strictEqual(result.length, 0);
    });

    it('handles single sample correctly', () => {
      const singleSample = Buffer.alloc(2);
      singleSample.writeInt16LE(0, 0);
      const result = pcmToMulaw(singleSample);
      assert.strictEqual(result.length, 1);
    });
  });

  describe('round-trip conversion', () => {
    it('mulaw -> PCM -> mulaw preserves audio fidelity', () => {
      // Generate all possible mulaw byte values (0-255)
      const allMulawBytes = Buffer.alloc(256);
      for (let i = 0; i < 256; i++) {
        allMulawBytes[i] = i;
      }

      // Convert to PCM and back to mulaw
      const pcm = mulawToPcm(allMulawBytes);
      const roundTrip = pcmToMulaw(pcm);

      // Most values should round-trip exactly
      // Exception: 0x7F and 0xFF both decode to 0, which re-encodes to 0xFF
      // This is correct G.711 behavior (two representations of silence)
      let matchCount = 0;
      for (let i = 0; i < 256; i++) {
        if (roundTrip[i] === allMulawBytes[i]) {
          matchCount++;
        } else {
          // The only acceptable difference is 0x7F -> 0xFF (both represent ~0)
          const originalPcm = pcm.readInt16LE(i * 2);
          assert.strictEqual(originalPcm, 0, `Mulaw byte ${i} should only differ if it decodes to 0`);
        }
      }

      // At least 254/256 should match exactly (allowing for +0/-0 ambiguity)
      assert.ok(matchCount >= 254, `Only ${matchCount}/256 values round-trip exactly`);
    });

    it('PCM -> mulaw -> PCM has acceptable quantization error', () => {
      // Create a sine wave PCM signal
      const sampleCount = 100;
      const pcmInput = Buffer.alloc(sampleCount * 2);

      for (let i = 0; i < sampleCount; i++) {
        // Generate sine wave with amplitude 16000
        const sample = Math.round(16000 * Math.sin((2 * Math.PI * i) / 20));
        pcmInput.writeInt16LE(sample, i * 2);
      }

      // Round-trip through mulaw
      const mulaw = pcmToMulaw(pcmInput);
      const pcmOutput = mulawToPcm(mulaw);

      // Calculate max relative error
      let maxError = 0;
      for (let i = 0; i < sampleCount; i++) {
        const original = pcmInput.readInt16LE(i * 2);
        const recovered = pcmOutput.readInt16LE(i * 2);
        const absOriginal = Math.abs(original);

        if (absOriginal > 100) {
          // Only check error for non-tiny samples
          const relError = Math.abs(original - recovered) / absOriginal;
          maxError = Math.max(maxError, relError);
        }
      }

      // Mulaw quantization should be within 2% for reasonable signal levels
      assert.ok(maxError < 0.02, `Max relative error ${maxError} exceeds 2%`);
    });
  });

  describe('resamplePcm', () => {
    it('same rate returns input unchanged', () => {
      const input = Buffer.alloc(16);
      for (let i = 0; i < 8; i++) {
        input.writeInt16LE(i * 100, i * 2);
      }

      const result = resamplePcm(input, 8000, 8000);
      assert.strictEqual(result, input); // Same object reference
    });

    it('24kHz to 8kHz downsamples correctly', () => {
      // Create 24 samples at 24kHz = 1ms of audio
      const input = Buffer.alloc(24 * 2);
      for (let i = 0; i < 24; i++) {
        input.writeInt16LE(i * 100, i * 2);
      }

      const result = resamplePcm(input, 24000, 8000);

      // Should produce 8 samples at 8kHz (1/3 of input)
      assert.strictEqual(result.length, 8 * 2);
    });

    it('8kHz to 16kHz upsamples correctly', () => {
      // Create 8 samples at 8kHz
      const input = Buffer.alloc(8 * 2);
      for (let i = 0; i < 8; i++) {
        input.writeInt16LE(i * 100, i * 2);
      }

      const result = resamplePcm(input, 8000, 16000);

      // Should produce 16 samples at 16kHz (2x input)
      assert.strictEqual(result.length, 16 * 2);
    });

    it('returns empty buffer for empty input', () => {
      const result = resamplePcm(Buffer.alloc(0), 8000, 16000);
      assert.strictEqual(result.length, 0);
    });
  });

  describe('performance', () => {
    it('handles large buffer without blocking', () => {
      // 10 seconds of 8kHz audio = 80000 samples
      const largeMulaw = Buffer.alloc(80000);
      for (let i = 0; i < largeMulaw.length; i++) {
        largeMulaw[i] = i % 256;
      }

      const start = Date.now();
      const pcm = mulawToPcm(largeMulaw);
      const mulaw = pcmToMulaw(pcm);
      const elapsed = Date.now() - start;

      // Should complete well under 1 second (typically < 50ms)
      assert.ok(elapsed < 1000, `Large buffer conversion took ${elapsed}ms`);
      assert.strictEqual(mulaw.length, largeMulaw.length);
    });
  });
});
