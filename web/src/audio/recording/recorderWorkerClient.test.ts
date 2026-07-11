import { describe, expect, it, vi } from 'vitest';

import type { PcmEvent, RecordingChunk } from '../../contracts';

import { AudioEngineError } from '../errors';

import { Pcm16ChunkAccumulator } from './pcm16';
import {
  RecordingInputWriter,
  type RecorderWorkerFactory,
} from './recorderWorkerClient';

type WorkerResponse =
  | { readonly type: 'configured' }
  | {
      readonly type: 'chunk';
      readonly sequence: number;
      readonly timestamp: number;
      readonly sampleCount: number;
      readonly pcm16: ArrayBuffer;
    }
  | { readonly type: 'flushed' }
  | { readonly type: 'error'; readonly message: string };

class FakeRecorderWorker {
  private readonly listeners = new Set<
    (event: MessageEvent<WorkerResponse>) => void
  >();
  private accumulator: Pcm16ChunkAccumulator | null = null;

  postMessage(message: unknown): void {
    const request = message as {
      readonly type: string;
      readonly sampleRate?: number;
      readonly channels?: number;
      readonly timestamp?: number;
      readonly channelBuffers?: readonly ArrayBuffer[];
    };
    switch (request.type) {
      case 'configure':
        this.accumulator = new Pcm16ChunkAccumulator(
          request.sampleRate ?? 0,
          request.channels ?? 0,
        );
        queueMicrotask(() => this.emit({ type: 'configured' }));
        break;
      case 'append':
        for (const chunk of this.accumulator?.append(
          (request.channelBuffers ?? []).map(
            (buffer) => new Float32Array(buffer),
          ),
          request.timestamp ?? 0,
        ) ?? []) {
          this.emit({ type: 'chunk', ...chunk });
        }
        break;
      case 'flush': {
        const chunk = this.accumulator?.flush();
        if (chunk !== null && chunk !== undefined) {
          this.emit({ type: 'chunk', ...chunk });
        }
        this.emit({ type: 'flushed' });
        break;
      }
    }
  }

  addEventListener(
    _type: 'message',
    listener: (event: MessageEvent<WorkerResponse>) => void,
  ): void {
    this.listeners.add(listener);
  }

  removeEventListener(
    _type: 'message',
    listener: (event: MessageEvent<WorkerResponse>) => void,
  ): void {
    this.listeners.delete(listener);
  }

  terminate = vi.fn();

  private emit(response: WorkerResponse): void {
    const event = { data: response } as MessageEvent<WorkerResponse>;
    for (const listener of this.listeners) listener(event);
  }
}

const createFactory = (): RecorderWorkerFactory => () =>
  new FakeRecorderWorker();

const createPcmEvent = (
  sampleRate: number,
  channels: number,
  frames: number,
): PcmEvent => ({
  sourceId: 'input-1',
  timestamp: 250,
  sampleRate,
  channels,
  channelData: Array.from({ length: channels }, (_, channel) =>
    new Float32Array(frames).fill(channel === 0 ? 0.5 : -0.5),
  ),
});

describe('RecordingInputWriter', () => {
  it.each([
    [44_100, 1],
    [48_000, 2],
  ] as const)(
    'writes one-second and final partial PCM16 chunks at %i Hz/%i channel(s)',
    async (sampleRate, channels) => {
      const chunks: RecordingChunk[] = [];
      const writer = new RecordingInputWriter({
        recordingId: 'recording-1',
        inputId: 'input-1',
        sampleRate,
        channels,
        sink: {
          writeChunk: vi.fn(async (chunk: RecordingChunk) => {
            chunks.push(chunk);
          }),
        },
        workerFactory: createFactory(),
      });
      await writer.ready();

      writer.append(createPcmEvent(sampleRate, channels, sampleRate + 11));
      await writer.flush();

      expect(chunks.map((chunk) => chunk.sampleCount)).toEqual([
        sampleRate,
        11,
      ]);
      expect(chunks.map((chunk) => chunk.sequence)).toEqual([0, 1]);
      expect(chunks[0]?.pcm16.byteLength).toBe(sampleRate * channels * 2);
      expect(chunks[1]?.pcm16.byteLength).toBe(11 * channels * 2);
    },
  );

  it('reports quota failures as typed storage errors', async () => {
    const writer = new RecordingInputWriter({
      recordingId: 'recording-1',
      inputId: 'input-1',
      sampleRate: 2,
      channels: 1,
      sink: {
        writeChunk: vi.fn(async () => {
          throw new DOMException('full', 'QuotaExceededError');
        }),
      },
      workerFactory: createFactory(),
    });
    const failure = new Promise<AudioEngineError>((resolve) => {
      writer.subscribeFailure(resolve);
    });
    await writer.ready();

    writer.append(createPcmEvent(2, 1, 2));

    await expect(failure).resolves.toMatchObject({
      code: 'insufficient-storage',
    });
    await expect(writer.flush()).rejects.toMatchObject({
      code: 'insufficient-storage',
    });
  });

  it('rejects an input format change', async () => {
    const writer = new RecordingInputWriter({
      recordingId: 'recording-1',
      inputId: 'input-1',
      sampleRate: 48_000,
      channels: 1,
      sink: { writeChunk: vi.fn(async () => undefined) },
      workerFactory: createFactory(),
    });
    const failure = new Promise<AudioEngineError>((resolve) => {
      writer.subscribeFailure(resolve);
    });
    await writer.ready();

    writer.append(createPcmEvent(44_100, 1, 10));

    await expect(failure).resolves.toMatchObject({ code: 'recording-failed' });
    writer.abort();
  });
});
