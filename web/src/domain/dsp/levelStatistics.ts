import { createSignalLevelDbfs, type SignalLevelDbfs } from '../types';

export interface SignalLevelStatistics {
  readonly min: SignalLevelDbfs;
  readonly avg: SignalLevelDbfs;
  readonly max: SignalLevelDbfs;
  readonly aboveMinus30Ratio: number;
  readonly aboveMinus40Ratio: number;
  readonly aboveMinus50Ratio: number;
}

export const calculateSignalLevelStatistics = (
  levels: readonly number[],
): SignalLevelStatistics => {
  if (levels.length === 0) {
    throw new RangeError('At least one signal level is required.');
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let total = 0;
  let aboveMinus30Count = 0;
  let aboveMinus40Count = 0;
  let aboveMinus50Count = 0;

  for (const level of levels) {
    createSignalLevelDbfs(level);
    min = Math.min(min, level);
    max = Math.max(max, level);
    total += level;

    if (level > -30) aboveMinus30Count += 1;
    if (level > -40) aboveMinus40Count += 1;
    if (level > -50) aboveMinus50Count += 1;
  }

  return {
    min: createSignalLevelDbfs(min),
    avg: createSignalLevelDbfs(total / levels.length),
    max: createSignalLevelDbfs(max),
    aboveMinus30Ratio: aboveMinus30Count / levels.length,
    aboveMinus40Ratio: aboveMinus40Count / levels.length,
    aboveMinus50Ratio: aboveMinus50Count / levels.length,
  };
};
