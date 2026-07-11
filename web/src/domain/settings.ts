import type { CalibrationLevelDb, PlaybackGain } from './types';

export interface RecorderSettings {
  readonly recordingDurationSeconds: number;
  readonly voice: boolean;
  readonly testNoise: boolean;
}

export interface DeviceSettings {
  readonly id: string;
  readonly name: string;
  readonly measure: boolean;
}

export interface CalibrationPoint {
  readonly levelDb: CalibrationLevelDb;
  readonly example: string;
  readonly playbackGain: PlaybackGain;
}

export interface SpectorSettings {
  readonly primaryInputId: string | null;
  readonly playbackOutputId: string | null;
  readonly playbackGain: PlaybackGain;
  readonly recorder: RecorderSettings;
  readonly devices: readonly DeviceSettings[];
  readonly calibrationPoints: readonly CalibrationPoint[];
}
