import { AudioEngineError } from '../errors';

export interface RecordingCapacityProbe {
  getAvailableBytes(): Promise<number>;
}

export class NavigatorRecordingCapacityProbe implements RecordingCapacityProbe {
  async getAvailableBytes(): Promise<number> {
    if (
      typeof navigator === 'undefined' ||
      navigator.storage === undefined ||
      typeof navigator.storage.estimate !== 'function'
    ) {
      throw new AudioEngineError(
        'unsupported-feature',
        '保存容量の確認APIに対応していません。',
      );
    }
    const estimate = await navigator.storage.estimate();
    const quota = estimate.quota;
    const usage = estimate.usage;
    if (quota === undefined || usage === undefined) {
      throw new AudioEngineError(
        'invalid-state',
        '利用可能な保存容量を確認できませんでした。',
      );
    }
    return Math.max(0, quota - usage);
  }
}

export const estimateRecordingBytes = (
  formats: readonly {
    readonly sampleRate: number;
    readonly channels: number;
  }[],
  durationSeconds: number,
): number => {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new RangeError('durationSeconds must be greater than zero.');
  }
  const bytes = formats.reduce((total, format) => {
    if (
      !Number.isInteger(format.sampleRate) ||
      format.sampleRate <= 0 ||
      !Number.isInteger(format.channels) ||
      format.channels <= 0
    ) {
      throw new RangeError('Audio formats must contain positive integers.');
    }
    return total + format.sampleRate * format.channels * 2 * durationSeconds;
  }, 0);
  if (!Number.isSafeInteger(Math.ceil(bytes))) {
    throw new RangeError('The recording size estimate is too large.');
  }
  return Math.ceil(bytes);
};
