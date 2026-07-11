import captureWorkletUrl from './capture/capture.worklet.ts?worker&url';

import type {
  AudioSource,
  RecordingChunkSink,
  Unsubscribe,
} from '../contracts';
import { createPlaybackGain, type PlaybackGain } from '../domain';

import { BrowserAudioSource } from './capture/browserAudioSource';
import { AudioEngineError } from './errors';
import { EventStream } from './events';
import {
  createTestNoisePlaybackForAudioContext,
  type TestNoisePlayback,
} from './playback/testNoise';
import type { RecordingCapacityProbe } from './recording/capacity';
import { RecordingSessionService } from './recording/recordingSession';

export interface AudioDeviceDescriptor {
  readonly id: string;
  readonly label: string;
  readonly kind: 'audioinput' | 'audiooutput';
}

export interface AudioDeviceSnapshot {
  readonly inputs: readonly AudioDeviceDescriptor[];
  readonly outputs: readonly AudioDeviceDescriptor[];
}

export interface AudioEngineFaultEvent {
  readonly code: 'audio-context-stopped';
  readonly reason: string;
}

export interface BrowserAudioEngineDependencies {
  readonly mediaDevices?: MediaDevices;
  readonly createAudioContext?: () => AudioContext;
  readonly createWorkletNode?: (context: AudioContext) => AudioWorkletNode;
  readonly workletModuleUrl?: string;
  readonly createId?: () => string;
}

type SinkSelectableAudioContext = AudioContext & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

const getBrowserMediaDevices = (): MediaDevices => {
  if (
    typeof navigator === 'undefined' ||
    navigator.mediaDevices === undefined
  ) {
    throw new AudioEngineError(
      'unsupported-feature',
      'MediaDevices APIに対応していません。',
      { feature: 'media-devices' },
    );
  }
  return navigator.mediaDevices;
};

const createBrowserAudioContext = (): AudioContext => {
  if (typeof AudioContext === 'undefined') {
    throw new AudioEngineError(
      'unsupported-feature',
      'Web Audio APIに対応していません。',
      { feature: 'web-audio' },
    );
  }
  return new AudioContext();
};

export class BrowserAudioEngine {
  private readonly dependencies: BrowserAudioEngineDependencies;
  private readonly deviceEvents = new EventStream<AudioDeviceSnapshot>();
  private readonly faultEvents = new EventStream<AudioEngineFaultEvent>();
  private readonly sources = new Map<string, BrowserAudioSource>();
  private context: AudioContext | null = null;
  private mediaDevices: MediaDevices | null = null;
  private playbackGainNode: GainNode | null = null;
  private currentPlaybackGain = createPlaybackGain(1);
  private currentOutputId: string | null = null;
  private currentDevices: AudioDeviceSnapshot = { inputs: [], outputs: [] };
  private operation: Promise<void> = Promise.resolve();
  private initialized = false;
  private disposing = false;

