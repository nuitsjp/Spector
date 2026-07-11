import { describe, expect, it, vi } from 'vitest';

import type {
  AudioFormat,
  AudioSource,
  AudioSourceDisconnectedEvent,
  AudioSourceState,
  LevelEvent,
  PcmEvent,
  RecordingChunk,
  Unsubscribe,
} from '../../contracts';
import { createPlaybackGain, createSignalLevelDbfs } from '../../domain';

import type { AudioEngineFaultEvent } from '../browserAudioEngine';
import type { TestNoisePlayback } from '../playback/testNoise';

import { Pcm16ChunkAccumulator } from './pcm16';
import type { RecorderWorkerFactory } from './recorderWorkerClient';
import {
  RecordingSessionService,
  type RecordingSessionResult,
  type RecordingStartOptions,
  type RecordingStateEvent,
} from './recordingSession';

class FakeSource implements AudioSource {
  readonly kind = 'microphone' as const;
  state: AudioSourceState = 'active';
  private readonly pcmListeners = new Set<(event: PcmEvent) => void>();
  private readonly levelListeners = new Set<(event: LevelEvent) => void>();
  private readonly disconnectedListeners = new Set<
    (event: AudioSourceDisconnectedEvent) => void
  >();

  constructor(
    readonly id: string,
    readonly displayName: string,
    readonly format: AudioFormat,
  ) {}

  async start(): Promise<void> {}
  async stop(): Promise<void> {}

  subscribePcm(listener: (event: PcmEvent) => void): Unsubscribe {
    this.pcmListeners.add(listener);
    return () => this.pcmListeners.delete(listener);
  }

  subscribeLevel(listener: (event: LevelEvent) => void): Unsubscribe {
    this.levelListeners.add(listener);
    return () => this.levelListeners.delete(listener);
  }

  subscribeDisconnected(
    listener: (event: AudioSourceDisconnectedEvent) => void,
  ): Unsubscribe {
    this.disconnectedListeners.add(listener);
    return () => this.disconnectedListeners.delete(listener);
  }

  emitPcm(frameCount: number, timestamp = 0): void {
    const event: PcmEvent = {
      sourceId: this.id,
      timestamp,
      ...this.format,
      channelData: Array.from({ length: this.format.channels }, (_, channel) =>
        new Float32Array(frameCount).fill(channel === 0 ? 0.25 : -0.25),
      ),
    };
    for (const listener of this.pcmListeners) listener(event);
  }

  emitLevel(level: number): void {
    const event: LevelEvent = {
      sourceId: this.id,
      timestamp: 0,
      level: createSignalLevelDbfs(level),
    };
    for (const listener of this.levelListeners) listener(event);
  }

  disconnect(reason = 'removed'): void {
    this.state = 'disconnected';
    for (const listener of this.disconnectedListeners) {
      listener({ sourceId: this.id, reason });
    }
  }
}

type WorkerResponse =
  | { readonly type: 'configured' }
  | {
      readonly type: 'chunk';
      readonly sequence: number;
      readonly timestamp: number;
      readonly sampleCount: number;
      readonly pcm16: ArrayBuffer;
    }
  | { readonly type: 'flushed' };

class FakeWorker {
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
    if (request.type === 'configure') {
      this.accumulator = new Pcm16ChunkAccumulator(
        request.sampleRate ?? 0,
        request.channels ?? 0,
      );
      queueMicrotask(() => this.emit({ type: 'configured' }));
    } else if (request.type === 'append') {
      const chunks =
        this.accumulator?.append(
          (request.channelBuffers ?? []).map(
            (buffer) => new Float32Array(buffer),
          ),
          request.timestamp ?? 0,
        ) ?? [];
      for (const chunk of chunks) this.emit({ type: 'chunk', ...chunk });
    } else if (request.type === 'flush') {
      const chunk = this.accumulator?.flush();
      if (chunk !== null && chunk !== undefined) {
        this.emit({ type: 'chunk', ...chunk });
      }
      this.emit({ type: 'flushed' });
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
  terminate(): void {}

  private emit(response: WorkerResponse): void {
    const event = { data: response } as MessageEvent<WorkerResponse>;
    for (const listener of this.listeners) listener(event);
  }
}

class FakeFaultSource {
  private readonly listeners = new Set<
    (event: AudioEngineFaultEvent) => void
  >();

