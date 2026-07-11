import { describe, expect, it } from 'vitest';

import { A_WEIGHTING_SINE_FIXTURES } from '../../test/fixtures/dsp';

import { AWeightingFilter } from './aWeightingFilter';

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

describe('AWeightingFilter', () => {
  it('retains state across Float32Array chunks', () => {
    const fixture = A_WEIGHTING_SINE_FIXTURES[1];
    const samples = createSineWave(
      fixture.sampleRate,
      fixture.frequencyHz,
      fixture.amplitude,
      fixture.durationSeconds,
    );
    const splitIndex = 17_003;
    const whole = new AWeightingFilter(fixture.sampleRate).process(samples);
    const chunkedFilter = new AWeightingFilter(fixture.sampleRate);
    const first = chunkedFilter.process(samples.slice(0, splitIndex));
    const second = chunkedFilter.process(samples.slice(splitIndex));

    expect([...first, ...second]).toEqual([...whole]);
  });

  it('can reset its stream state', () => {
    const samples = createSineWave(48_000, 1_000, 0.5, 1);
    const filter = new AWeightingFilter(48_000);
    const firstPass = filter.process(samples);

    filter.reset();

    expect(filter.process(samples)).toEqual(firstPass);
  });

  it('replaces non-finite stage output with zero and clamps the result', () => {
    const output = new AWeightingFilter(48_000).process(
      new Float32Array([
        0.25,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        100,
      ]),
    );

    expect(output.every(Number.isFinite)).toBe(true);
    expect(output.every((sample) => sample >= -1 && sample <= 1)).toBe(true);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid sample rate %s',
    (sampleRate) => {
      expect(() => new AWeightingFilter(sampleRate)).toThrowError(RangeError);
    },
  );
});
