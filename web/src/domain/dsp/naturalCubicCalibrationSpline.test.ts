import { describe, expect, it } from 'vitest';

import { CALIBRATION_SPLINE_FIXTURE } from '../../test/fixtures/dsp';

import { NaturalCubicCalibrationSpline } from './naturalCubicCalibrationSpline';

describe('NaturalCubicCalibrationSpline', () => {
  it('matches AudioCalibrator.cs within 1e-9', () => {
    const spline = new NaturalCubicCalibrationSpline(
      CALIBRATION_SPLINE_FIXTURE.points,
    );

    for (const estimate of CALIBRATION_SPLINE_FIXTURE.estimates) {
      expect(spline.estimatePlaybackGain(estimate.levelDb)).toBeCloseTo(
        estimate.playbackGain,
        9,
      );
    }
  });

  it('supports the two-point natural linear case', () => {
    const spline = new NaturalCubicCalibrationSpline([
      { levelDb: 40, playbackGain: 0.4 },
      { levelDb: 60, playbackGain: 0.6 },
    ]);

    expect(spline.estimatePlaybackGain(50)).toBeCloseTo(0.5, 12);
  });

  it.each([
    { points: [] },
    { points: [{ levelDb: 40, playbackGain: 0.4 }] },
    {
      points: [
        { levelDb: 40, playbackGain: 0.4 },
        { levelDb: 40, playbackGain: 0.5 },
      ],
    },
    {
      points: [
        { levelDb: Number.NaN, playbackGain: 0.4 },
        { levelDb: 50, playbackGain: 0.5 },
      ],
    },
    {
      points: [
        { levelDb: 40, playbackGain: Number.POSITIVE_INFINITY },
        { levelDb: 50, playbackGain: 0.5 },
      ],
    },
  ])('rejects invalid calibration points %#', ({ points }) => {
    expect(() => new NaturalCubicCalibrationSpline(points)).toThrowError(
      RangeError,
    );
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite target %s',
    (target) => {
      const spline = new NaturalCubicCalibrationSpline([
        { levelDb: 40, playbackGain: 0.4 },
        { levelDb: 50, playbackGain: 0.5 },
      ]);

      expect(() => spline.estimatePlaybackGain(target)).toThrowError(
        RangeError,
      );
    },
  );
});
