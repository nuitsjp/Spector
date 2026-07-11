import type {
  AudioFormat,
  AudioSource,
  RecordingChunkSink,
  Unsubscribe,
} from '../../contracts';
import type { Direction, PlaybackGain, SignalLevelDbfs } from '../../domain';

import type { AudioEngineFaultEvent } from '../browserAudioEngine';
import { AudioEngineError } from '../errors';
import { EventStream } from '../events';
import type { TestNoisePlayback } from '../playback/testNoise';

import {
  estimateRecordingBytes,
  NavigatorRecordingCapacityProbe,
  type RecordingCapacityProbe,
} from './capacity';
import {
  RecordingInputWriter,
  type RecorderWorkerFactory,
} from './recorderWorkerClient';

export interface RecordingStartOptions {
  readonly sources: readonly AudioSource[];
  readonly primaryInputId: string;
  readonly direction: Direction;
  readonly voice: boolean;
  readonly testNoise: boolean;
  readonly playbackGain: PlaybackGain;
  readonly playbackOutputId: string | null;
  readonly durationSeconds: number;
}

export type RecordingStopReason =
  | 'manual'
  | 'duration-elapsed'
  | 'source-disconnected'
  | 'storage-capacity'
  | 'audio-context-stopped'
  | 'recorder-error';

export interface RecordingInputResult extends AudioFormat {
  readonly inputId: string;
  readonly displayName: string;
  readonly levels: readonly SignalLevelDbfs[];
}

export interface RecordingSessionResult {
  readonly recordingId: string;
  readonly status: 'complete' | 'incomplete';
  readonly reason: RecordingStopReason;
  readonly detail: string | null;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly primaryInputId: string;
  readonly direction: Direction;
  readonly voice: boolean;
  readonly testNoise: boolean;
  readonly playbackGain: PlaybackGain;
  readonly inputs: readonly RecordingInputResult[];
}

export type RecordingStateEvent =
  | {
      readonly type: 'started';
      readonly recordingId: string;
      readonly durationMilliseconds: number;
    }
  | {
      readonly type: 'progress';
      readonly recordingId: string;
      readonly elapsedMilliseconds: number;
      readonly durationMilliseconds: number;
      readonly ratio: number;
    }
  | { readonly type: 'stopped'; readonly result: RecordingSessionResult };

export interface AudioEngineFaultSource {
  subscribeFault(listener: (event: AudioEngineFaultEvent) => void): Unsubscribe;
}

export interface RecordingSessionServiceOptions {
  readonly sink: RecordingChunkSink;
  readonly testNoisePlayback: TestNoisePlayback;
  readonly capacityProbe?: RecordingCapacityProbe;
  readonly faultSource?: AudioEngineFaultSource;
  readonly workerFactory?: RecorderWorkerFactory;
  readonly createId?: () => string;
  readonly now?: () => number;
  readonly wallClock?: () => Date;
  readonly setInterval?: (callback: () => void, milliseconds: number) => number;
  readonly clearInterval?: (handle: number) => void;
  readonly setTimeout?: (callback: () => void, milliseconds: number) => number;
  readonly clearTimeout?: (handle: number) => void;
}

interface ActiveInput {
  readonly source: AudioSource;
  readonly format: AudioFormat;
  readonly levels: SignalLevelDbfs[];
  readonly writer: RecordingInputWriter;
  readonly unsubscribes: Unsubscribe[];
}

interface ActiveSession {
  readonly recordingId: string;
  readonly options: RecordingStartOptions;
  readonly inputs: readonly ActiveInput[];
  readonly startedAt: string;
  readonly startedPerformanceTime: number;
  readonly durationMilliseconds: number;
  faultUnsubscribe: Unsubscribe | null;
  progressHandle: number;
  timeoutHandle: number;
  finishPromise: Promise<RecordingSessionResult> | null;
}

const defaultSetInterval = (
  callback: () => void,
  milliseconds: number,
): number => window.setInterval(callback, milliseconds);
const defaultClearInterval = (handle: number): void =>
  window.clearInterval(handle);
const defaultSetTimeout = (
  callback: () => void,
  milliseconds: number,
): number => window.setTimeout(callback, milliseconds);
const defaultClearTimeout = (handle: number): void =>
  window.clearTimeout(handle);

export class RecordingSessionService {
  private readonly capacityProbe: RecordingCapacityProbe;
  private readonly stateEvents = new EventStream<RecordingStateEvent>();
  private readonly createId: () => string;
  private readonly now: () => number;
  private readonly wallClock: () => Date;
  private readonly scheduleInterval: (
    callback: () => void,
    milliseconds: number,
  ) => number;
  private readonly cancelInterval: (handle: number) => void;
  private readonly scheduleTimeout: (
    callback: () => void,
    milliseconds: number,
  ) => number;
  private readonly cancelTimeout: (handle: number) => void;
  private active: ActiveSession | null = null;
  private starting = false;