  constructor(dependencies: BrowserAudioEngineDependencies = {}) {
    this.dependencies = dependencies;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  get devices(): AudioDeviceSnapshot {
    return this.currentDevices;
  }

  get audioSources(): readonly AudioSource[] {
    return [...this.sources.values()];
  }

  get playbackGain(): PlaybackGain {
    return this.currentPlaybackGain;
  }

  get playbackOutputId(): string | null {
    return this.currentOutputId;
  }

  get audioContext(): AudioContext {
    if (this.context === null) {
      throw new AudioEngineError(
        'invalid-state',
        '音声デバイスはまだ有効化されていません。',
      );
    }
    return this.context;
  }

  /** Must be invoked synchronously from a user gesture. */
  initialize(): Promise<void> {
    return this.enqueue(async () => {
      if (this.initialized) return;
      const mediaDevices =
        this.dependencies.mediaDevices ?? getBrowserMediaDevices();
      if (typeof mediaDevices.getUserMedia !== 'function') {
        throw new AudioEngineError(
          'unsupported-feature',
          'マイク取得APIに対応していません。',
          { feature: 'microphone-capture' },
        );
      }

      const context =
        this.dependencies.createAudioContext?.() ?? createBrowserAudioContext();
      if (context.audioWorklet === undefined) {
        await context.close();
        throw new AudioEngineError(
          'unsupported-feature',
          'AudioWorkletに対応していません。',
          { feature: 'audio-worklet' },
        );
      }

      try {
        await context.audioWorklet.addModule(
          this.dependencies.workletModuleUrl ?? captureWorkletUrl,
        );
        await context.resume();
        if (context.state !== 'running') {
          throw new AudioEngineError(
            'invalid-state',
            'AudioContextを開始できませんでした。',
          );
        }

        const gainNode = context.createGain();
        gainNode.gain.value = this.currentPlaybackGain;
        gainNode.connect(context.destination);
        context.addEventListener('statechange', this.onContextStateChange);
        mediaDevices.addEventListener('devicechange', this.onDeviceChange);

        this.context = context;
        this.mediaDevices = mediaDevices;
        this.playbackGainNode = gainNode;
        this.initialized = true;
        await this.refreshDevices();
      } catch (error) {
        mediaDevices.removeEventListener('devicechange', this.onDeviceChange);
        context.removeEventListener('statechange', this.onContextStateChange);
        this.playbackGainNode?.disconnect();
        this.playbackGainNode = null;
        this.context = null;
        this.mediaDevices = null;
        this.initialized = false;
        await context.close();
        if (error instanceof AudioEngineError) throw error;
        throw new AudioEngineError(
          'invalid-state',
          '音声エンジンを初期化できませんでした。',
          { cause: error },
        );
      }
    });
  }

  async refreshDevices(): Promise<AudioDeviceSnapshot> {
    const mediaDevices = this.requireMediaDevices();
    const devices = await mediaDevices.enumerateDevices();
    const toDescriptor = (device: MediaDeviceInfo): AudioDeviceDescriptor => ({
      id: device.deviceId,
      label: device.label || '名前を取得できない音声デバイス',
      kind: device.kind as 'audioinput' | 'audiooutput',
    });
    this.currentDevices = {
      inputs: devices
        .filter((device) => device.kind === 'audioinput')
        .map(toDescriptor),
      outputs: devices
        .filter((device) => device.kind === 'audiooutput')
        .map(toDescriptor),
    };
    this.deviceEvents.emit(this.currentDevices);

    const inputIds = new Set(
      this.currentDevices.inputs.map((device) => device.id),
    );
    for (const source of this.sources.values()) {
      if (
        source.kind === 'microphone' &&
        source.state === 'active' &&
        !inputIds.has(source.id.slice('microphone:'.length))
      ) {
        source.disconnect('マイクが取り外されました。');
      }
    }
    return this.currentDevices;
  }

  async startMicrophone(deviceId: string): Promise<AudioSource> {
    const context = this.audioContext;
    const mediaDevices = this.requireMediaDevices();
    const descriptor = this.currentDevices.inputs.find(
      (device) => device.id === deviceId,
    );
    if (descriptor === undefined) {
      throw new AudioEngineError(
        'device-not-found',
        '選択したマイクが見つかりません。',
        { feature: 'microphone-capture' },
      );
    }

    const sourceId = `microphone:${deviceId}`;
    let source = this.sources.get(sourceId);
    if (source === undefined) {
      source = new BrowserAudioSource({
        id: sourceId,
        displayName: descriptor.label,
        kind: 'microphone',
        context,
        acquireStream: () =>
          mediaDevices.getUserMedia({
            audio: { deviceId: { exact: deviceId } },
            video: false,
          }),
        ...(this.dependencies.createWorkletNode === undefined
          ? {}
          : { createWorkletNode: this.dependencies.createWorkletNode }),
      });
      this.sources.set(sourceId, source);
    }
    await source.start();
    return source;
  }

  async startSystemAudio(): Promise<AudioSource> {
    const context = this.audioContext;
    const mediaDevices = this.requireMediaDevices();
    if (typeof mediaDevices.getDisplayMedia !== 'function') {
      throw new AudioEngineError(
        'unsupported-feature',
        'システム音声共有APIに対応していません。',
        { feature: 'display-audio-capture' },
      );
    }

    const sourceId = `system-audio:${
      this.dependencies.createId?.() ?? crypto.randomUUID()
    }`;
    const source = new BrowserAudioSource({
      id: sourceId,
      displayName: 'システム音声',
      kind: 'system-audio',
      context,
      acquireStream: () =>
        mediaDevices.getDisplayMedia({
          audio: true,
          video: true,
        }),
      ...(this.dependencies.createWorkletNode === undefined
        ? {}
        : { createWorkletNode: this.dependencies.createWorkletNode }),
    });
    this.sources.set(sourceId, source);
    try {
      await source.start();
      return source;
    } catch (error) {
      this.sources.delete(sourceId);
      throw error;
    }
  }

  async stopSource(sourceId: string): Promise<void> {
    const source = this.sources.get(sourceId);
    if (source === undefined) return;
    await source.stop();
    this.sources.delete(sourceId);
  }

  async setPlaybackOutput(deviceId: string): Promise<void> {
    const context = this.audioContext as SinkSelectableAudioContext;
    if (typeof context.setSinkId !== 'function') {
      throw new AudioEngineError(
        'unsupported-feature',
        '再生出力先の選択に対応していません。',
        { feature: 'playback-output-selection' },
      );
    }
    if (!this.currentDevices.outputs.some((device) => device.id === deviceId)) {
      throw new AudioEngineError(
        'device-not-found',
        '選択した再生出力が見つかりません。',
        { feature: 'playback-output-selection' },
      );
    }
    try {
      await context.setSinkId(deviceId);
      this.currentOutputId = deviceId;
    } catch (error) {
      throw new AudioEngineError(
        'invalid-state',
        '再生出力を変更できませんでした。',
        { feature: 'playback-output-selection', cause: error },
      );
    }
  }

  setPlaybackGain(gain: PlaybackGain): void {
    this.currentPlaybackGain = gain;
    if (this.playbackGainNode !== null) {
      this.playbackGainNode.gain.setValueAtTime(
        gain,
        this.audioContext.currentTime,
      );
    }
  }

  /** Destination for test-signal nodes; already routed through the site gain. */
  getPlaybackDestination(): AudioNode {
    if (this.playbackGainNode === null) {
      throw new AudioEngineError(
        'invalid-state',
        '音声デバイスはまだ有効化されていません。',
      );
    }
    return this.playbackGainNode;
  }

  createTestNoisePlayback(): TestNoisePlayback {
    if (this.playbackGainNode === null) {
      throw new AudioEngineError(
        'invalid-state',
        '音声デバイスはまだ有効化されていません。',
      );
    }
    const playback = createTestNoisePlaybackForAudioContext(
      this.audioContext,
      this.playbackGainNode,
    );
    return {
      get isPlaying() {
        return playback.isPlaying;
      },
      start: async (gain) => {
        this.setPlaybackGain(gain);
        await playback.start(gain);
      },
      stop: () => playback.stop(),
    };
  }

  createRecordingSessionService(
    sink: RecordingChunkSink,
    capacityProbe?: RecordingCapacityProbe,
  ): RecordingSessionService {
    return new RecordingSessionService({
      sink,
      testNoisePlayback: this.createTestNoisePlayback(),
      faultSource: this,
      ...(capacityProbe === undefined ? {} : { capacityProbe }),
    });
  }

  subscribeDevices(
    listener: (snapshot: AudioDeviceSnapshot) => void,
  ): Unsubscribe {
    return this.deviceEvents.subscribe(listener);
  }

  subscribeFault(
    listener: (event: AudioEngineFaultEvent) => void,
  ): Unsubscribe {
    return this.faultEvents.subscribe(listener);
  }

  async dispose(): Promise<void> {
    this.disposing = true;
    const sources = [...this.sources.values()];
    this.sources.clear();
    await Promise.all(sources.map((source) => source.stop()));

    if (this.mediaDevices !== null) {
      this.mediaDevices.removeEventListener(
        'devicechange',
        this.onDeviceChange,
      );
    }
    if (this.context !== null) {
      this.context.removeEventListener(
        'statechange',
        this.onContextStateChange,
      );
    }
    this.playbackGainNode?.disconnect();
    this.playbackGainNode = null;
    await this.context?.close();
    this.context = null;
    this.mediaDevices = null;
    this.initialized = false;
    this.currentOutputId = null;
    this.currentDevices = { inputs: [], outputs: [] };
    this.disposing = false;
  }

  private requireMediaDevices(): MediaDevices {
    if (!this.initialized || this.mediaDevices === null) {
      throw new AudioEngineError(
        'invalid-state',
        '音声デバイスはまだ有効化されていません。',
      );
    }
    return this.mediaDevices;
  }

  private readonly onDeviceChange = (): void => {
    void this.refreshDevices().catch(() => undefined);
  };

  private readonly onContextStateChange = (): void => {
    if (
      !this.disposing &&
      this.initialized &&
      this.context !== null &&
      this.context.state !== 'running'
    ) {
      this.faultEvents.emit({
        code: 'audio-context-stopped',
        reason: `AudioContextが${this.context.state}になりました。`,
      });
    }
  };

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.operation.then(operation, operation);
    this.operation = result.catch(() => undefined);
    return result;
  }
}
