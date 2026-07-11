// @vitest-environment node

import 'fake-indexeddb/auto';

import { deleteDB } from 'idb';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createDefaultSettings,
  openSpectorDatabase,
  StorageQuotaService,
  StorageRepository,
} from '../storage';
import { createTestRecord } from '../storage/testFixtures';
import { createAnalysisArchive } from './analysis';
import { createZipBlob, jsonBytes, readZipBlob } from './archive';
import { createWebBackupArchive, restoreWebBackupArchive } from './backup';
import { createRecordingArchive } from './recording';

const databases: {
  readonly name: string;
  readonly repository: StorageRepository;
}[] = [];

const createRepository = (): StorageRepository => {
  const name = `spector-export-test-${crypto.randomUUID()}`;
  const repository = new StorageRepository(
    openSpectorDatabase(name),
    new StorageQuotaService(undefined),
  );
  databases.push({ name, repository });
  return repository;
};

afterEach(async () => {
  for (const database of databases.splice(0)) {
    await database.repository.close();
    await deleteDB(database.name);
  }
});

describe('ZIP exports', () => {
  it('packages analysis Markdown and PNG', async () => {
    const archive = await createAnalysisArchive({
      markdown: '# 解析\n',
      chartPng: new Blob([Uint8Array.of(137, 80, 78, 71)], {
        type: 'image/png',
      }),
      baseName: '比較/結果',
    });
    const files = await readZipBlob(archive);

    expect(Object.keys(files)).toEqual(['比較_結果.md', '比較_結果.png']);
    expect(new TextDecoder().decode(files['比較_結果.md'])).toBe('# 解析\n');
    expect(files['比較_結果.png']).toEqual(Uint8Array.of(137, 80, 78, 71));
  });

  it('packages one schema-v1 record and all referenced WAV files', async () => {
    const record = createTestRecord();
    const archive = await createRecordingArchive({
      record,
      audioBlobs: [
        {
          key: record.deviceRecordings[0]!.wavBlobKey,
          recordingId: record.id,
          blob: new Blob(['wave']),
        },
      ],
    });
    const files = await readZipBlob(archive);

    expect(JSON.parse(new TextDecoder().decode(files['record.json']))).toEqual(
      record,
    );
    expect(new TextDecoder().decode(files['audio/1-マイク.wav'])).toBe('wave');
  });

  it('round-trips settings, recordings, and WAV files through a web backup', async () => {
    const source = createRepository();
    const target = createRepository();
    const settings = { ...createDefaultSettings(), primaryInputId: 'input-1' };
    const record = createTestRecord();
    const audio = new Blob([Uint8Array.of(1, 2, 3)], { type: 'audio/wav' });
    await source.saveSettings(settings);
    await source.saveRecording(record, [
      { key: record.deviceRecordings[0]!.wavBlobKey, blob: audio },
    ]);

    const result = await restoreWebBackupArchive(
      target,
      await createWebBackupArchive(source),
    );
    expect(result).toEqual({ recordings: 1, audioFiles: 1 });
    expect(await target.loadSettings()).toEqual(settings);
    expect(await target.getRecording(record.id)).toEqual(record);
    expect(
      new Uint8Array(
        await (await target.getAudioBlob(
          record.deviceRecordings[0]!.wavBlobKey,
        ))!.arrayBuffer(),
      ),
    ).toEqual(Uint8Array.of(1, 2, 3));
  });

  it('does not replace existing data when a backup is missing a WAV', async () => {
    const repository = createRepository();
    const existing = createTestRecord('existing');
    await repository.saveRecording(existing, [
      {
        key: existing.deviceRecordings[0]!.wavBlobKey,
        blob: new Blob(['existing']),
      },
    ]);
    const imported = createTestRecord('imported');
    const corruptBackup = createZipBlob({
      'spector-backup.json': jsonBytes({
        format: 'spector-web-backup',
        schemaVersion: 1,
        createdAt: '2026-07-11T00:00:00.000Z',
        settingsPath: 'settings.json',
        recordings: [
          {
            recordPath: 'records/1/record.json',
            audio: [
              {
                key: imported.deviceRecordings[0]!.wavBlobKey,
                path: 'missing.wav',
              },
            ],
          },
        ],
      }),
      'settings.json': jsonBytes(createDefaultSettings()),
      'records/1/record.json': jsonBytes(imported),
    });

    await expect(
      restoreWebBackupArchive(repository, corruptBackup),
    ).rejects.toThrow('missing.wav');
    expect(await repository.getRecording(existing.id)).toEqual(existing);
    expect(await repository.getRecording(imported.id)).toBeUndefined();
  });
});