  constructor(private readonly dependencies: RecordingSessionServiceOptions) {
    this.capacityProbe =
      dependencies.capacityProbe ?? new NavigatorRecordingCapacityProbe();
    this.createId = dependencies.createId ?? (() => crypto.randomUUID());
    this.now = dependencies.now ?? (() => performance.now());
    this.wallClock = dependencies.wallClock ?? (() => new Date());
    this.scheduleInterval = dependencies.setInterval ?? defaultSetInterval;
    this.cancelInterval = dependencies.clearInterval ?? defaultClearInterval;
    this.scheduleTimeout = dependencies.setTimeout ?? defaultSetTimeout;
    this.cancelTimeout = dependencies.clearTimeout ?? defaultClearTimeout;
  }

  get isRecording(): boolean {
    return this.active !== null;
  }

  subscribeState(listener: (event: RecordingStateEvent) => void): Unsubscribe {
    return this.stateEvents.subscribe(listener);
  }

  async start(options: RecordingStartOptions): Promise<string> {
    if (this.active !== null || this.starting) {
      throw new AudioEngineError(
        'invalid-state',
        '録音はすでに開始されています。',
      );
    }
    this.starting = true;
    try {
      return await this.startValidated(options);
    } finally {
      this.starting = false;
    }
  }

  private async startValidated(
    options: RecordingStartOptions,
  ): Promise<string> {
    const sources = this.validateStartOptions(options);
    const formats = sources.map((source) => source.format as AudioFormat);
    const requiredBytes = estimateRecordingBytes(
      formats,
      options.durationSeconds,
    );
    const availableBytes = await this.capacityProbe.getAvailableBytes();
    if (availableBytes < requiredBytes) {
      throw new AudioEngineError(
        'insufficient-storage',
        `録音には${requiredBytes}バイト必要ですが、利用可能なのは${availableBytes}バイトです。`,
      );
    }

    const recordingId = this.createId();
    const inputs: ActiveInput[] = sources.map((source) => {
      const format = source.format as AudioFormat;
      return {
        source,
        format,
        levels: [],
        writer: new RecordingInputWriter({
          recordingId,
          inputId: source.id,
          sampleRate: format.sampleRate,
          channels: format.channels,
          sink: this.dependencies.sink,
          ...(this.dependencies.workerFactory === undefined
            ? {}
            : { workerFactory: this.dependencies.workerFactory }),
        }),
        unsubscribes: [],
      };
    });

    try {
      await Promise.all(inputs.map((input) => input.writer.ready()));
      if (options.testNoise) {
        await this.dependencies.testNoisePlayback.start(options.playbackGain);
      }
      this.ensureInputsStillReady(inputs);
      for (const input of inputs) input.writer.ensureHealthy();
    } catch (error) {
      for (const input of inputs) {
        input.writer.abort();
      }
      try {
        await this.dependencies.testNoisePlayback.stop();
      } catch {
        // Preserve the typed start failure; cleanup cannot make the session valid.
      }
      throw error;
    }

    const durationMilliseconds = options.durationSeconds * 1_000;
    const session: ActiveSession = {
      recordingId,
      options,
      inputs,
      startedAt: this.wallClock().toISOString(),
      startedPerformanceTime: this.now(),
      durationMilliseconds,
      faultUnsubscribe: null,
      progressHandle: 0,
      timeoutHandle: 0,
      finishPromise: null,
    };
    this.active = session;
    for (const input of inputs) {
      input.unsubscribes.push(
        input.source.subscribePcm((event) => input.writer.append(event)),
        input.source.subscribeLevel((event) => input.levels.push(event.level)),
        input.source.subscribeDisconnected((event) => {
          void this.finish('incomplete', 'source-disconnected', event.reason);
        }),
        input.writer.subscribeFailure((error) => {
          void this.finish(
            'incomplete',
            error.code === 'insufficient-storage'
              ? 'storage-capacity'
              : 'recorder-error',
            error.message,
          );
        }),
      );
    }
    session.faultUnsubscribe =
      this.dependencies.faultSource?.subscribeFault((event) => {
        void this.finish('incomplete', 'audio-context-stopped', event.reason);
      }) ?? null;
    session.progressHandle = this.scheduleInterval(() => {
      this.emitProgress(session);
    }, 100);
    session.timeoutHandle = this.scheduleTimeout(() => {
      void this.finish('complete', 'duration-elapsed', null);
    }, durationMilliseconds);
    this.stateEvents.emit({
      type: 'started',
      recordingId,
      durationMilliseconds,
    });
    return recordingId;
  }

  private ensureInputsStillReady(inputs: readonly ActiveInput[]): void {
    for (const input of inputs) {
      const currentFormat = input.source.format;
      if (input.source.state !== 'active' || currentFormat === null) {
        throw new AudioEngineError(
          'source-disconnected',
          `入力 ${input.source.displayName} は録音開始前に切断されました。`,
        );
      }
      if (
        currentFormat.sampleRate !== input.format.sampleRate ||
        currentFormat.channels !== input.format.channels
      ) {
        throw new AudioEngineError(
          'recording-failed',
          `入力 ${input.source.displayName} の音声形式が録音開始前に変わりました。`,
        );
      }
    }
  }

