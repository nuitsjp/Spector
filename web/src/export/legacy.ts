import {
  DIRECTIONS,
  RECORDING_SCHEMA_VERSION,
  createCalibrationLevelDb,
  createPlaybackGain,
  createSignalLevelDbfs,
  type Direction,
  type RecordingRecord,
  type SpectorSettings,
} from '../domain';
import {
  createDefaultSettings,
  decodeWaveFile,
  type LegacyImportBatch,
  type LegacyImportCommitResult,
  type RecordingWithAudio,
  type StorageRepository,
  type StoredAudioBlob,
} from '../storage';
import {
  ArchiveValidationError,
  decodeJson,
  readZipBlob,
  replaceWindowsInvalidFileNameCharacters,
  type ArchiveFiles,
} from './archive';
import {
  asArray,
  asBoolean,
  asNumber,
  asObject,
  asString,
} from './runtimeValidation';

export interface LegacyImportOptions {
  readonly idFactory?: () => string;
  readonly now?: () => Date;
}

const findField = (
  object: Record<string, unknown>,
  name: string,
  label: string,
): unknown => {
  const matchingKey = Object.keys(object).find(
    (key) => key.toLocaleLowerCase('en-US') === name.toLocaleLowerCase('en-US'),
  );
  if (matchingKey === undefined) {
    throw new ArchiveValidationError(`${label}.${name} がありません。`);
  }
  return object[matchingKey];
};

const findOptionalField = (
  object: Record<string, unknown>,
  name: string,
): unknown => {
  const matchingKey = Object.keys(object).find(
    (key) => key.toLocaleLowerCase('en-US') === name.toLocaleLowerCase('en-US'),
  );
  return matchingKey === undefined ? undefined : object[matchingKey];
};

const unwrapUnitValue = (value: unknown): unknown => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return value;
  const object = value as Record<string, unknown>;
  return findOptionalField(object, 'value') ?? value;
};

const legacyNumber = (value: unknown, label: string): number =>
  asNumber(unwrapUnitValue(value), label);

const legacyString = (value: unknown, label: string): string =>
  asString(unwrapUnitValue(value), label);

const legacyId = (value: unknown, label: string): string => {
  const id = legacyString(value, label);
  return id.startsWith('legacy:') ? id : `legacy:${id}`;
};

