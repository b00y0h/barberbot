/**
 * Audio Conversion Utilities
 *
 * Bidirectional G.711 mu-law (mulaw) and PCM16 conversion for Twilio/AWS integration.
 * - Twilio uses mulaw 8kHz audio
 * - AWS Transcribe requires PCM16
 * - AWS Polly outputs PCM16
 */

/**
 * G.711 mu-law decode lookup table
 * Maps mulaw byte (0-255) to 16-bit signed PCM sample
 */
const MULAW_DECODE_TABLE: Int16Array = new Int16Array(256);

// Initialize decode lookup table
(function initMulawDecodeTable() {
  for (let i = 0; i < 256; i++) {
    // Complement the input byte
    const mulaw = ~i & 0xff;

    // Extract sign (bit 7), exponent (bits 4-6), mantissa (bits 0-3)
    const sign = mulaw & 0x80;
    const exponent = (mulaw >> 4) & 0x07;
    const mantissa = mulaw & 0x0f;

    // Reconstruct the magnitude
    // Add back the quantization bias (0x84 = 132) and restore the exponent
    let magnitude = ((mantissa << 3) + 0x84) << exponent;

    // Remove the bias
    magnitude -= 0x84;

    // Apply sign
    MULAW_DECODE_TABLE[i] = sign ? -magnitude : magnitude;
  }
})();

/**
 * Convert G.711 mu-law encoded audio to 16-bit PCM
 *
 * @param mulawBuffer - Buffer containing 8-bit mu-law samples
 * @returns Buffer containing 16-bit little-endian PCM samples
 */
export function mulawToPcm(mulawBuffer: Buffer): Buffer {
  const pcmBuffer = Buffer.alloc(mulawBuffer.length * 2);

  for (let i = 0; i < mulawBuffer.length; i++) {
    const pcmSample = MULAW_DECODE_TABLE[mulawBuffer[i]];
    pcmBuffer.writeInt16LE(pcmSample, i * 2);
  }

  return pcmBuffer;
}

/**
 * Convert 16-bit PCM audio to G.711 mu-law encoding
 *
 * @param pcmBuffer - Buffer containing 16-bit little-endian PCM samples
 * @returns Buffer containing 8-bit mu-law samples
 */
export function pcmToMulaw(pcmBuffer: Buffer): Buffer {
  const BIAS = 0x84;
  const CLIP = 32635;
  const mulaw = Buffer.alloc(pcmBuffer.length / 2);

  for (let i = 0; i < pcmBuffer.length; i += 2) {
    let sample = pcmBuffer.readInt16LE(i);

    // Get sign and make sample positive
    const sign = (sample >> 8) & 0x80;
    if (sign !== 0) sample = -sample;
    if (sample > CLIP) sample = CLIP;

    // Add bias for encoding
    sample = sample + BIAS;

    // Find exponent (position of highest set bit)
    let exponent = 7;
    let mask = 0x4000;
    for (; exponent > 0; exponent--) {
      if ((sample & mask) !== 0) break;
      mask >>= 1;
    }

    // Extract mantissa (4 bits after the leading 1)
    const mantissa = (sample >> (exponent + 3)) & 0x0f;

    // Combine and complement
    const mulawByte = ~(sign | (exponent << 4) | mantissa) & 0xff;
    mulaw[i / 2] = mulawByte;
  }

  return mulaw;
}

/**
 * Resample PCM audio from one sample rate to another using linear interpolation
 *
 * @param input - Buffer containing 16-bit little-endian PCM samples
 * @param fromRate - Source sample rate in Hz
 * @param toRate - Target sample rate in Hz
 * @returns Buffer containing resampled 16-bit little-endian PCM samples
 */
export function resamplePcm(input: Buffer, fromRate: number, toRate: number): Buffer {
  // Same rate - return input unchanged
  if (fromRate === toRate) return input;

  // Handle empty input
  if (input.length === 0) return Buffer.alloc(0);

  const ratio = fromRate / toRate;
  const inputSamples = input.length / 2;
  const outputSamples = Math.floor(inputSamples / ratio);
  const output = Buffer.alloc(outputSamples * 2);

  for (let i = 0; i < outputSamples; i++) {
    const srcPos = i * ratio;
    const srcIndex = Math.floor(srcPos);
    const frac = srcPos - srcIndex;

    // Linear interpolation between adjacent samples
    const s0 = input.readInt16LE(Math.min(srcIndex, inputSamples - 1) * 2);
    const s1 = input.readInt16LE(Math.min(srcIndex + 1, inputSamples - 1) * 2);
    const sample = Math.round(s0 + (s1 - s0) * frac);

    // Clamp to 16-bit range
    output.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), i * 2);
  }

  return output;
}
