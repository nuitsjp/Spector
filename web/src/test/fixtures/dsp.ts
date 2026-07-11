export const A_WEIGHTING_SINE_FIXTURES = [
  {
    sampleRate: 44_100,
    channels: 1,
    frequencyHz: 1_000,
    amplitude: 0.5,
    durationSeconds: 1,
    expected: {
      levelCount: 41,
      firstLevelDbfs: -8.27126418757415,
      secondLevelDbfs: -8.279073447786844,
      lastLevelDbfs: -7.9048738103457525,
      minDbfs: -8.282163004682413,
      avgDbfs: -8.271022164819351,
      maxDbfs: -7.9048738103457525,
    },
  },
  {
    sampleRate: 48_000,
    channels: 1,
    frequencyHz: 1_000,
    amplitude: 0.5,
    durationSeconds: 1,
    expected: {
      levelCount: 40,
      firstLevelDbfs: -8.279909976706293,
      secondLevelDbfs: -8.287437271444807,
      lastLevelDbfs: -8.287455158255154,
      minDbfs: -8.287488314488694,
      avgDbfs: -8.287268273779155,
      maxDbfs: -8.279909976706293,
    },
  },
] as const;

export const SILENCE_FIXTURES = [
  { sampleRate: 44_100, channels: 1, durationSeconds: 1, levelCount: 41 },
  { sampleRate: 44_100, channels: 2, durationSeconds: 1, levelCount: 40 },
  { sampleRate: 48_000, channels: 1, durationSeconds: 1, levelCount: 40 },
  { sampleRate: 48_000, channels: 2, durationSeconds: 1, levelCount: 40 },
] as const;

export const SIGNAL_LEVEL_THRESHOLD_FIXTURE = {
  levelsDbfs: [-50, -49, -40, -39, -30, -29],
  expected: {
    min: -50,
    avg: -39.5,
    max: -29,
    aboveMinus30Ratio: 1 / 6,
    aboveMinus40Ratio: 3 / 6,
    aboveMinus50Ratio: 5 / 6,
  },
} as const;

export const CALIBRATION_SPLINE_FIXTURE = {
  points: [
    { levelDb: 70, playbackGain: 0.55 },
    { levelDb: 40, playbackGain: 0.4 },
    { levelDb: 75, playbackGain: 0.6 },
    { levelDb: 50, playbackGain: 0.45 },
    { levelDb: 60, playbackGain: 0.5 },
  ],
  estimates: [
    { levelDb: 35, playbackGain: 0.37545731707317076 },
    { levelDb: 40, playbackGain: 0.4 },
    { levelDb: 45, playbackGain: 0.4245426829268293 },
    { levelDb: 50, playbackGain: 0.45 },
    { levelDb: 55, playbackGain: 0.4763719512195122 },
    { levelDb: 60, playbackGain: 0.5 },
    { levelDb: 65, playbackGain: 0.519969512195122 },
    { levelDb: 70, playbackGain: 0.55 },
    { levelDb: 72.5, playbackGain: 0.5732850609756097 },
    { levelDb: 75, playbackGain: 0.6 },
    { levelDb: 80, playbackGain: 0.65 },
  ],
} as const;
