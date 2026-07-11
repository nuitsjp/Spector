import { createSignalLevelDbfs, type SignalLevelDbfs } from '../../domain';
import type {
  AudioFormat,
  AudioSource,
  AudioSourceDisconnectedEvent,
  AudioSourceKind,
  AudioSourceState,
  LevelEvent,
  PcmEvent,
  Unsubscribe,
} from '../../contracts';

import { AudioEngineError, toAudioCaptureError } from '../errors';
import { EventStream } from '../events';

interface CaptureWindowMessage {
  readonly type: 'capture-window';
  readonly sampleRate: number;
  readonly timestamp: number;
  readonly level: number;
  readonly channelBuffers: readonly ArrayBuffer[];
}

interface CaptureErrorMessage {
  readonly type: 'capture-error';
  readonly message: string;
}

type CaptureWorkletMessage = CaptureWindowMessage | CaptureErrorMessage;

export interface BrowserAudioSourceOptions {
  readonly id: string;
  readonly displayName: string;
  readonly kind: Exclude<AudioSourceKind, 'remote'>;
  readonly context: AudioContext;
  readonly acquireStream: () => Promise<MediaStream>;
  readonly createWorkletNode?: (context: AudioContext) => AudioWorkletNode;
}

const createCaptureWorkletNode = (context: AudioContext): AudioWorkletNode =>
  new AudioWorkletNode(context, 'spector-capture', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });

export class BrowserAudioSource implements AudioSource {
  readonly id: string;
  readonly displayName: string;
  readonly kind: Exclude<AudioSourceKind, 'remote'>;

  private readonly context: AudioContext;
  private readonly acquireStream: () => Promise<MediaStream>;
  private readonly createWorkletNode: (
    context: AudioContext,
  ) => AudioWorkletNode;
  private readonly levelEvents = new EventStream<LevelEvent>();
  private readonly pcmEvents = new EventStream<PcmEvent>();
  private readonly disconnectedEvents =
    new EventStream<AudioSourceDisconnectedEvent>();
  private currentState: AudioSourceState = 'idle';
  private currentFormat: AudioFormat | null = null;
  private stream: MediaStream | null = null;
  private mediaNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private operation: Promise<void> = Promise.resolve();
  private intentionallyStopping = false;

  constructor(options: BrowserAudioSourceOptions) {
    this.id = options.id;
    this.displayName = options.displayName;
    this.kind = options.kind;
    this.context = options.context;
    this.acquireStream = options.acquireStream;
    this.createWorkletNode =
      options.createWorkletNode ?? createCaptureWorkletNode;
  }

  get state(): AudioSourceState {
    return this.currentState;
  }

  get format(): AudioFormat | null {
    return this.currentFormat;
  }

  start(): Promise<void> {
    return this.enqueue(async () => {
      if (this.currentState === 'active') return;
      if (this.context.state !== 'running') {
        throw new AudioEngineError(
          'invalid-state',
          'AudioContextが実行中ではありません。',
        );
      }

      let stream: MediaStream;
      try {
        stream = await this.acquireStream();
      } catch (error) {
        throw toAudioCaptureError(
          error,
          this.kind === 'microphone'
            ? 'microphone-capture'
            : 'display-audio-capture',
        );
      }

      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack === undefined) {
        for (const track of stream.getTracks()) track.stop();
        throw new AudioEngineError(
          'device-not-found',
          this.kind === 'microphone'
            ? '選択したマイクに音声トラックがありません。'
            : '共有された画面に音声トラックがありません。',
          {
            feature:
              this.kind === 'microphone'
                ? 'microphone-capture'
                : 'display-audio-capture',
          },
        );
      }

      let mediaNode: MediaStreamAudioSourceNode | null = null;
      let workletNode: AudioWorkletNode | null = null;
      try {
        mediaNode = this.context.createMediaStreamSource(stream);
        workletNode = this.createWorkletNode(this.context);
        mediaNode.connect(workletNode);
        workletNode.connect(this.context.destination);
        workletNode.port.addEventListener('message', this.onWorkletMessage);
        workletNode.port.start();

        this.stream = stream;
        this.mediaNode = mediaNode;
        this.workletNode = workletNode;
        const settings = audioTrack.getSettings();
        this.currentFormat = {
          sampleRate: this.context.sampleRate,
          channels: Math.max(
            1,
            settings.channelCount ?? mediaNode.channelCount,
          ),
        };
        this.currentState = 'active';
        this.intentionallyStopping = false;
        for (const track of stream.getTracks()) {
          track.addEventListener('ended', this.onTrackEnded);
        }
      } catch (error) {
        workletNode?.port.removeEventListener('message', this.onWorkletMessage);
        workletNode?.port.close();
        workletNode?.disconnect();
        mediaNode?.disconnect();
        for (const track of stream.getTracks()) track.stop();
        throw new AudioEngineError(
          'invalid-state',
          '音声処理グラフを開始できませんでした。',
          { cause: error },
        );
      }
    });
  }

  stop(): Promise<void> {
    return this.enqueue(async () => {
      if (this.currentState === 'idle') return;
      this.intentionallyStopping = true;
      this.releaseGraph();
      this.currentState = 'idle';
      this.currentFormat = null;
      this.intentionallyStopping = false;
    });
  }

  disconnect(reason: string): void {
    if (this.currentState !== 'active') return;
    this.currentState = 'disconnected';
    this.releaseGraph();
    this.disconnectedEvents.emit({ sourceId: this.id, reason });
  }

  subscribeLevel(listener: (event: LevelEvent) => void): Unsubscribe {
    return this.levelEvents.subscribe(listener);
  }

  subscribePcm(listener: (event: PcmEvent) => void): Unsubscribe {
    return this.pcmEvents.subscribe(listener);
  }

  subscribeDisconnected(
    listener: (event: AudioSourceDisconnectedEvent) => void,
  ): Unsubscribe {
    return this.disconnectedEvents.subscribe(listener);
  }

  private readonly onTrackEnded = (): void => {
    if (!this.intentionallyStopping) {
      this.disconnect('音声トラックが終了しました。');
    }
  };

  private readonly onWorkletMessage = (
    event: MessageEvent<CaptureWorkletMessage>,
  ): void => {
    if (this.currentState !== 'active') return;
    const message = event.data;
    if (message.type === 'capture-error') {
      this.disconnect(message.message);
      return;
    }

    const channelData = message.channelBuffers.map(
      (buffer) => new Float32Array(buffer),
    );
    if (channelData.length === 0) return;
    this.currentFormat = {
      sampleRate: message.sampleRate,
      channels: channelData.length,
    };
    const level = createSignalLevelDbfs(message.level) as SignalLevelDbfs;
    this.pcmEvents.emit({
      sourceId: this.id,
      timestamp: message.timestamp,
      sampleRate: message.sampleRate,
      channels: channelData.length,
      channelData,
    });
    this.levelEvents.emit({
      sourceId: this.id,
      timestamp: message.timestamp,
      level,
    });
  };

  private releaseGraph(): void {
    const stream = this.stream;
    this.stream = null;
    for (const track of stream?.getTracks() ?? []) {
      track.removeEventListener('ended', this.onTrackEnded);
      track.stop();
    }

    if (this.workletNode !== null) {
      this.workletNode.port.removeEventListener(
        'message',
        this.onWorkletMessage,
      );
      this.workletNode.port.close();
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    this.mediaNode?.disconnect();
    this.mediaNode = null;
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.operation.then(operation, operation);
    this.operation = result.catch(() => undefined);
    return result;
  }
}
