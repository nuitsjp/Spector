import type {
  RecordingWithAudio,
  StorageRepository,
  StorageSnapshot,
  StoredAudioBlob,
} from '../storage';
import {
  ArchiveValidationError,
  blobBytes,
  createZipBlob,
  decodeJson,
  jsonBytes,
  readZipBlob,
} from './archive';
import {
  asArray,
  asNumber,
  asObject,
  asString,
  parseRecordingRecord,
  parseSettings,
} from './runtimeValidation';

const BACKUP_FORMAT = 'spector-web-backup';
const BACKUP_SCHEMA_VERSION = 1;

interface BackupAudioManifest {
  readonly key: string;
  readonly path: string;
}

interface BackupRecordingManifest {
  readonly recordPath: string;
  readonly audio: readonly BackupAudioManifest[];
}

interface BackupManifest {
  readonly format: typeof BACKUP_FORMAT;
  readonly schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  readonly createdAt: string;
  readonly settingsPath: string;
  readonly recordings: readonly BackupRecordingManifest[];
}

export interface BackupRestoreResult {
  readonly recordings: number;
  readonly audioFiles: number;
}

export const createWebBackupArchive = async (
  repository: Pick<StorageRepository, 'snapshot'>,
): Promise<Blob> => {
  const snapshot = await repository.snapshot();
  const files: Record<string, Uint8Array> = {
    'settings.json': jsonBytes(snapshot.settings),
  };
  const recordings: BackupRecordingManifest[] = [];
  let audioIndex = 0;

  for (const [recordingIndex, recording] of snapshot.recordings.entries()) {
    const recordPath = `records/${recordingIndex + 1}/record.json`;
    files[recordPath] = jsonBytes(recording.record);
    const audio: BackupAudioManifest[] = [];
    for (const item of recording.audioBlobs) {
      audioIndex += 1;
      const path = `audio/${audioIndex}.wav`;
      files[path] = await blobBytes(item.blob);
      audio.push({ key: item.key, path });
    }
    recordings.push({ recordPath, audio });
  }

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    settingsPath: 'settings.json',
    recordings,
  };
  files['spector-backup.json'] = jsonBytes(manifest);
  return createZipBlob(files);
};

const requireFile = (
  files: Readonly<Record<string, Uint8Array>>,
  path: string,
): Uint8Array => {
  const bytes = files[path];
  if (bytes === undefined) {
    throw new ArchiveValidationError(`ZIP内に ${path} がありません。`);
  }
  return bytes;
};

const parseManifest = (value: unknown): BackupManifest => {
  const manifest = asObject(value, 'spector-backup.json');
  if (manifest.format !== BACKUP_FORMAT) {
    throw new ArchiveValidationError(
      'このZIPはSpector Webバックアップではありません。',
    );
  }
  if (
    asNumber(manifest.schemaVersion, 'schemaVersion') !== BACKUP_SCHEMA_VERSION
  ) {
    throw new ArchiveValidationError('対応していないバックアップ版です。');
  }
  const createdAt = asString(manifest.createdAt, 'createdAt');
  if (!Number.isFinite(Date.parse(createdAt))) {
    throw new ArchiveValidationError('createdAtが不正です。');
  }

  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    createdAt,
    settingsPath: asString(manifest.settingsPath, 'settingsPath'),
    recordings: asArray(manifest.recordings, 'recordings').map(
      (entry, index) => {
        const recording = asObject(entry, `recordings[${index}]`);
        return {
          recordPath: asString(
            recording.recordPath,
            `recordings[${index}].recordPath`,
          ),
          audio: asArray(recording.audio, `recordings[${index}].audio`).map(
            (audioEntry, audioIndex) => {
              const audio = asObject(
                audioEntry,
                `recordings[${index}].audio[${audioIndex}]`,
              );
              return {
                key: asString(
                  audio.key,
                  `recordings[${index}].audio[${audioIndex}].key`,
                ),
                path: asString(
                  audio.path,
                  `recordings[${index}].audio[${audioIndex}].path`,
                ),
              };
            },
          ),
        };
      },
    ),
  };
};

export const parseWebBackupArchive = async (
  blob: Blob,
): Promise<StorageSnapshot> => {
  const files = await readZipBlob(blob);
  const manifest = parseManifest(
    decodeJson(
      requireFile(files, 'spector-backup.json'),
      'spector-backup.json',
    ),
  );
  const settings = parseSettings(
    decodeJson(
      requireFile(files, manifest.settingsPath),
      manifest.settingsPath,
    ),
  );
  const recordings: RecordingWithAudio[] = [];
  const recordIds = new Set<string>();
  const audioKeys = new Set<string>();

  for (const [index, entry] of manifest.recordings.entries()) {
    const record = parseRecordingRecord(
      decodeJson(requireFile(files, entry.recordPath), entry.recordPath),
      `recordings[${index}]`,
    );
    if (recordIds.has(record.id)) {
      throw new ArchiveValidationError(`記録IDが重複しています: ${record.id}`);
    }
    recordIds.add(record.id);

    const audioBlobs: StoredAudioBlob[] = entry.audio.map((audio) => {
      if (audioKeys.has(audio.key)) {
        throw new ArchiveValidationError(
          `WAVキーが重複しています: ${audio.key}`,
        );
      }
      audioKeys.add(audio.key);
      return {
        key: audio.key,
        recordingId: record.id,
        blob: new Blob([Uint8Array.from(requireFile(files, audio.path))], {
          type: 'audio/wav',
        }),
      };
    });
    const expectedKeys = new Set(
      record.deviceRecordings.map((device) => device.wavBlobKey),
    );
    const actualKeys = new Set(audioBlobs.map((audio) => audio.key));
    if (
      expectedKeys.size !== actualKeys.size ||
      [...expectedKeys].some((key) => !actualKeys.has(key))
    ) {
      throw new ArchiveValidationError(
        `記録 ${record.id} のWAV対応表が不正です。`,
      );
    }
    recordings.push({ record, audioBlobs });
  }

  return { settings, recordings };
};

export const restoreWebBackupArchive = async (
  repository: Pick<StorageRepository, 'replaceWithSnapshot'>,
  blob: Blob,
): Promise<BackupRestoreResult> => {
  const snapshot = await parseWebBackupArchive(blob);
  await repository.replaceWithSnapshot(snapshot);
  return {
    recordings: snapshot.recordings.length,
    audioFiles: snapshot.recordings.reduce(
      (count, recording) => count + recording.audioBlobs.length,
      0,
    ),
  };
};
