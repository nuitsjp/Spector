import {
  RECORDING_SCHEMA_VERSION,
  createPlaybackGain,
  createSignalLevelDbfs,
  type RecordingRecord,
} from '../domain';

export const createTestRecord = (
  id = 'record-1',
  startedAt = '2026-07-11T00:00:00.000Z',
): RecordingRecord => ({
  schemaVersion: RECORDING_SCHEMA_VERSION,
  id,
  status: 'complete',
  startedAt,
  endedAt: '2026-07-11T00:00:01.000Z',
  primaryInputId: 'input-1',
  direction: 0,
  voice: false,
  testNoise: true,
  playbackGain: createPlaybackGain(0.5),
  deviceRecordings: [
    {
      inputId: 'input-1',
      displayName: 'マイク',
      sampleRate: 48_000,
      channels: 1,
      wavBlobKey: `${id}/input-1.wav`,
      min: createSignalLevelDbfs(-50),
      avg: createSignalLevelDbfs(-40),
      max: createSignalLevelDbfs(-30),
      aboveMinus30Ratio: 0,
      aboveMinus40Ratio: 0.5,
      aboveMinus50Ratio: 0.75,
    },
  ],
});
