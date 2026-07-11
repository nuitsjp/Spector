import { describe, expect, it } from 'vitest';

import {
  createCalibrationLevelDb,
  createPlaybackGain,
  createSignalLevelDbfs,
} from './types';

describe('createSignalLevelDbfs', () => {
  it.each([-84, 0])('accepts the inclusive boundary %s', (value) => {
    expect(createSignalLevelDbfs(value)).toBe(value);
  });

  it.each([-84.000_001, 0.000_001, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects %s',
    (value) => {
      const create = () => createSignalLevelDbfs(value);

      expect(create).toThrowError(RangeError);
      expect(create).toThrowError(/^SignalLevelDbfs/);
    },
  );
});

describe('createCalibrationLevelDb', () => {
  it('accepts a finite value greater than zero', () => {
    expect(createCalibrationLevelDb(Number.MIN_VALUE)).toBe(Number.MIN_VALUE);
  });

  it.each([0, -1, Number.NaN, Number.NEGATIVE_INFINITY])(
    'rejects %s',
    (value) => {
      const create = () => createCalibrationLevelDb(value);

      expect(create).toThrowError(RangeError);
      expect(create).toThrowError(/^CalibrationLevelDb/);
    },
  );
});

describe('createPlaybackGain', () => {
  it.each([0, 1])('accepts the inclusive boundary %s', (value) => {
    expect(createPlaybackGain(value)).toBe(value);
  });

  it.each([-0.000_001, 1.000_001, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects %s',
    (value) => {
      const create = () => createPlaybackGain(value);

      expect(create).toThrowError(RangeError);
      expect(create).toThrowError(/^PlaybackGain/);
    },
  );
});
