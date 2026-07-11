import recorderWorkerUrl from './recorder.worker.ts?worker&url';

import type {
  PcmEvent,
  RecordingChunk,
  RecordingChunkSink,
  Unsubscribe,
} from '../../contracts';

import { AudioEngineError, isQuotaExceededError } from '../errors';
import { EventStream } from '../events';

interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<RecorderWorkerResponse>) => void,
  ): void;
  removeEventListener(
    type: 'message',
    listener: (event: MessageEvent<RecorderWorkerResponse>) => void,
  ): void;
  terminate(): void;
}

type RecorderWorkerResponse =
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

export type RecorderWorkerFactory = () => WorkerLike;

export interface RecordingInputWriterOptions {
  readonly recordingId: string;
  readonly inputId: string;
  readonly sampleRate: number;
  readonly channels: number;
  readonly sink: RecordingChunkSink;
  readonly workerFactory?: RecorderWorkerFactory;
}

const createBrowserWorker: RecorderWorkerFactory = () =>
  new Worker(recorderWorkerUrl, {
    type: 'module',
    name: 'spector-recorder',
  });

/** Bridges a recorder Worker to the asynchronous chunk sink in write order. */
export class RecordingInputWriter {
  private readonly worker: WorkerLike;
  private readonly failureEvents = new EventStream<AudioEngineError>();
  private readonly configured: Promise<void>;
  private resolveConfigured: (() => void) | null = null;
  private rejectConfigured: ((error: unknown) => void) | null = null;
  private flushPromise: Promise<void> | null = null;
  private resolveFlushed: (() => void) | null = null;
  private rejectFlushed: ((error: unknown) => void) | null = null;
  private writes: Promise<void> = Promise.resolve();
  private failure: AudioEngineError | null = null;
  private terminated = false;

  constructor(private readonly options: RecordingInputWriterOptions) {
    this.worker = (options.workerFactory ?? createBrowserWorker)();
    this.configured = new Promise<void>((resolve, reject) => {
      this.resolveConfigured = resolve;
      this.rejectConfigured = reject;
    });
    this.worker.addEventListener('message', this.onMessage);
    this.worker.postMessage({
      type: 'configure',
      sampleRate: options.sampleRate,
      channels: options.channels,
    });
  }

  ready(): Promise<void> {
    return this.configured;
  }

  ensureHealthy(): void {
    if (this.failure !== null) throw this.failure;
    if (this.terminated) {
      throw new AudioEngineError(
        'recording-failed',
        '録音Workerは停止済みです。',
      );
    }
  }

  append(event: PcmEvent): void {
    if (this.terminated) return;
    if (
      event.sourceId !== this.options.inputId ||
      event.sampleRate !== this.options.sampleRate ||
      event.channels !== this.options.channels
    ) {
      this.fail(
        new AudioEngineError(
          'recording-failed',
          `入力 ${this.options.inputId} の音声形式が録音中に変わりました。`,
        ),
      );
      return;
    }

    const channelBuffers = event.channelData.map((channel) => {
      const copy = new Float32Array(channel);
      return copy.buffer;
    });
    this.worker.postMessage(
      {
        type: 'append',
        timestamp: event.timestamp,
        channelBuffers,
      },
      channelBuffers,
    );
  }

  flush(): Promise<void> {
    if (this.flushPromise !== null) return this.flushPromise;
    if (this.terminated) {
      return Promise.reject(
        this.failure ??
          new AudioEngineError(
            'recording-failed',
            '録音Workerは停止済みです。',
          ),
      );
    }
    this.flushPromise = new Promise<void>((resolve, reject) => {
      this.resolveFlushed = resolve;
      this.rejectFlushed = reject;
    });
    this.worker.postMessage({ type: 'flush' });
    return this.flushPromise;
  }

  abort(): void {
    this.cleanup();
  }

  subscribeFailure(listener: (error: AudioEngineError) => void): Unsubscribe {
    return this.failureEvents.subscribe(listener);
  }

  private readonly onMessage = (
    event: MessageEvent<RecorderWorkerResponse>,
  ): void => {
    const message = event.data;
    switch (message.type) {
      case 'configured':
        this.resolveConfigured?.();
        this.resolveConfigured = null;
        this.rejectConfigured = null;
        break;
      case 'chunk': {
        const chunk: RecordingChunk = {
          recordingId: this.options.recordingId,
          inputId: this.options.inputId,
          sequence: message.sequence,
          timestamp: message.timestamp,
          sampleRate: this.options.sampleRate,
          channels: this.options.channels,
          sampleCount: message.sampleCount,
          pcm16: message.pcm16,
        };
        this.writes = this.writes
          .then(() => this.options.sink.writeChunk(chunk))
          .catch((error: unknown) => {
            this.fail(
              new AudioEngineError(
                isQuotaExceededError(error)
                  ? 'insufficient-storage'
                  : 'recording-failed',
                isQuotaExceededError(error)
                  ? '録音データを保存する空き容量がありません。'
                  : '録音チャンクを保存できませんでした。',
                { cause: error },
              ),
            );
          });
        break;
      }
      case 'flushed':
        void this.finishFlush();
        break;
      case 'error':
        this.fail(new AudioEngineError('recording-failed', message.message));
        break;
    }
  };

  private async finishFlush(): Promise<void> {
    await this.writes;
    if (this.failure === null) {
      this.resolveFlushed?.();
    } else {
      this.rejectFlushed?.(this.failure);
    }
    this.resolveFlushed = null;
    this.rejectFlushed = null;
    this.cleanup();
  }

  private fail(error: AudioEngineError): void {
    if (this.failure !== null) return;
    this.failure = error;
    this.rejectConfigured?.(error);
    this.rejectConfigured = null;
    this.resolveConfigured = null;
    this.rejectFlushed?.(error);
    this.rejectFlushed = null;
    this.resolveFlushed = null;
    this.failureEvents.emit(error);
  }

  private cleanup(): void {
    if (this.terminated) return;
    this.terminated = true;
    this.worker.removeEventListener('message', this.onMessage);
    this.worker.terminate();
  }
}