const parseDurationSeconds = (value: unknown, label: string): number => {
  const duration = asString(value, label);
  const match = /^(?:(\d+)\.)?(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(
    duration,
  );
  if (match === null) {
    throw new ArchiveValidationError(
      `${label} は.NET TimeSpan形式ではありません。`,
    );
  }
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  const seconds = Number(match[4]);
  const fraction = Number(`0.${match[5] ?? 0}`);
  if (hours > 23 || minutes > 59 || seconds > 59) {
    throw new ArchiveValidationError(`${label} が不正です。`);
  }
  const total =
    days * 86_400 + hours * 3_600 + minutes * 60 + seconds + fraction;
  if (total <= 0)
    throw new ArchiveValidationError(`${label} は0より大きい必要があります。`);
  return total;
};

const parseLegacySettings = (value: unknown): SpectorSettings => {
  const settings = asObject(value, 'Settings.json');
  const recorder = asObject(
    findField(settings, 'recorder', 'Settings.json'),
    'recorder',
  );
  const recordDeviceId = findOptionalField(settings, 'recordDeviceId');
  const playbackDeviceId = findOptionalField(settings, 'playbackDeviceId');
  const devices = asArray(
    findField(settings, 'devices', 'Settings.json'),
    'devices',
  );
  const calibrationPoints = asArray(
    findField(settings, 'calibrationPoints', 'Settings.json'),
    'calibrationPoints',
  );

  return {
    primaryInputId:
      recordDeviceId === null || recordDeviceId === undefined
        ? null
        : legacyId(recordDeviceId, 'recordDeviceId'),
    playbackOutputId:
      playbackDeviceId === null || playbackDeviceId === undefined
        ? null
        : legacyId(playbackDeviceId, 'playbackDeviceId'),
    playbackGain: createDefaultSettings().playbackGain,
    recorder: {
      recordingDurationSeconds: parseDurationSeconds(
        findField(recorder, 'recordingSpan', 'recorder'),
        'recorder.recordingSpan',
      ),
      voice: asBoolean(
        findField(recorder, 'withVoice', 'recorder'),
        'recorder.withVoice',
      ),
      testNoise: asBoolean(
        findField(recorder, 'withBuzz', 'recorder'),
        'recorder.withBuzz',
      ),
    },
    devices: devices.map((valueToParse, index) => {
      const device = asObject(valueToParse, `devices[${index}]`);
      return {
        id: legacyId(
          findField(device, 'id', `devices[${index}]`),
          `devices[${index}].id`,
        ),
        name: legacyString(
          findField(device, 'name', `devices[${index}]`),
          `devices[${index}].name`,
        ),
        measure: asBoolean(
          findField(device, 'measure', `devices[${index}]`),
          `devices[${index}].measure`,
        ),
      };
    }),
    calibrationPoints: calibrationPoints.map((valueToParse, index) => {
      const point = asObject(valueToParse, `calibrationPoints[${index}]`);
      const decibel =
        findOptionalField(point, 'decibel') ??
        findField(point, 'criterion', `calibrationPoints[${index}]`);
      return {
        levelDb: createCalibrationLevelDb(
          legacyNumber(decibel, `calibrationPoints[${index}].decibel`),
        ),
        example:
          typeof findField(point, 'example', `calibrationPoints[${index}]`) ===
          'string'
            ? (findField(
                point,
                'example',
                `calibrationPoints[${index}]`,
              ) as string)
            : (() => {
                throw new ArchiveValidationError(
                  `calibrationPoints[${index}].example が不正です。`,
                );
              })(),
        playbackGain: createPlaybackGain(
          legacyNumber(
            findField(point, 'volumeLevel', `calibrationPoints[${index}]`),
            `calibrationPoints[${index}].volumeLevel`,
          ),
        ),
      };
    }),
  };
};

const parseLegacyDirection = (value: unknown, label: string): Direction => {
  const unwrapped = unwrapUnitValue(value);
  const numeric =
    typeof unwrapped === 'string'
      ? Number(unwrapped.replace(/^R/i, ''))
      : legacyNumber(unwrapped, label);
  if (!DIRECTIONS.includes(numeric as Direction)) {
    throw new ArchiveValidationError(`${label} が不正です。`);
  }
  return numeric as Direction;
};

const parseLegacyDate = (value: unknown, label: string): string => {
  const raw = asString(value, label);
  const date = new Date(raw);
  if (!Number.isFinite(date.valueOf())) {
    throw new ArchiveValidationError(`${label} が不正な日時です。`);
  }
  return date.toISOString();
};

const legacyWaveName = (name: string): string =>
  `${replaceWindowsInvalidFileNameCharacters(name)}.wav`;

const legacyRatio = (value: unknown, label: string): number => {
  const ratio = legacyNumber(value, label);
  if (ratio < 0 || ratio > 1) {
    throw new ArchiveValidationError(
      `${label} は0から1の範囲である必要があります。`,
    );
  }
  return ratio;
};

const createCaseInsensitivePathMap = (
  files: ArchiveFiles,
): Map<string, string> => {
  const result = new Map<string, string>();
  for (const path of Object.keys(files)) {
    const key = path.toLocaleLowerCase('en-US');
    if (result.has(key)) {
      throw new ArchiveValidationError(
        `ZIP内のパスが大文字小文字だけ異なります: ${path}`,
      );
    }
    result.set(key, path);
  }
  return result;
};

const hashLegacyRecord = async (
  relativePath: string,
  json: Uint8Array,
): Promise<string> => {
  const path = new TextEncoder().encode(relativePath);
  const source = new Uint8Array(path.length + json.length);
  source.set(path);
  source.set(json, path.length);
  const digest = await crypto.subtle.digest('SHA-256', source);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const findLegacyWave = (
  files: ArchiveFiles,
  paths: ReadonlyMap<string, string>,
  recordPath: string,
  displayName: string,
): { readonly path: string; readonly blob: Blob } => {
  const separator = recordPath.lastIndexOf('/');
  const directory = separator < 0 ? '' : recordPath.slice(0, separator + 1);
  const expectedPath = `${directory}${legacyWaveName(displayName)}`;
  const actualPath = paths.get(expectedPath.toLocaleLowerCase('en-US'));
  if (actualPath === undefined) {
    throw new ArchiveValidationError(
      `${recordPath} が参照するWAVがありません: ${expectedPath}`,
    );
  }
  const bytes = files[actualPath];
  if (bytes === undefined)
    throw new ArchiveValidationError(`WAVがありません: ${actualPath}`);
  return {
    path: actualPath,
    blob: new Blob([Uint8Array.from(bytes)], { type: 'audio/wav' }),
  };
};

const parseLegacyRecord = async (
  value: unknown,
  recordPath: string,
  files: ArchiveFiles,
  paths: ReadonlyMap<string, string>,
  idFactory: () => string,
): Promise<readonly RecordingWithAudio[]> => {
  const oldRecord = asObject(value, recordPath);
  const primaryInputId = legacyId(
    findField(oldRecord, 'measureDeviceId', recordPath),
    `${recordPath}.measureDeviceId`,
  );
  const startedAt = parseLegacyDate(
    findField(oldRecord, 'startTime', recordPath),
    `${recordPath}.startTime`,
  );
  const endedAt = parseLegacyDate(
    findField(oldRecord, 'stopTime', recordPath),
    `${recordPath}.stopTime`,
  );
  const processes = asArray(
    findField(oldRecord, 'recordProcesses', recordPath),
    `${recordPath}.recordProcesses`,
  );
  if (processes.length === 0) {
    throw new ArchiveValidationError(
      `${recordPath}.recordProcesses が空です。`,
    );
  }

  const decodedWaves = new Map<
    string,
    Awaited<ReturnType<typeof decodeWaveFile>>
  >();
  const recordings: RecordingWithAudio[] = [];
  for (const [processIndex, processValue] of processes.entries()) {
    const process = asObject(
      processValue,
      `${recordPath}.recordProcesses[${processIndex}]`,
    );
    const recordId = idFactory();
    const deviceValues = asArray(
      findField(
        process,
        'recordByDevices',
        `${recordPath}.recordProcesses[${processIndex}]`,
      ),
      `${recordPath}.recordProcesses[${processIndex}].recordByDevices`,
    );
    const audioBlobs: StoredAudioBlob[] = [];
    const deviceRecordings = [];
    for (const [deviceIndex, deviceValue] of deviceValues.entries()) {
      const label = `${recordPath}.recordProcesses[${processIndex}].recordByDevices[${deviceIndex}]`;
      const device = asObject(deviceValue, label);
      const displayName = legacyString(
        findField(device, 'name', label),
        `${label}.name`,
      );
      const waveSource = findLegacyWave(files, paths, recordPath, displayName);
      let decoded = decodedWaves.get(waveSource.path);
      if (decoded === undefined) {
        decoded = await decodeWaveFile(waveSource.blob);
        decodedWaves.set(waveSource.path, decoded);
      }
      const wavBlobKey = `${recordId}/legacy-${deviceIndex + 1}.wav`;
      audioBlobs.push({
        key: wavBlobKey,
        recordingId: recordId,
        blob: decoded.blob,
      });
      deviceRecordings.push({
        inputId: legacyId(findField(device, 'id', label), `${label}.id`),
        displayName,
        sampleRate: decoded.sampleRate,
        channels: decoded.channels,
        wavBlobKey,
        min: createSignalLevelDbfs(
          legacyNumber(findField(device, 'min', label), `${label}.min`),
        ),
        avg: createSignalLevelDbfs(
          legacyNumber(findField(device, 'avg', label), `${label}.avg`),
        ),
        max: createSignalLevelDbfs(
          legacyNumber(findField(device, 'max', label), `${label}.max`),
        ),
        aboveMinus30Ratio: legacyRatio(
          findField(device, 'minus30db', label),
          `${label}.minus30db`,
        ),
        aboveMinus40Ratio: legacyRatio(
          findField(device, 'minus40db', label),
          `${label}.minus40db`,
        ),
        aboveMinus50Ratio: legacyRatio(
          findField(device, 'minus50db', label),
          `${label}.minus50db`,
        ),
      });
    }

    const record: RecordingRecord = {
      schemaVersion: RECORDING_SCHEMA_VERSION,
      id: recordId,
      status: 'complete',
      startedAt,
      endedAt,
      primaryInputId,
      direction: parseLegacyDirection(
        findField(
          process,
          'direction',
          `${recordPath}.recordProcesses[${processIndex}]`,
        ),
        `${recordPath}.recordProcesses[${processIndex}].direction`,
      ),
      voice: asBoolean(
        findField(
          process,
          'withVoice',
          `${recordPath}.recordProcesses[${processIndex}]`,
        ),
        `${recordPath}.recordProcesses[${processIndex}].withVoice`,
      ),
      testNoise: asBoolean(
        findField(
          process,
          'withBuzz',
          `${recordPath}.recordProcesses[${processIndex}]`,
        ),
        `${recordPath}.recordProcesses[${processIndex}].withBuzz`,
      ),
      playbackGain: createPlaybackGain(
        legacyNumber(
          findField(
            process,
            'volumeLevel',
            `${recordPath}.recordProcesses[${processIndex}]`,
          ),
          `${recordPath}.recordProcesses[${processIndex}].volumeLevel`,
        ),
      ),
      deviceRecordings,
    };
    recordings.push({ record, audioBlobs });
  }
  return recordings;
};

export const parseLegacyWpfArchive = async (
  blob: Blob,
  options: LegacyImportOptions = {},
): Promise<LegacyImportBatch> => {
  const files = await readZipBlob(blob);
  const settingsBytes = files['Settings.json'];
  if (settingsBytes === undefined) {
    throw new ArchiveValidationError(
      'ZIPのルートにSettings.jsonがありません。',
    );
  }
  const settings = parseLegacySettings(
    decodeJson(settingsBytes, 'Settings.json'),
  );
  const recordPaths = Object.keys(files)
    .filter((path) => /^Record\/.+\/record\.json$/i.test(path))
    .sort((left, right) => left.localeCompare(right));
  if (recordPaths.length === 0) {
    throw new ArchiveValidationError(
      'ZIPにRecord/**/record.jsonがありません。',
    );
  }
  const paths = createCaseInsensitivePathMap(files);
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  const importedAt = (options.now ?? (() => new Date()))().toISOString();
  const imports: LegacyImportBatch['imports'][number][] = [];

  for (const recordPath of recordPaths) {
    const recordBytes = files[recordPath];
    if (recordBytes === undefined)
      throw new ArchiveValidationError(`${recordPath} がありません。`);
    const recordings = await parseLegacyRecord(
      decodeJson(recordBytes, recordPath),
      recordPath,
      files,
      paths,
      idFactory,
    );
    const hash = await hashLegacyRecord(recordPath, recordBytes);
    imports.push({
      provenance: {
        hash,
        relativePath: recordPath,
        importedAt,
        recordingIds: recordings.map((recording) => recording.record.id),
      },
      recordings,
    });
  }
  return { settings, imports };
};

export const importLegacyWpfArchive = async (
  repository: Pick<StorageRepository, 'commitLegacyImport'>,
  blob: Blob,
  options?: LegacyImportOptions,
): Promise<LegacyImportCommitResult> => {
  const batch = await parseLegacyWpfArchive(blob, options);
  return repository.commitLegacyImport(batch);
};
