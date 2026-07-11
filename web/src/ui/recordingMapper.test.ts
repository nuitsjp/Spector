import { describe, expect, it } from 'vitest';

import { createPlaybackGain, createSignalLevelDbfs } from '../domain';

import { createRecordingRecord } from './recordingMapper';

describe('createRecordingRecord', () => {
  it('録音結果から統計とWAV確定入力を構築する', () => {
    const result = createRecordingRecord({
      recordingId: 'record-1',
      status: 'complete',
      reason: 'duration-elapsed',
      detail: null,
      startedAt: '2026-07-11T00:00:00.000Z',
      endedAt: '2026-07-11T00:00:30.000Z',
      primaryInputId: 'microphone:1',
      direction: 90,
      voice: true,
      testNoise: false,
      playbackGain: createPlaybackGain(0.5),
      inputs: [
        {
          inputId: 'microphone:1',
          displayName: '計測マイク',
          sampleRate: 48_000,
          channels: 1,
          levels: [
            createSignalLevelDbfs(-50),
            createSignalLevelDbfs(-40),
            createSignalLevelDbfs(-20),
          ],
        },
      ],
    });

    expect(result.record.deviceRecordings[0]).toMatchObject({
      min: -50,
      avg: -110 / 3,
      max: -20,
      aboveMinus30Ratio: 1 / 3,
      aboveMinus40Ratio: 1 / 3,
      aboveMinus50Ratio: 2 / 3,
      wavBlobKey: 'record-1/1.wav',
    });
    expect(result.inputs).toEqual([
      {
        inputId: 'microphone:1',
        wavBlobKey: 'record-1/1.wav',
        sampleRate: 48_000,
        channels: 1,
      },
    ]);
  });

  it('レベルイベントがない不完全録音を無音として記録する', () => {
    const result = createRecordingRecord({
      recordingId: 'record-empty',
      status: 'incomplete',
      reason: 'source-disconnected',
      detail: '切断',
      startedAt: '2026-07-11T00:00:00.000Z',
      endedAt: '2026-07-11T00:00:00.100Z',
      primaryInputId: 'microphone:1',
      direction: 0,
      voice: false,
      testNoise: false,
      playbackGain: createPlaybackGain(0.5),
      inputs: [
        {
          inputId: 'microphone:1',
          displayName: '計測マイク',
          sampleRate: 44_100,
          channels: 2,
          levels: [],
        },
      ],
    });

    expect(result.record.deviceRecordings[0]).toMatchObject({
      min: -84,
      avg: -84,
      max: -84,
    });
  });
});
