import {
  createCalibrationLevelDb,
  createPlaybackGain,
  type SpectorSettings,
} from '../domain';

export const createDefaultSettings = (): SpectorSettings => ({
  primaryInputId: null,
  playbackOutputId: null,
  playbackGain: createPlaybackGain(0.5),
  recorder: {
    recordingDurationSeconds: 30,
    voice: false,
    testNoise: true,
  },
  devices: [],
  calibrationPoints: [
    {
      levelDb: createCalibrationLevelDb(40),
      example: '図書館、静かなささやき',
      playbackGain: createPlaybackGain(0.4),
    },
    {
      levelDb: createCalibrationLevelDb(50),
      example: '静かなオフィス',
      playbackGain: createPlaybackGain(0.45),
    },
    {
      levelDb: createCalibrationLevelDb(60),
      example: '通常の会話',
      playbackGain: createPlaybackGain(0.5),
    },
    {
      levelDb: createCalibrationLevelDb(70),
      example: 'にぎやかなレストラン、掃除機',
      playbackGain: createPlaybackGain(0.55),
    },
    {
      levelDb: createCalibrationLevelDb(75),
      example: '',
      playbackGain: createPlaybackGain(0.6),
    },
  ],
});
