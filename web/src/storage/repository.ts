import type {
  RecordingAudioBlob,
  RecordingChunk,
  RecordingChunkSink,
  SpectorRepository,
} from '../contracts';
import type { RecordingRecord, SpectorSettings } from '../domain';
import { openSpectorDatabase, type SpectorDatabase } from './database';
import { createDefaultSettings } from './defaults';
import { StorageQuotaService, toStorageDomainError } from './quota';
import type {
  FinalizeAudioInput,
  LegacyImportBatch,
  LegacyImportCommitResult,
  PendingAudioChunk,
  RecordingWithAudio,
  StorageSnapshot,
  StoredAudioBlob,
} from './types';
import { encodePcm16Wave } from './wav';

const SETTINGS_KEY = 'current';

const asStoredAudio = (
  recordingId: string,
  audio: RecordingAudioBlob,
): StoredAudioBlob => ({
  key: audio.key,
  recordingId,
  blob: audio.blob,
});

const concatPcm = (chunks: readonly PendingAudioChunk[]): Int16Array => {
  const length = chunks.reduce((total, chunk) => total + chunk.pcm.length, 0);
  const result = new Int16Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk.pcm, offset);
    offset += chunk.pcm.length;
  }
  return result;
};

const copyPcm16 = (pcm16: ArrayBuffer | ArrayBufferView): Int16Array => {
  const sourceBytes = ArrayBuffer.isView(pcm16)
    ? new Uint8Array(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength)
    : new Uint8Array(pcm16);
  if (sourceBytes.byteLength % Int16Array.BYTES_PER_ELEMENT !== 0) {
    throw new RangeError('PCM16 byte length must be even.');
  }
  const ownedBytes = Uint8Array.from(sourceBytes);
  return new Int16Array(
    ownedBytes.buffer,
    ownedBytes.byteOffset,
    ownedBytes.byteLength / Int16Array.BYTES_PER_ELEMENT,
  );
};

const assertAudioMatchesRecord = (
  record: RecordingRecord,
  audioBlobs: readonly {
    readonly key: string;
    readonly recordingId?: string;
  }[],
): void => {
  const expectedKeys = new Set(
    record.deviceRecordings.map((device) => device.wavBlobKey),
  );
  const actualKeys = new Set(audioBlobs.map((audio) => audio.key));
  if (
    expectedKeys.size !== record.deviceRecordings.length ||
    actualKeys.size !== audioBlobs.length ||
    expectedKeys.size !== actualKeys.size ||
    [...expectedKeys].some((key) => !actualKeys.has(key)) ||
    audioBlobs.some(
      (audio) =>
        audio.recordingId !== undefined && audio.recordingId !== record.id,
    )
  ) {
    throw new Error(`Recording ${record.id} does not match its WAV blobs.`);
  }
};

interface ManagedTransaction {
  readonly done: Promise<unknown>;
  abort(): void;
}

const runTransaction = async <T>(
  transaction: ManagedTransaction,
  operation: () => Promise<T>,
): Promise<T> => {
  try {
    const result = await operation();
    await transaction.done;
    return result;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // A failed IndexedDB request may already have aborted the transaction.
    }
    await transaction.done.catch(() => undefined);
    throw error;
  }
};

