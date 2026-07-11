declare const signalLevelDbfsBrand: unique symbol;
declare const calibrationLevelDbBrand: unique symbol;
declare const playbackGainBrand: unique symbol;

export const MIN_SIGNAL_LEVEL_DBFS = -84;
export const MAX_SIGNAL_LEVEL_DBFS = 0;
export const MIN_PLAYBACK_GAIN = 0;
export const MAX_PLAYBACK_GAIN = 1;

export type SignalLevelDbfs = number & {
  readonly [signalLevelDbfsBrand]: 'SignalLevelDbfs';
};

export type CalibrationLevelDb = number & {
  readonly [calibrationLevelDbBrand]: 'CalibrationLevelDb';
};

export type PlaybackGain = number & {
  readonly [playbackGainBrand]: 'PlaybackGain';
};

export const createSignalLevelDbfs = (value: number): SignalLevelDbfs => {
  if (
    !Number.isFinite(value) ||
    value < MIN_SIGNAL_LEVEL_DBFS ||
    value > MAX_SIGNAL_LEVEL_DBFS
  ) {
    throw new RangeError(
      `SignalLevelDbfs must be a finite number between ${MIN_SIGNAL_LEVEL_DBFS} and ${MAX_SIGNAL_LEVEL_DBFS}, inclusive; received ${String(value)}.`,
    );
  }

  return value as SignalLevelDbfs;
};

export const createCalibrationLevelDb = (value: number): CalibrationLevelDb => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(
      `CalibrationLevelDb must be a finite number greater than 0; received ${String(value)}.`,
    );
  }

  return value as CalibrationLevelDb;
};

export const createPlaybackGain = (value: number): PlaybackGain => {
  if (
    !Number.isFinite(value) ||
    value < MIN_PLAYBACK_GAIN ||
    value > MAX_PLAYBACK_GAIN
  ) {
    throw new RangeError(
      `PlaybackGain must be a finite number between ${MIN_PLAYBACK_GAIN} and ${MAX_PLAYBACK_GAIN}, inclusive; received ${String(value)}.`,
    );
  }

  return value as PlaybackGain;
};

export const DIRECTIONS = [0, 45, 90, 135, 180, 225, 270, 315] as const;

export type Direction = (typeof DIRECTIONS)[number];

export type RecordingStatus = 'complete' | 'incomplete';