  subscribeFault(
    listener: (event: AudioEngineFaultEvent) => void,
  ): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  fail(reason: string): void {
    for (const listener of this.listeners) {
      listener({ code: 'audio-context-stopped', reason });
    }
  }
}

const workerFactory: RecorderWorkerFactory = () => new FakeWorker();

const createTestNoise = (): TestNoisePlayback => ({
  isPlaying: false,
  start: vi.fn(async () => undefined),
  stop: vi.fn(async () => undefined),
});

const createOptions = (
  sources: readonly AudioSource[],
  overrides: Partial<RecordingStartOptions> = {},
): RecordingStartOptions => ({
  sources,
  primaryInputId: sources[0]?.id ?? 'missing',
  direction: 90,
  voice: true,
  testNoise: false,
  playbackGain: createPlaybackGain(0.4),
  playbackOutputId: null,
  durationSeconds: 2,
  ...overrides,
});

const waitForStopped = (
  service: RecordingSessionService,
): Promise<RecordingSessionResult> =>
  new Promise((resolve) => {
    const unsubscribe = service.subscribeState((event: RecordingStateEvent) => {
      if (event.type === 'stopped') {
        unsubscribe();
        resolve(event.result);
      }
    });
  });

describe('RecordingSessionService', () => {
  it('records multiple inputs and flushes partial PCM on a normal stop', async () => {
    const first = new FakeSource('first', 'First', {
      sampleRate: 4,
      channels: 1,
    });
    const second = new FakeSource('second', 'Second', {
      sampleRate: 4,
      channels: 2,
    });
    const chunks: RecordingChunk[] = [];
    const noise = createTestNoise();
    const capacity = vi.fn(async () => 1_000);
    const service = new RecordingSessionService({
      sink: {
        writeChunk: vi.fn(async (chunk: RecordingChunk) => {
          chunks.push(chunk);
        }),
      },
      testNoisePlayback: noise,
      capacityProbe: { getAvailableBytes: capacity },
      workerFactory,
      createId: () => 'recording-1',
      wallClock: () => new Date('2026-07-11T00:00:00.000Z'),
      setInterval: () => 1,
      clearInterval: vi.fn(),
      setTimeout: () => 2,
      clearTimeout: vi.fn(),
    });

    await service.start(createOptions([first, second]));
    first.emitPcm(3);
    second.emitPcm(3);
    first.emitLevel(-42);
    second.emitLevel(-24);
    const result = await service.stop();

    expect(capacity).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      recordingId: 'recording-1',
      status: 'complete',
      reason: 'manual',
      primaryInputId: 'first',
      direction: 90,
      voice: true,
    });
    expect(result.inputs.map((input) => input.levels)).toEqual([[-42], [-24]]);
    expect(chunks.map((chunk) => [chunk.inputId, chunk.sampleCount])).toEqual([
      ['first', 3],
      ['second', 3],
    ]);
    expect(noise.start).not.toHaveBeenCalled();
    expect(noise.stop).toHaveBeenCalledOnce();
  });

  it('validates primary input, test-noise output, and estimated capacity', async () => {
    const source = new FakeSource('input', 'Input', {
      sampleRate: 48_000,
      channels: 2,
    });
    const service = new RecordingSessionService({
      sink: { writeChunk: vi.fn(async () => undefined) },
      testNoisePlayback: createTestNoise(),
      capacityProbe: { getAvailableBytes: vi.fn(async () => 10) },
      workerFactory,
      setInterval: () => 1,
      clearInterval: vi.fn(),
      setTimeout: () => 2,
      clearTimeout: vi.fn(),
    });

    await expect(
      service.start(createOptions([source], { primaryInputId: 'other' })),
    ).rejects.toMatchObject({ code: 'missing-primary-input' });
    await expect(
      service.start(createOptions([source], { testNoise: true })),
    ).rejects.toMatchObject({ code: 'missing-playback-output' });
    await expect(service.start(createOptions([source]))).rejects.toMatchObject({
      code: 'insufficient-storage',
    });
  });

  it('fails start cleanly when a source disconnects while test noise is starting', async () => {
    const source = new FakeSource('input', 'Input', {
      sampleRate: 48_000,
      channels: 1,
    });
    let releaseNoise: (() => void) | null = null;
    const noiseStarted = new Promise<void>((resolve) => {
      releaseNoise = resolve;
    });
    const noise: TestNoisePlayback = {
      isPlaying: false,
      start: vi.fn(() => noiseStarted),
      stop: vi.fn(async () => undefined),
    };
    const sink = vi.fn(async () => undefined);
    const scheduleInterval = vi.fn(() => 1);
    const scheduleTimeout = vi.fn(() => 2);
    const events: RecordingStateEvent[] = [];
    const service = new RecordingSessionService({
      sink: { writeChunk: sink },
      testNoisePlayback: noise,
      capacityProbe: { getAvailableBytes: vi.fn(async () => 1_000_000) },
      workerFactory,
      setInterval: scheduleInterval,
      clearInterval: vi.fn(),
      setTimeout: scheduleTimeout,
      clearTimeout: vi.fn(),
    });
    service.subscribeState((event) => events.push(event));

    const startResult = service
      .start(
        createOptions([source], {
          testNoise: true,
          playbackOutputId: 'speaker',
        }),
      )
      .then(
        () => null,
        (error: unknown) => error,
      );
    await vi.waitFor(() => expect(noise.start).toHaveBeenCalledOnce());
    source.disconnect('removed during test-noise start');
    const release = releaseNoise as (() => void) | null;
    release?.();

    await expect(startResult).resolves.toMatchObject({
      code: 'source-disconnected',
    });
    expect(noise.stop).toHaveBeenCalledOnce();
    expect(sink).not.toHaveBeenCalled();
    expect(scheduleInterval).not.toHaveBeenCalled();
    expect(scheduleTimeout).not.toHaveBeenCalled();
    expect(events).toEqual([]);
    expect(service.isRecording).toBe(false);
  });

