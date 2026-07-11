import type { RecordingSessionResult } from '../audio';
import {
  MIN_SIGNAL_LEVEL_DBFS,
  RECORDING_SCHEMA_VERSION,
  type RecordingRecord,
} from '../domain';
import { calculateSignalLevelStatistics } from '../domain/dsp';
import type { FinalizeAudioInput } from '../storage';

export interface FinalizedRecordingModel {
  readonly record: RecordingRecord;
  readonly inputs: readonly FinalizeAudioInput[];
}

export const createRecordingRecord = (
  result: RecordingSessionResult,
): FinalizedRecordingModel => {
  const deviceRecordings = result.inputs.map((input, index) => {
    const statistics = calculateSignalLevelStatistics(
      input.levels.length === 0 ? [MIN_SIGNAL_LEVEL_DBFS] : input.levels,
    );
    return {
      inputId: input.inputId,
      displayName: input.displayName,
      sampleRate: input.sampleRate,
      channels: input.channels,
      wavBlobKey: `${result.recordingId}/${index + 1}.wav`,
      ...statistics,
    };
  });

  return {
    record: {
      schemaVersion: RECORDING_SCHEMA_VERSION,
      id: result.recordingId,
      status: result.status,
      startedAt: result.startedAt,
      endedAt: result.endedAt,
      primaryInputId: result.primaryInputId,
      direction: result.direction,
      voice: result.voice,
      testNoise: result.testNoise,
      playbackGain: result.playbackGain,
      deviceRecordings,
    },
    inputs: deviceRecordings.map((device) => ({
      inputId: device.inputId,
      wavBlobKey: device.wavBlobKey,
      sampleRate: device.sampleRate,
      channels: device.channels,
    })),
  };
};
