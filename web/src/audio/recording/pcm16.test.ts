import { describe, expect, it } from 'vitest';

import {
  floatSampleToPcm16,
  pcm16SampleToFloat,
  Pcm16ChunkAccumulator,
} from './pcm16';

describe('PCM16 conversion', () => {
  it('round-trips finite samples within one PCM16 LSB', () => {
    const tolerance = 1 / 32_767;
    for (const sample of [-1, -0.75, -0.1, 0, 0.1, 0.75, 1]) {
      expect(pcm16SampleToFloat(floatSampleToPcm16(sample))).toBeCloseTo(
        sample,
        Math.floor(-Math.log10(tolerance)),
      );
      expect(
        Math.abs(pcm16SampleToFloat(floatSampleToPcm16(sample)) - sample),
      ).toBeLessThanOrEqual(tolerance);
    }
  });

  it('clamps out-of-range samples and replaces non-finite values', () => {
    expect(floatSampleToPcm16(-2)).toBe(-32_768);
    expect(floatSampleToPcm16(2)).toBe(32_767);
    expect(floatSampleToPcm16(Number.NaN)).toBe(0);
    expect(floatSampleToPcm16(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('Pcm16ChunkAccumulator', () => {
  it.each([44_100, 48_000])(
    'emits exact one-second mono chunks at %i Hz and flushes the remainder',
    (sampleRate) => {
      const accumulator = new Pcm16ChunkAccumulator(sampleRate, 1);
      const chunks = accumulator.append(
        [new Float32Array(sampleRate + 17).fill(0.5)],
        100,
      );
      const remainder = accumulator.flush();

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toMatchObject({
        sequence: 0,
        timestamp: 100,
        sampleCount: sampleRate,
      });
      expect(chunks[0]?.pcm16.byteLength).toBe(sampleRate * 2);
      expect(remainder).toMatchObject({ sequence: 1, sampleCount: 17 });
      expect(remainder?.timestamp).toBeCloseTo(1_100, 8);
      expect(remainder?.pcm16.byteLength).toBe(34);
    },
  );

  it('interleaves stereo PCM by frame', () => {
    const accumulator = new Pcm16ChunkAccumulator(2, 2);
    const [chunk] = accumulator.append(
      [new Float32Array([1, 0.5]), new Float32Array([-1, -0.5])],
      0,
    );

    if (chunk === undefined) throw new Error('Expected a full PCM chunk.');

    expect(Array.from(new Int16Array(chunk.pcm16))).toEqual([
      32_767, -32_768, 16_384, -16_384,
    ]);
  });

  it('emits no empty chunk during flush', () => {
    expect(new Pcm16ChunkAccumulator(48_000, 1).flush()).toBeNull();
  });
});