  stop(): Promise<RecordingSessionResult> {
    if (this.active === null) {
      return Promise.reject(
        new AudioEngineError('invalid-state', '録音は開始されていません。'),
      );
    }
    return this.finish('complete', 'manual', null);
  }

  private validateStartOptions(
    options: RecordingStartOptions,
  ): readonly AudioSource[] {
    if (
      !Number.isFinite(options.durationSeconds) ||
      options.durationSeconds <= 0
    ) {
      throw new AudioEngineError(
        'invalid-state',
        '録音時間は0秒より長く指定してください。',
      );
    }
    if (options.sources.length === 0) {
      throw new AudioEngineError(
        'missing-primary-input',
        '録音対象の入力がありません。',
      );
    }
    const ids = new Set(options.sources.map((source) => source.id));
    if (ids.size !== options.sources.length) {
      throw new AudioEngineError(
        'invalid-state',
        '同じ入力が複数回指定されています。',
      );
    }
    if (!ids.has(options.primaryInputId)) {
      throw new AudioEngineError(
        'missing-primary-input',
        '主計測入力が録音対象に含まれていません。',
      );
    }
    if (options.testNoise && options.playbackOutputId === null) {
      throw new AudioEngineError(
        'missing-playback-output',
        '試験音を使う場合は再生出力を選択してください。',
      );
    }
    for (const source of options.sources) {
      if (source.state !== 'active' || source.format === null) {
        throw new AudioEngineError(
          'source-disconnected',
          `入力 ${source.displayName} は録音できる状態ではありません。`,
        );
      }
    }
    return options.sources;
  }

  private emitProgress(session: ActiveSession): void {
    if (this.active !== session) return;
    const elapsedMilliseconds = Math.min(
      session.durationMilliseconds,
      Math.max(0, this.now() - session.startedPerformanceTime),
    );
    this.stateEvents.emit({
      type: 'progress',
      recordingId: session.recordingId,
      elapsedMilliseconds,
      durationMilliseconds: session.durationMilliseconds,
      ratio: elapsedMilliseconds / session.durationMilliseconds,
    });
  }

  private finish(
    status: 'complete' | 'incomplete',
    reason: RecordingStopReason,
    detail: string | null,
  ): Promise<RecordingSessionResult> {
    const session = this.active;
    if (session === null) {
      return Promise.reject(
        new AudioEngineError('invalid-state', '録音は開始されていません。'),
      );
    }
    session.finishPromise ??= this.finalizeSession(
      session,
      status,
      reason,
      detail,
    );
    return session.finishPromise;
  }

  private async finalizeSession(
    session: ActiveSession,
    initialStatus: 'complete' | 'incomplete',
    initialReason: RecordingStopReason,
    initialDetail: string | null,
  ): Promise<RecordingSessionResult> {
    this.cancelInterval(session.progressHandle);
    this.cancelTimeout(session.timeoutHandle);
    session.faultUnsubscribe?.();
    for (const input of session.inputs) {
      for (const unsubscribe of input.unsubscribes) unsubscribe();
    }
    let status = initialStatus;
    let reason = initialReason;
    let detail = initialDetail;
    try {
      await this.dependencies.testNoisePlayback.stop();
    } catch (error) {
      status = 'incomplete';
      reason = 'recorder-error';
      detail =
        error instanceof Error
          ? `試験音を停止できませんでした: ${error.message}`
          : `試験音を停止できませんでした: ${String(error)}`;
    }

    const flushResults = await Promise.allSettled(
      session.inputs.map((input) => input.writer.flush()),
    );
    const failedFlush = flushResults.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failedFlush !== undefined) {
      status = 'incomplete';
      const error = failedFlush.reason;
      reason =
        error instanceof AudioEngineError &&
        error.code === 'insufficient-storage'
          ? 'storage-capacity'
          : 'recorder-error';
      detail = error instanceof Error ? error.message : String(error);
      for (const input of session.inputs) input.writer.abort();
    }

    const result: RecordingSessionResult = {
      recordingId: session.recordingId,
      status,
      reason,
      detail,
      startedAt: session.startedAt,
      endedAt: this.wallClock().toISOString(),
      primaryInputId: session.options.primaryInputId,
      direction: session.options.direction,
      voice: session.options.voice,
      testNoise: session.options.testNoise,
      playbackGain: session.options.playbackGain,
      inputs: session.inputs.map((input) => ({
        inputId: input.source.id,
        displayName: input.source.displayName,
        sampleRate: input.format.sampleRate,
        channels: input.format.channels,
        levels: [...input.levels],
      })),
    };
    if (this.active === session) this.active = null;
    this.stateEvents.emit({ type: 'stopped', result });
    return result;
  }
}
