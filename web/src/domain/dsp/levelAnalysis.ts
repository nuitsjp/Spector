import { createSignalLevelDbfs, type SignalLevelDbfs } from '../types';

import { AWeightingFilter } from './aWeightingFilter';

export const LEVEL_COLLECTION_RATE_HZ = 40;
export const LEVEL_WINDOW_DURATION_SECONDS = 1 / LEVEL_COLLECTION_RATE_HZ;

const validateAudioFormat = (sampleRate: number, channels: number): void => {
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new RangeError(
      `sampleRate must be a positive integer; received ${String(sampleRate)}.`,
    );
  }
  if (!Number.isInteger(channels) || channels <= 0) {
    throw new RangeError(
      `channels must be a positive integer; received ${String(channels)}.`,
    );
  }
};

export const getLevelWindowSampleCount = (
  sampleRate: number,
  channels: number,
): number => {
  validateAudioFormat(sampleRate, channels);

  const sampleCount = Math.floor(
    sampleRate * LEVEL_WINDOW_DURATION_SECONDS * channels,
  );
  if (sampleCount < 1) {
    throw new RangeError('The audio format produces an empty 25 ms window.');
  }

  return sampleCount;
};

export const calculateRms = (
  samples: Float32Array,
  startIndex = 0,
  endIndex = samples.length,
): number => {
  if (
    !Number.isInteger(startIndex) ||
    !Number.isInteger(endIndex) ||
    startIndex < 0 ||
    endIndex > samples.length ||
    startIndex >= endIndex
  ) {
    throw new RangeError(
      `Expected a non-empty sample range within 0..${samples.length}; received ${startIndex}..${endIndex}.`,
    );
  }

  let sumOfSquares = 0;
  for (let index = startIndex; index < endIndex; index += 1) {
    const candidate = samples[index] ?? 0;
    const sample = Number.isFinite(candidate) ? candidate : 0;
    sumOfSquares += sample * sample;
  }

  return Math.sqrt(sumOfSquares / (endIndex - startIndex));
};

export const rmsToSignalLevelDbfs = (rms: number): SignalLevelDbfs => {
  if (!Number.isFinite(rms) || rms <= 0) {
    return createSignalLevelDbfs(-84);
  }

  const level = 20 * Math.log10(rms);
  return createSignalLevelDbfs(Math.max(-84, Math.min(0, level)));
};

/** Includes the final partial 25 ms window. */
export const calculateWindowedSignalLevels = (
  samples: Float32Array,
  sampleRate: number,
  channels: number,
): SignalLevelDbfs[] => {
  const windowSampleCount = getLevelWindowSampleCount(sampleRate, channels);
  const levels: SignalLevelDbfs[] = [];

  for (
    let startIndex = 0;
    startIndex < samples.length;
    startIndex += windowSampleCount
  ) {
    const endIndex = Math.min(startIndex + windowSampleCount, samples.length);
    levels.push(
      rmsToSignalLevelDbfs(calculateRms(samples, startIndex, endIndex)),
    );
  }

  return levels;
};

export const analyzeAWeightedSignalLevels = (
  samples: Float32Array,
  sampleRate: number,
  channels: number,
): SignalLevelDbfs[] => {
  const filter = new AWeightingFilter(sampleRate);
  return calculateWindowedSignalLevels(
    filter.process(samples),
    sampleRate,
    channels,
  );
};
