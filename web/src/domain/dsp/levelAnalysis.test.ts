import { describe, expect, it } from 'vitest';

import {
  A_WEIGHTING_SINE_FIXTURES,
  SIGNAL_LEVEL_THRESHOLD_FIXTURE,
  SILENCE_FIXTURES,
} from '../../test/fixtures/dsp';

import {
  analyzeAWeightedSignalLevels,
  calculateWindowedSignalLevels,
  getLevelWindowSampleCount,
} from './levelAnalysis';
import { calculateSignalLevelStatistics } from './levelStatistics';

const createSineWave = (
  sampleRate: number,
  frequencyHz: number,
  amplitude: number,
  durationSeconds: number,
): Float32Array =>
  Float32Array.from(
    { length: sampleRate * durationSeconds },
    (_, index) =>
      amplitude * Math.sin((2 * Math.PI * frequencyHz * index) / sampleRate),
  );

describe('windowed signal levels', () => {
  it('uses floor(sampleRate * 25 ms * channels)', () => {
    expect(getLevelWindowSampleCount(44_100, 1)).toBe(1_102);
    expect(getLevelWindowSampleCount(44_100, 2)).toBe(2_205);
    expect(getLevelWindowSampleCount(48_000, 1)).toBe(1_200);
  });

  it.each(SILENCE_FIXTURES)(
    'maps $sampleRate Hz silence to -84 dBFS(A)',
    ({ sampleRate, channels, durationSeconds, levelCount }) => {
      const samples = new Float32Array(sampleRate * durationSeconds * channels);
      const levels = analyzeAWeightedSignalLevels(
        samples,
        sampleRate,
        channels,
      );

      expect(levels).toHaveLength(levelCount);
      expect(levels.every((level) => level === -84)).toBe(true);
    },
  );

  it.each(A_WEIGHTING_SINE_FIXTURES)(
    'matches the WPF/NAudio golden result at $sampleRate Hz',
    ({
      sampleRate,
      channels,
      frequencyHz,
      amplitude,
      durationSeconds,
      expected,
    }) => {
      const levels = analyzeAWeightedSignalLevels(
        createSineWave(sampleRate, frequencyHz, amplitude, durationSeconds),
        sampleRate,
        channels,
      );
      const statistics = calculateSignalLevelStatistics(levels);

      expect(levels).toHaveLength(expected.levelCount);
      expect(levels[0]).toBeCloseTo(expected.firstLevelDbfs, 2);
      expect(levels[1]).toBeCloseTo(expected.secondLevelDbfs, 2);
      expect(levels.at(-1)).toBeCloseTo(expected.lastLevelDbfs, 2);
      expect(statistics.min).toBeCloseTo(expected.minDbfs, 2);
      expect(statistics.avg).toBeCloseTo(expected.avgDbfs, 2);
      expect(statistics.max).toBeCloseTo(expected.maxDbfs, 2);
    },
  );

  it('treats NaN and infinities as zero-valued samples', () => {
    const levels = calculateWindowedSignalLevels(
      new Float32Array([
        1,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
      ]),
      160,
      1,
    );

    expect(levels).toHaveLength(1);
    expect(levels[0]).toBeCloseTo(-6.020599913, 8);
  });

  it('includes a partial final window', () => {
    const samples = new Float32Array(1_103).fill(0.5);

    expect(calculateWindowedSignalLevels(samples, 44_100, 1)).toEqual([
      expect.closeTo(-6.020599913, 8),
      expect.closeTo(-6.020599913, 8),
    ]);
  });
});

describe('calculateSignalLevelStatistics', () => {
  it('uses strict greater-than threshold ratios', () => {
    const { levelsDbfs, expected } = SIGNAL_LEVEL_THRESHOLD_FIXTURE;

    expect(calculateSignalLevelStatistics(levelsDbfs)).toEqual(expected);
  });

  it('rejects empty input', () => {
    expect(() => calculateSignalLevelStatistics([])).toThrowError(RangeError);
  });
});
