// @vitest-environment node

import 'fake-indexeddb/auto';

import { deleteDB } from 'idb';
import { afterEach, describe, expect, it } from 'vitest';

import {
  encodePcm16Wave,
  openSpectorDatabase,
  StorageQuotaService,
  StorageRepository,
} from '../storage';
import { blobBytes, createZipBlob, jsonBytes } from './archive';
import { importLegacyWpfArchive } from './legacy';

const databases: {
  readonly name: string;
  readonly repository: StorageRepository;
}[] = [];

const createRepository = (): StorageRepository => {
  const name = `spector-legacy-test-${crypto.randomUUID()}`;
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

const legacySettings = {
  recorderHost: 'localhost',
  recordDeviceId: 'measure-id',
  playbackDeviceId: 'speaker-id',
  enableAWeighting: true,
  enableFastTimeWeighting: true,
  recorder: {
    recordingSpan: '00:00:30',
    outputDirectory: 'Record',
    withVoice: true,
    withBuzz: false,
  },
  devices: [{ id: 'measure-id', name: 'Mic:1', measure: true }],
  calibrationPoints: [
    { criterion: 40, example: '図書館', volumeLevel: 0.4, decibel: 40 },
  ],
};

const legacyRecord = (direction: number) => ({
  MeasureDeviceId: 'measure-id',
  StartTime: '2026-07-11T09:00:00.000Z',
  StopTime: '2026-07-11T09:00:30.000Z',
  RecordProcesses: [
    {
      Direction: `R${direction}`,
      WithVoice: true,
      WithBuzz: false,
      VolumeLevel: 0.4,
      RecordByDevices: [
        {
          Id: 'measure-id',
          Name: 'Mic:1',
          SystemName: 'Microphone Array',
          Min: -60,
          Avg: -40,
          Max: -20,
          Minus30db: 0.1,
          Minus40db: 0.4,
          Minus50db: 0.8,
        },
      ],
    },
  ],
});

const camelCaseKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(camelCaseKeys);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      `${key[0]!.toLowerCase()}${key.slice(1)}`,
      camelCaseKeys(item),
    ]),
  );
};

const createLegacyArchive = async (
  records: readonly {
    readonly path: string;
    readonly direction: number;
    readonly withWave: boolean;
  }[],
): Promise<Blob> => {
  const files: Record<string, Uint8Array> = {
    'Settings.json': jsonBytes(legacySettings),
  };
  const wav = await blobBytes(
    encodePcm16Wave(Int16Array.of(-10_000, 0, 10_000), 48_000, 1),
  );
  for (const record of records) {
    files[`${record.path}/record.json`] = jsonBytes(
      legacyRecord(record.direction),
    );
    if (record.withWave) files[`${record.path}/Mic_1.wav`] = wav;
  }
  return createZipBlob(files);
};

describe('legacy WPF import', () => {
  it('maps camelCase settings and PascalCase records, preserving WAV and names', async () => {
    const repository = createRepository();
    let nextId = 0;
    const archive = await createLegacyArchive([
      { path: 'Record/2026-07-11_09-00-00', direction: 45, withWave: true },
    ]);
    const result = await importLegacyWpfArchive(repository, archive, {
      idFactory: () => `imported-${++nextId}`,
      now: () => new Date('2026-07-11T10:00:00.000Z'),
    });

    expect(result).toEqual({
      imported: 1,
      skipped: 0,
      recordingIds: ['imported-1'],
    });
    expect(await repository.loadSettings()).toEqual(
      expect.objectContaining({
        primaryInputId: 'legacy:measure-id',
        playbackOutputId: 'legacy:speaker-id',
        recorder: {
          recordingDurationSeconds: 30,
          voice: true,
          testNoise: false,
        },
      }),
    );
    const record = await repository.getRecording('imported-1');
    expect(record).toEqual(
      expect.objectContaining({
        direction: 45,
        voice: true,
        testNoise: false,
        playbackGain: 0.4,
        primaryInputId: 'legacy:measure-id',
      }),
    );
    expect(record!.deviceRecordings[0]).toEqual(
      expect.objectContaining({
        inputId: 'legacy:measure-id',
        displayName: 'Mic:1',
        sampleRate: 48_000,
        channels: 1,
      }),
    );
    expect(
      await repository.getAudioBlob(record!.deviceRecordings[0]!.wavBlobKey),
    ).toBeDefined();

    const duplicate = await importLegacyWpfArchive(repository, archive, {
      idFactory: () => `unused-${++nextId}`,
      now: () => new Date('2026-07-11T11:00:00.000Z'),
    });
    expect(duplicate).toEqual({ imported: 0, skipped: 1, recordingIds: [] });
    expect(await repository.listRecordings()).toHaveLength(1);
  });

  it('rejects the whole archive before writing when a later record misses its WAV', async () => {
    const repository = createRepository();
    const archive = await createLegacyArchive([
      { path: 'Record/2026-07-11_09-00-00', direction: 0, withWave: true },
      { path: 'Record/2026-07-11_10-00-00', direction: 90, withWave: false },
    ]);

    await expect(importLegacyWpfArchive(repository, archive)).rejects.toThrow(
      'WAVがありません',
    );
    expect(await repository.listRecordings()).toHaveLength(0);
  });

  it('accepts camelCase record JSON', async () => {
    const repository = createRepository();
    const archive = createZipBlob({
      'Settings.json': jsonBytes(legacySettings),
      'Record/camel/record.json': jsonBytes(camelCaseKeys(legacyRecord(135))),
      'Record/camel/Mic_1.wav': await blobBytes(
        encodePcm16Wave(Int16Array.of(0), 44_100, 1),
      ),
    });

    await importLegacyWpfArchive(repository, archive, {
      idFactory: () => 'camel-record',
    });
    expect(await repository.getRecording('camel-record')).toEqual(
      expect.objectContaining({ direction: 135 }),
    );
  });

  it('rolls back all writes if the IndexedDB transaction fails', async () => {
    const repository = createRepository();
    const archive = await createLegacyArchive([
      { path: 'Record/first', direction: 0, withWave: true },
      { path: 'Record/second', direction: 90, withWave: true },
    ]);

    await expect(
      importLegacyWpfArchive(repository, archive, {
        idFactory: () => 'duplicate-id',
      }),
    ).rejects.toThrow();
    expect(await repository.listRecordings()).toHaveLength(0);

    let id = 0;
    await expect(
      importLegacyWpfArchive(repository, archive, {
        idFactory: () => `valid-${++id}`,
      }),
    ).resolves.toEqual({
      imported: 2,
      skipped: 0,
      recordingIds: ['valid-1', 'valid-2'],
    });
  });

  it('rejects malformed JSON and invalid ZIP data without writing', async () => {
    const repository = createRepository();
    const malformed = createZipBlob({
      'Settings.json': jsonBytes(legacySettings),
      'Record/broken/record.json': new TextEncoder().encode('{'),
    });

    await expect(importLegacyWpfArchive(repository, malformed)).rejects.toThrow(
      '正しいJSON',
    );
    await expect(
      importLegacyWpfArchive(repository, new Blob(['not zip'])),
    ).rejects.toThrow('ZIPファイルを読み込めません');
    expect(await repository.listRecordings()).toHaveLength(0);
  });
});
