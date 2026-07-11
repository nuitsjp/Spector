// @vitest-environment node

import 'fake-indexeddb/auto';

import { deleteDB } from 'idb';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  AudioFormat,
  AudioSource,
  PcmEvent,
  RecordingChunk,
  Unsubscribe,
} from '../contracts';
import { createPlaybackGain } from '../domain';
import { Pcm16ChunkAccumulator } from '../audio/recording/pcm16';
import type { RecorderWorkerFactory } from '../audio/recording/recorderWorkerClient';
import { RecordingSessionService } from '../audio/recording/recordingSession';
import { createDefaultSettings } from './defaults';
import { openSpectorDatabase } from './database';
import { StorageQuotaExceededError, StorageQuotaService } from './quota';
import { StorageRepository } from './repository';
import { createTestRecord } from './testFixtures';
import { decodeWaveFile } from './wav';

type RepositoryWorkerResponse =
  | { readonly type: 'configured' }
  | {
      readonly type: 'chunk';
      readonly sequence: number;
      readonly timestamp: number;
      readonly sampleCount: number;
      readonly pcm16: ArrayBuffer;
    }
  | { readonly type: 'flushed' };

class RepositoryTestWorker {
  private readonly listeners = new Set<
    (event: MessageEvent<RepositoryWorkerResponse>) => void
  >();
  private accumulator: Pcm16ChunkAccumulator | null = null;

  public postMessage(message: unknown): void {
    const request = message as {
      readonly type: string;
      readonly sampleRate?: number;
      readonly channels?: number;
      readonly timestamp?: number;
      readonly channelBuffers?: readonly ArrayBuffer[];
    };
    if (request.type === 'configure') {
      this.accumulator = new Pcm16ChunkAccumulator(
        request.sampleRate ?? 0,
        request.channels ?? 0,
      );
      queueMicrotask(() => this.emit({ type: 'configured' }));
      return;
    }
    if (request.type === 'append') {
      const chunks = this.accumulator?.append(
        (request.channelBuffers ?? []).map(
          (buffer) => new Float32Array(buffer),
        ),
        request.timestamp ?? 0,
      );
      chunks?.forEach((chunk) => this.emit({ type: 'chunk', ...chunk }));
      return;
    }
    if (request.type === 'flush') {
      const chunk = this.accumulator?.flush();
      if (chunk !== null && chunk !== undefined) {
        this.emit({ type: 'chunk', ...chunk });
      }
      this.emit({ type: 'flushed' });
    }
  }

  public addEventListener(
    _type: 'message',
    listener: (event: MessageEvent<RepositoryWorkerResponse>) => void,
  ): void {
    this.listeners.add(listener);
  }

  public removeEventListener(
    _type: 'message',
    listener: (event: MessageEvent<RepositoryWorkerResponse>) => void,
  ): void {
    this.listeners.delete(listener);
  }

  public terminate(): void {}

  private emit(response: RepositoryWorkerResponse): void {
    const event = { data: response } as MessageEvent<RepositoryWorkerResponse>;
    this.listeners.forEach((listener) => listener(event));
  }
}

const repositoryWorkerFactory: RecorderWorkerFactory = () =>
  new RepositoryTestWorker();

class RepositoryTestSource implements AudioSource {
  public readonly kind = 'microphone' as const;
  public readonly state = 'active' as const;
  private readonly pcmListeners = new Set<(event: PcmEvent) => void>();

  public constructor(
    public readonly id: string,
    public readonly displayName: string,
    public readonly format: AudioFormat,
  ) {}

  public async start(): Promise<void> {}
  public async stop(): Promise<void> {}

  public subscribePcm(listener: (event: PcmEvent) => void): Unsubscribe {
    this.pcmListeners.add(listener);
    return () => this.pcmListeners.delete(listener);
  }

  public subscribeLevel(): Unsubscribe {
    return () => undefined;
  }