  it('marks every input incomplete when one source disconnects', async () => {
    const first = new FakeSource('first', 'First', {
      sampleRate: 4,
      channels: 1,
    });
    const second = new FakeSource('second', 'Second', {
      sampleRate: 4,
      channels: 1,
    });
    const service = new RecordingSessionService({
      sink: { writeChunk: vi.fn(async () => undefined) },
      testNoisePlayback: createTestNoise(),
      capacityProbe: { getAvailableBytes: vi.fn(async () => 1_000) },
      workerFactory,
      setInterval: () => 1,
      clearInterval: vi.fn(),
      setTimeout: () => 2,
      clearTimeout: vi.fn(),
    });
    const stopped = waitForStopped(service);
    await service.start(createOptions([first, second]));

    first.disconnect('USB device removed');

    await expect(stopped).resolves.toMatchObject({
      status: 'incomplete',
      reason: 'source-disconnected',
      detail: 'USB device removed',
    });
    expect(service.isRecording).toBe(false);
  });

  it('uses performance time for progress and completes at the duration timeout', async () => {
    const source = new FakeSource('input', 'Input', {
      sampleRate: 4,
      channels: 1,
    });
    let now = 1_000;
    let intervalCallback: (() => void) | null = null;
    let timeoutCallback: (() => void) | null = null;
    const events: RecordingStateEvent[] = [];
    const service = new RecordingSessionService({
      sink: { writeChunk: vi.fn(async () => undefined) },
      testNoisePlayback: createTestNoise(),
      capacityProbe: { getAvailableBytes: vi.fn(async () => 1_000) },
      workerFactory,
      now: () => now,
      setInterval: (callback) => {
        intervalCallback = callback;
        return 1;
      },
      clearInterval: vi.fn(),
      setTimeout: (callback) => {
        timeoutCallback = callback;
        return 2;
      },
      clearTimeout: vi.fn(),
    });
    service.subscribeState((event) => events.push(event));
    const stopped = waitForStopped(service);
    await service.start(createOptions([source], { durationSeconds: 2 }));

    now = 2_500;
    const runInterval = intervalCallback as (() => void) | null;
    runInterval?.();
    const progress = events.find((event) => event.type === 'progress');
    expect(progress).toMatchObject({
      elapsedMilliseconds: 1_500,
      durationMilliseconds: 2_000,
      ratio: 0.75,
    });
    const runTimeout = timeoutCallback as (() => void) | null;
    runTimeout?.();
    await expect(stopped).resolves.toMatchObject({
      status: 'complete',
      reason: 'duration-elapsed',
    });
  });

  it('marks a context stop and a sink quota failure incomplete', async () => {
    const source = new FakeSource('input', 'Input', {
      sampleRate: 2,
      channels: 1,
    });
    const faults = new FakeFaultSource();
    const contextService = new RecordingSessionService({
      sink: { writeChunk: vi.fn(async () => undefined) },
      testNoisePlayback: createTestNoise(),
      capacityProbe: { getAvailableBytes: vi.fn(async () => 1_000) },
      faultSource: faults,
      workerFactory,
      setInterval: () => 1,
      clearInterval: vi.fn(),
      setTimeout: () => 2,
      clearTimeout: vi.fn(),
    });
    const contextStopped = waitForStopped(contextService);
    await contextService.start(createOptions([source]));
    faults.fail('suspended');
    await expect(contextStopped).resolves.toMatchObject({
      status: 'incomplete',
      reason: 'audio-context-stopped',
    });

    const quotaService = new RecordingSessionService({
      sink: {
        writeChunk: vi.fn(async () => {
          throw new DOMException('full', 'QuotaExceededError');
        }),
      },
      testNoisePlayback: createTestNoise(),
      capacityProbe: { getAvailableBytes: vi.fn(async () => 1_000) },
      workerFactory,
      setInterval: () => 1,
      clearInterval: vi.fn(),
      setTimeout: () => 2,
      clearTimeout: vi.fn(),
    });
    const quotaStopped = waitForStopped(quotaService);
    await quotaService.start(createOptions([source]));
    source.emitPcm(2);
    await expect(quotaStopped).resolves.toMatchObject({
      status: 'incomplete',
      reason: 'storage-capacity',
    });
  });
});
