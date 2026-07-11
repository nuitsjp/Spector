import type {
  Direction,
  PlaybackGain,
  RecordingStatus,
  SignalLevelDbfs,
} from './types';

export const RECORDING_SCHEMA_VERSION = 1 as const;

export interface DeviceRecording {
  readonly inputId: string;
  readonly displayName: string;
  readonly sampleRate: number;
  readonly channels: number;
  readonly wavBlobKey: string;
  readonly min: SignalLevelDbfs;
  readonly avg: SignalLevelDbfs;
  readonly max: SignalLevelDbfs;
  readonly aboveMinus30Ratio: number;
  readonly aboveMinus40Ratio: number;
  readonly aboveMinus50Ratio: number;
}

export interface RecordingRecord {
  readonly schemaVersion: typeof RECORDING_SCHEMA_VERSION;
  readonly id: string;
  readonly status: RecordingStatus;
  /** ISO 8601 date-time string. */
  readonly startedAt: string;
  /** ISO 8601 date-time string. */
  readonly endedAt: string;
  readonly primaryInputId: string;
  readonly direction: Direction;
  readonly voice: boolean;
  readonly testNoise: boolean;
  readonly playbackGain: PlaybackGain;
  readonly deviceRecordings: readonly DeviceRecording[];
}
