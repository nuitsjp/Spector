import {
  DIRECTIONS,
  RECORDING_SCHEMA_VERSION,
  createCalibrationLevelDb,
  createPlaybackGain,
  createSignalLevelDbfs,
  type DeviceRecording,
  type RecordingRecord,
  type SpectorSettings,
} from '../domain';
import { ArchiveValidationError } from './archive';

export const asObject = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ArchiveValidationError(
      `${label} はオブジェクトである必要があります。`,
    );
  }
  return value as Record<string, unknown>;
};

export const asString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ArchiveValidationError(
      `${label} は空でない文字列である必要があります。`,
    );
  }
  return value;
};

export const asBoolean = (value: unknown, label: string): boolean => {
  if (typeof value !== 'boolean') {
    throw new ArchiveValidationError(`${label} は真偽値である必要があります。`);
  }
  return value;
};

export const asNumber = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ArchiveValidationError(
      `${label} は有限な数値である必要があります。`,
    );
  }
  return value;
};

export const asArray = (value: unknown, label: string): readonly unknown[] => {
  if (!Array.isArray(value)) {
    throw new ArchiveValidationError(`${label} は配列である必要があります。`);
  }
  return value;
};

const parseIsoDate = (value: unknown, label: string): string => {
  const date = asString(value, label);
  if (!Number.isFinite(Date.parse(date))) {
    throw new ArchiveValidationError(
      `${label} はISO 8601日時である必要があります。`,
    );
  }
  return date;
};

const parseRatio = (value: unknown, label: string): number => {
  const ratio = asNumber(value, label);
  if (ratio < 0 || ratio > 1) {
    throw new ArchiveValidationError(
      `${label} は0から1の範囲である必要があります。`,
    );
  }
  return ratio;
};

const parseDeviceRecording = (
  value: unknown,
  label: string,
): DeviceRecording => {
  const item = asObject(value, label);
  const sampleRate = asNumber(item.sampleRate, `${label}.sampleRate`);
  const channels = asNumber(item.channels, `${label}.channels`);
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new ArchiveValidationError(`${label}.sampleRate が不正です。`);
  }
  if (!Number.isInteger(channels) || channels <= 0) {
    throw new ArchiveValidationError(`${label}.channels が不正です。`);
  }

  return {
    inputId: asString(item.inputId, `${label}.inputId`),
    displayName: asString(item.displayName, `${label}.displayName`),
    sampleRate,
    channels,
    wavBlobKey: asString(item.wavBlobKey, `${label}.wavBlobKey`),
    min: createSignalLevelDbfs(asNumber(item.min, `${label}.min`)),
    avg: createSignalLevelDbfs(asNumber(item.avg, `${label}.avg`)),
    max: createSignalLevelDbfs(asNumber(item.max, `${label}.max`)),
    aboveMinus30Ratio: parseRatio(
      item.aboveMinus30Ratio,
      `${label}.aboveMinus30Ratio`,
    ),
    aboveMinus40Ratio: parseRatio(
      item.aboveMinus40Ratio,
      `${label}.aboveMinus40Ratio`,
    ),
    aboveMinus50Ratio: parseRatio(
      item.aboveMinus50Ratio,
      `${label}.aboveMinus50Ratio`,
    ),
  };
};

export const parseRecordingRecord = (
  value: unknown,
  label = 'record',
): RecordingRecord => {
  const item = asObject(value, label);
  if (item.schemaVersion !== RECORDING_SCHEMA_VERSION) {
    throw new ArchiveValidationError(
      `${label}.schemaVersion は1である必要があります。`,
    );
  }
  if (item.status !== 'complete' && item.status !== 'incomplete') {
    throw new ArchiveValidationError(`${label}.status が不正です。`);
  }
  const direction = asNumber(item.direction, `${label}.direction`);
  if (!DIRECTIONS.includes(direction as (typeof DIRECTIONS)[number])) {
    throw new ArchiveValidationError(`${label}.direction が不正です。`);
  }

  return {
    schemaVersion: RECORDING_SCHEMA_VERSION,
    id: asString(item.id, `${label}.id`),
    status: item.status,
    startedAt: parseIsoDate(item.startedAt, `${label}.startedAt`),
    endedAt: parseIsoDate(item.endedAt, `${label}.endedAt`),
    primaryInputId: asString(item.primaryInputId, `${label}.primaryInputId`),
    direction: direction as (typeof DIRECTIONS)[number],
    voice: asBoolean(item.voice, `${label}.voice`),
    testNoise: asBoolean(item.testNoise, `${label}.testNoise`),
    playbackGain: createPlaybackGain(
      asNumber(item.playbackGain, `${label}.playbackGain`),
    ),
    deviceRecordings: asArray(
      item.deviceRecordings,
      `${label}.deviceRecordings`,
    ).map((device, index) =>
      parseDeviceRecording(device, `${label}.deviceRecordings[${index}]`),
    ),
  };
};

export const parseSettings = (
  value: unknown,
  label = 'settings',
): SpectorSettings => {
  const item = asObject(value, label);
  const recorder = asObject(item.recorder, `${label}.recorder`);
  const duration = asNumber(
    recorder.recordingDurationSeconds,
    `${label}.recorder.recordingDurationSeconds`,
  );
  if (duration <= 0) {
    throw new ArchiveValidationError(
      `${label}.recorder.recordingDurationSeconds が不正です。`,
    );
  }

  const nullableString = (
    valueToParse: unknown,
    field: string,
  ): string | null =>
    valueToParse === null ? null : asString(valueToParse, field);

  return {
    primaryInputId: nullableString(
      item.primaryInputId,
      `${label}.primaryInputId`,
    ),
    playbackOutputId: nullableString(
      item.playbackOutputId,
      `${label}.playbackOutputId`,
    ),
    playbackGain: createPlaybackGain(
      asNumber(item.playbackGain, `${label}.playbackGain`),
    ),
    recorder: {
      recordingDurationSeconds: duration,
      voice: asBoolean(recorder.voice, `${label}.recorder.voice`),
      testNoise: asBoolean(recorder.testNoise, `${label}.recorder.testNoise`),
    },
    devices: asArray(item.devices, `${label}.devices`).map((device, index) => {
      const parsed = asObject(device, `${label}.devices[${index}]`);
      return {
        id: asString(parsed.id, `${label}.devices[${index}].id`),
        name: asString(parsed.name, `${label}.devices[${index}].name`),
        measure: asBoolean(
          parsed.measure,
          `${label}.devices[${index}].measure`,
        ),
      };
    }),
    calibrationPoints: asArray(
      item.calibrationPoints,
      `${label}.calibrationPoints`,
    ).map((point, index) => {
      const parsed = asObject(point, `${label}.calibrationPoints[${index}]`);
      return {
        levelDb: createCalibrationLevelDb(
          asNumber(
            parsed.levelDb,
            `${label}.calibrationPoints[${index}].levelDb`,
          ),
        ),
        example:
          typeof parsed.example === 'string'
            ? parsed.example
            : (() => {
                throw new ArchiveValidationError(
                  `${label}.calibrationPoints[${index}].example が不正です。`,
                );
              })(),
        playbackGain: createPlaybackGain(
          asNumber(
            parsed.playbackGain,
            `${label}.calibrationPoints[${index}].playbackGain`,
          ),
        ),
      };
    }),
  };
};