export class StorageRepository
  implements SpectorRepository, RecordingChunkSink
{
  private readonly database: Promise<SpectorDatabase>;

  public constructor(
    database: Promise<SpectorDatabase> = openSpectorDatabase(),
    private readonly quota = new StorageQuotaService(),
  ) {
    this.database = database;
  }

  public async close(): Promise<void> {
    (await this.database).close();
  }

  public async loadSettings(): Promise<SpectorSettings> {
    return (
      (await (await this.database).get('settings', SETTINGS_KEY)) ??
      createDefaultSettings()
    );
  }

  public async saveSettings(settings: SpectorSettings): Promise<void> {
    await this.write(async () => {
      await (await this.database).put('settings', settings, SETTINGS_KEY);
    });
  }

  public async listRecordings(): Promise<readonly RecordingRecord[]> {
    const records = await (
      await this.database
    ).getAllFromIndex('records', 'by-started-at');
    return records.reverse();
  }

  public async getRecording(id: string): Promise<RecordingRecord | undefined> {
    return (await this.database).get('records', id);
  }

  public async getRecordingWithAudio(
    id: string,
  ): Promise<RecordingWithAudio | undefined> {
    const database = await this.database;
    const transaction = database.transaction(
      ['records', 'audioBlobs'],
      'readonly',
    );
    return runTransaction(transaction, async () => {
      const [record, audioBlobs] = await Promise.all([
        transaction.objectStore('records').get(id),
        transaction
          .objectStore('audioBlobs')
          .index('by-recording-id')
          .getAll(id),
      ]);
      return record === undefined ? undefined : { record, audioBlobs };
    });
  }

  public async saveRecording(
    record: RecordingRecord,
    audioBlobs: readonly RecordingAudioBlob[],
  ): Promise<void> {
    assertAudioMatchesRecord(record, audioBlobs);
    await this.write(async () => {
      const database = await this.database;
      const transaction = database.transaction(
        ['records', 'audioBlobs'],
        'readwrite',
      );
      await runTransaction(transaction, async () => {
        const audioStore = transaction.objectStore('audioBlobs');
        const previousKeys = await audioStore
          .index('by-recording-id')
          .getAllKeys(record.id);
        await Promise.all(previousKeys.map((key) => audioStore.delete(key)));
        await transaction.objectStore('records').put(record);
        await Promise.all(
          audioBlobs.map((audio) =>
            audioStore.put(asStoredAudio(record.id, audio)),
          ),
        );
      });
    });
  }

  public async deleteRecording(id: string): Promise<void> {
    await this.write(async () => {
      const database = await this.database;
      const transaction = database.transaction(
        ['records', 'audioBlobs'],
        'readwrite',
      );
      await runTransaction(transaction, async () => {
        const audioStore = transaction.objectStore('audioBlobs');
        const keys = await audioStore.index('by-recording-id').getAllKeys(id);
        await Promise.all(keys.map((key) => audioStore.delete(key)));
        await transaction.objectStore('records').delete(id);
      });
    });
  }

  public async getAudioBlob(key: string): Promise<Blob | undefined> {
    return (await (await this.database).get('audioBlobs', key))?.blob;
  }

  public async appendPendingAudioChunk(
    chunk: Omit<PendingAudioChunk, 'id'>,
  ): Promise<number> {
    if (!Number.isSafeInteger(chunk.sequence) || chunk.sequence < 0) {
      throw new RangeError(
        'Pending audio chunk sequence must be non-negative.',
      );
    }
    return this.write(async () =>
      (await this.database).add('pendingAudioChunks', chunk),
    );
  }

  public async writeChunk(chunk: RecordingChunk): Promise<void> {
    await this.appendPendingAudioChunk({
      sessionId: chunk.recordingId,
      inputId: chunk.inputId,
      sequence: chunk.sequence,
      pcm: copyPcm16(chunk.pcm16),
    });
  }

  public async listPendingAudioChunks(
    sessionId: string,
    inputId?: string,
  ): Promise<readonly PendingAudioChunk[]> {
    const database = await this.database;
    const chunks =
      inputId === undefined
        ? await database.getAllFromIndex(
            'pendingAudioChunks',
            'by-session-id',
            sessionId,
          )
        : await database.getAllFromIndex(
            'pendingAudioChunks',
            'by-session-input',
            [sessionId, inputId],
          );
    return chunks.sort((left, right) => left.sequence - right.sequence);
  }

  public async discardPendingAudioChunks(sessionId: string): Promise<void> {
    await this.write(async () => {
      const database = await this.database;
      const transaction = database.transaction(
        'pendingAudioChunks',
        'readwrite',
      );
      await runTransaction(transaction, async () => {
        const store = transaction.objectStore('pendingAudioChunks');
        const keys = await store.index('by-session-id').getAllKeys(sessionId);
        await Promise.all(keys.map((key) => store.delete(key)));
      });
    });
  }

  public async finalizeRecording(
    sessionId: string,
    record: RecordingRecord,
    inputs: readonly FinalizeAudioInput[],
  ): Promise<void> {
    const allChunks = await this.listPendingAudioChunks(sessionId);
    const expectedInputs = new Map(
      record.deviceRecordings.map((device) => [
        device.wavBlobKey,
        device.inputId,
      ]),
    );
    if (
      expectedInputs.size !== inputs.length ||
      inputs.some(
        (input) => expectedInputs.get(input.wavBlobKey) !== input.inputId,
      )
    ) {
      throw new Error('Finalize inputs do not match the recording WAV keys.');
    }
    const audioBlobs = inputs.map((input) => {
      const chunks = allChunks.filter(
        (chunk) => chunk.inputId === input.inputId,
      );
      if (chunks.length === 0) {
        throw new Error(`PCM chunks are missing for input ${input.inputId}.`);
      }
      const expectedSequences = chunks.map((chunk) => chunk.sequence);
      if (expectedSequences.some((sequence, index) => sequence !== index)) {
        throw new Error(
          `PCM chunk sequence is incomplete for input ${input.inputId}.`,
        );
      }
      return {
        key: input.wavBlobKey,
        blob: encodePcm16Wave(
          concatPcm(chunks),
          input.sampleRate,
          input.channels,
        ),
      };
    });

    await this.write(async () => {
      const database = await this.database;
      const transaction = database.transaction(
        ['records', 'audioBlobs', 'pendingAudioChunks'],
        'readwrite',
      );
      await runTransaction(transaction, async () => {
        await transaction.objectStore('records').put(record);
        const audioStore = transaction.objectStore('audioBlobs');
        await Promise.all(
          audioBlobs.map((audio) =>
            audioStore.put(asStoredAudio(record.id, audio)),
          ),
        );
        const pendingStore = transaction.objectStore('pendingAudioChunks');
        const pendingKeys = await pendingStore
          .index('by-session-id')
          .getAllKeys(sessionId);
        await Promise.all(pendingKeys.map((key) => pendingStore.delete(key)));
      });
    });
  }

  public async snapshot(): Promise<StorageSnapshot> {
    const database = await this.database;
    const transaction = database.transaction(
      ['settings', 'records', 'audioBlobs'],
      'readonly',
    );
    const [storedSettings, records, allAudioBlobs] = await runTransaction(
      transaction,
      () =>
        Promise.all([
          transaction.objectStore('settings').get(SETTINGS_KEY),
          transaction.objectStore('records').index('by-started-at').getAll(),
          transaction.objectStore('audioBlobs').getAll(),
        ]),
    );
    const settings = storedSettings ?? createDefaultSettings();
    records.reverse();
    const recordings = records.map((record) => {
      const audioBlobs = allAudioBlobs.filter(
        (audio) => audio.recordingId === record.id,
      );
      assertAudioMatchesRecord(record, audioBlobs);
      return { record, audioBlobs };
    });
    if (
      allAudioBlobs.some(
        (audio) => !records.some((record) => record.id === audio.recordingId),
      )
    ) {
      throw new Error('An orphaned WAV blob exists in storage.');
    }
    return { settings, recordings };
  }

  public async replaceWithSnapshot(snapshot: StorageSnapshot): Promise<void> {
    snapshot.recordings.forEach((recording) =>
      assertAudioMatchesRecord(recording.record, recording.audioBlobs),
    );
    await this.write(async () => {
      const database = await this.database;
      const transaction = database.transaction(
        [
          'settings',
          'records',
          'audioBlobs',
          'pendingAudioChunks',
          'legacyImports',
        ],
        'readwrite',
      );
      await runTransaction(transaction, async () => {
        await Promise.all([
          transaction.objectStore('settings').clear(),
          transaction.objectStore('records').clear(),
          transaction.objectStore('audioBlobs').clear(),
          transaction.objectStore('pendingAudioChunks').clear(),
          transaction.objectStore('legacyImports').clear(),
        ]);
        await transaction
          .objectStore('settings')
          .put(snapshot.settings, SETTINGS_KEY);
        for (const recording of snapshot.recordings) {
          await transaction.objectStore('records').put(recording.record);
          for (const audio of recording.audioBlobs) {
            await transaction.objectStore('audioBlobs').put(audio);
          }
        }
      });
    });
  }

  public async commitLegacyImport(
    batch: LegacyImportBatch,
  ): Promise<LegacyImportCommitResult> {
    batch.imports.forEach((item) =>
      item.recordings.forEach((recording) =>
        assertAudioMatchesRecord(recording.record, recording.audioBlobs),
      ),
    );
    return this.write(async () => {
      const database = await this.database;
      const transaction = database.transaction(
        ['settings', 'records', 'audioBlobs', 'legacyImports'],
        'readwrite',
      );
      return runTransaction(transaction, async () => {
        const legacyStore = transaction.objectStore('legacyImports');
        const recordingIds: string[] = [];
        let imported = 0;
        let skipped = 0;

        for (const item of batch.imports) {
          if ((await legacyStore.get(item.provenance.hash)) !== undefined) {
            skipped += 1;
            continue;
          }

          for (const recording of item.recordings) {
            await transaction.objectStore('records').add(recording.record);
            for (const audio of recording.audioBlobs) {
              await transaction.objectStore('audioBlobs').add(audio);
            }
            recordingIds.push(recording.record.id);
          }
          await legacyStore.add(item.provenance);
          imported += 1;
        }

        if (imported > 0) {
          await transaction
            .objectStore('settings')
            .put(batch.settings, SETTINGS_KEY);
        }
        return { imported, skipped, recordingIds };
      });
    });
  }

  private async write<T>(operation: () => Promise<T>): Promise<T> {
    try {
      await this.quota.requestPersistenceOnFirstSave();
      return await operation();
    } catch (error) {
      throw toStorageDomainError(error);
    }
  }
}