  public subscribeDisconnected(): Unsubscribe {
    return () => undefined;
  }

  public emit(samples: Float32Array): void {
    const event: PcmEvent = {
      sourceId: this.id,
      timestamp: 10,
      ...this.format,
      channelData: [samples],
    };
    this.pcmListeners.forEach((listener) => listener(event));
  }
}

const databases: {
  readonly name: string;
  readonly repository: StorageRepository;
}[] = [];

const createRepository = (quota?: StorageQuotaService): StorageRepository => {
  const name = `spector-test-${crypto.randomUUID()}`;
  const repository = new StorageRepository(
    openSpectorDatabase(name),
    quota ?? new StorageQuotaService(undefined),
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

describe('StorageRepository', () => {
  it('returns defaults and persists settings', async () => {
    const repository = createRepository();
    expect(await repository.loadSettings()).toEqual(createDefaultSettings());

    const settings = {
      ...createDefaultSettings(),
      primaryInputId: 'microphone-1',
    };
    await repository.saveSettings(settings);
    expect(await repository.loadSettings()).toEqual(settings);
  });

  it('stores, orders, reads, and cascade-deletes recordings', async () => {
    const repository = createRepository();
    const first = createTestRecord('first', '2026-07-10T00:00:00.000Z');
    const second = createTestRecord('second', '2026-07-11T00:00:00.000Z');
    const firstBlob = new Blob(['first'], { type: 'audio/wav' });
    const secondBlob = new Blob(['second'], { type: 'audio/wav' });

    await repository.saveRecording(first, [
      { key: first.deviceRecordings[0]!.wavBlobKey, blob: firstBlob },
    ]);
    await repository.saveRecording(second, [
      { key: second.deviceRecordings[0]!.wavBlobKey, blob: secondBlob },
    ]);

    expect(
      (await repository.listRecordings()).map((record) => record.id),
    ).toEqual(['second', 'first']);
    expect(
      await repository.getAudioBlob(first.deviceRecordings[0]!.wavBlobKey),
    ).toEqual(firstBlob);

    await repository.deleteRecording(first.id);
    expect(await repository.getRecording(first.id)).toBeUndefined();
    expect(
      await repository.getAudioBlob(first.deviceRecordings[0]!.wavBlobKey),
    ).toBeUndefined();
    expect(await repository.getRecording(second.id)).toEqual(second);
  });

  it('rejects a recording whose WAV set does not match its metadata', async () => {
    const repository = createRepository();
    const record = createTestRecord();

    await expect(repository.saveRecording(record, [])).rejects.toThrow(
      'does not match its WAV blobs',
    );
    expect(await repository.getRecording(record.id)).toBeUndefined();
  });

  it('orders pending chunks, finalizes WAV atomically, and clears chunks', async () => {
    const repository = createRepository();
    const record = createTestRecord();
    await repository.appendPendingAudioChunk({
      sessionId: 'session',
      inputId: 'input-1',
      sequence: 1,
      pcm: Int16Array.from([20_000]),
    });
    await repository.appendPendingAudioChunk({
      sessionId: 'session',
      inputId: 'input-1',
      sequence: 0,
      pcm: Int16Array.from([-20_000, 0]),
    });

    expect(
      (await repository.listPendingAudioChunks('session', 'input-1')).map(
        (chunk) => chunk.sequence,
      ),
    ).toEqual([0, 1]);
    await repository.finalizeRecording('session', record, [
      {
        inputId: 'input-1',
        wavBlobKey: record.deviceRecordings[0]!.wavBlobKey,
        sampleRate: 48_000,
        channels: 1,
      },
    ]);

    expect(await repository.listPendingAudioChunks('session')).toHaveLength(0);
    expect(await repository.getRecording(record.id)).toEqual(record);
    const blob = await repository.getAudioBlob(
      record.deviceRecordings[0]!.wavBlobKey,
    );
    expect(blob).toBeDefined();
    const decoded = await decodeWaveFile(blob!);
    expect([...decoded.samples]).toEqual([
      -20_000 / 32_768,
      0,
      20_000 / 32_768,
    ]);
  });

  it('acts as the RecordingSession chunk sink', async () => {
    const repository = createRepository();
    const source = new RepositoryTestSource('input-1', 'Input', {
      sampleRate: 4,
      channels: 1,
    });
    const session = new RecordingSessionService({
      sink: repository,
      testNoisePlayback: {
        isPlaying: false,
        start: vi.fn(async () => undefined),
        stop: vi.fn(async () => undefined),
      },
      capacityProbe: { getAvailableBytes: vi.fn(async () => 1_000) },
      workerFactory: repositoryWorkerFactory,
      createId: () => 'recording-session',
      setInterval: () => 1,
      clearInterval: vi.fn(),
      setTimeout: () => 2,
      clearTimeout: vi.fn(),
    });

    await session.start({
      sources: [source],
      primaryInputId: source.id,
      direction: 0,
      voice: false,
      testNoise: false,
      playbackGain: createPlaybackGain(0.5),
      playbackOutputId: null,
      durationSeconds: 1,
    });
    source.emit(Float32Array.of(-1, 0, 0.5, 1));
    await session.stop();

    const chunks = await repository.listPendingAudioChunks(
      'recording-session',
      source.id,
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      sessionId: 'recording-session',
      inputId: source.id,
      sequence: 0,
    });
    expect([...chunks[0]!.pcm]).toEqual([-32_768, 0, 16_384, 32_767]);
  });

  it('copies the exact PCM view and rejects odd byte lengths', async () => {
    const repository = createRepository();
    const source = Int16Array.of(999, 1, 2, 999);
    const view = new Uint8Array(source.buffer, 2, 4);
    const baseChunk: Omit<RecordingChunk, 'pcm16'> = {
      recordingId: 'view-recording',
      inputId: 'input-1',
      sequence: 0,
      timestamp: 0,
      sampleRate: 48_000,
      channels: 1,
      sampleCount: 2,
    };

    await repository.writeChunk({
      ...baseChunk,
      pcm16: view as unknown as ArrayBuffer,
    });
    source.fill(0);
    expect(
      (await repository.listPendingAudioChunks('view-recording'))[0]?.pcm,
    ).toEqual(Int16Array.of(1, 2));

    await expect(
      repository.writeChunk({
        ...baseChunk,
        sequence: 1,
        pcm16: new ArrayBuffer(3),
      }),
    ).rejects.toThrow('PCM16 byte length must be even');
    expect(
      await repository.listPendingAudioChunks('view-recording'),
    ).toHaveLength(1);
  });

  it('does not clear pending chunks when finalization validation fails', async () => {
    const repository = createRepository();
    const record = createTestRecord();
    await repository.appendPendingAudioChunk({
      sessionId: 'session',
      inputId: 'input-1',
      sequence: 1,
      pcm: Int16Array.of(1),
    });

    await expect(
      repository.finalizeRecording('session', record, [
        {
          inputId: 'input-1',
          wavBlobKey: record.deviceRecordings[0]!.wavBlobKey,
          sampleRate: 48_000,
          channels: 1,
        },
      ]),
    ).rejects.toThrow('sequence is incomplete');
    expect(await repository.listPendingAudioChunks('session')).toHaveLength(1);
    expect(await repository.getRecording(record.id)).toBeUndefined();
  });

  it('maps a quota failure raised during the first save', async () => {
    const persist = vi
      .fn()
      .mockRejectedValue(new DOMException('full', 'QuotaExceededError'));
    const repository = createRepository(
      new StorageQuotaService({ persist } as unknown as StorageManager),
    );

    await expect(
      repository.saveSettings(createDefaultSettings()),
    ).rejects.toBeInstanceOf(StorageQuotaExceededError);
  });
});
