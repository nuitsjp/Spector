import type {
  AudioFormat,
  AudioSource,
  AudioSourceDisconnectedEvent,
  AudioSourceState,
  LevelEvent,
  PcmEvent,
  Unsubscribe,
} from '../contracts';
import {
  AWeightingFilter,
  calculateRms,
  rmsToSignalLevelDbfs,
} from '../domain/dsp';

import type { DecodedPcm16WireFrame } from './pcmProtocol';

const subscribe = <T>(
  listeners: Set<(event: T) => void>,
  listener: (event: T) => void,
): Unsubscribe => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const emit = <T>(listeners: Set<(event: T) => void>, event: T): void => {
  for (const listener of listeners) {
    listener(event);
  }
};

const interleave = (channelData: readonly Float32Array[]): Float32Array => {
  const samplesPerChannel = channelData[0]?.length ?? 0;
  const samples = new Float32Array(samplesPerChannel * channelData.length);
  let outputIndex = 0;
  for (let sampleIndex = 0; sampleIndex < samplesPerChannel; sampleIndex += 1) {
    for (const channel of channelData) {
      samples[outputIndex] = channel[sampleIndex] ?? 0;
      outputIndex += 1;
    }
  }
  return samples;
};

export interface RemoteAudioSourceDescription extends AudioFormat {
  readonly sourceId: string;
  readonly name: string;
}

/** AudioSource adapter backed exclusively by PCM received over a DataChannel. */
export class RemoteAudioSource implements AudioSource {
  readonly kind = 'remote' as const;
  readonly format: AudioFormat;
  private sourceState: AudioSourceState = 'active';
  private readonly levelListeners = new Set<(event: LevelEvent) => void>();
  private readonly pcmListeners = new Set<(event: PcmEvent) => void>();
  private readonly disconnectedListeners = new Set<
    (event: AudioSourceDisconnectedEvent) => void
  >();
  private readonly aWeightingFilter: AWeightingFilter;

  constructor(private readonly description: RemoteAudioSourceDescription) {
    this.format = {
      sampleRate: description.sampleRate,
      channels: description.channels,
    };
    this.aWeightingFilter = new AWeightingFilter(description.sampleRate);
  }

  get id(): string {
    return this.description.sourceId;
  }

  get displayName(): string {
    return this.description.name;
  }

  get state(): AudioSourceState {
    return this.sourceState;
  }

  async start(): Promise<void> {
    if (this.sourceState === 'disconnected') {
      throw new Error('Remote audio source is disconnected.');
    }
    this.sourceState = 'active';
  }

  async stop(): Promise<void> {
    if (this.sourceState !== 'disconnected') {
      this.sourceState = 'idle';
    }
  }

  subscribeLevel(listener: (event: LevelEvent) => void): Unsubscribe {
    return subscribe(this.levelListeners, listener);
  }

  subscribePcm(listener: (event: PcmEvent) => void): Unsubscribe {
    return subscribe(this.pcmListeners, listener);
  }

  subscribeDisconnected(
    listener: (event: AudioSourceDisconnectedEvent) => void,
  ): Unsubscribe {
    return subscribe(this.disconnectedListeners, listener);
  }

  acceptFrame(frame: DecodedPcm16WireFrame): void {
    if (this.sourceState !== 'active') {
      return;
    }

    const pcmEvent: PcmEvent = {
      sourceId: this.id,
      timestamp: frame.timestamp,
      sampleRate: this.format.sampleRate,
      channels: this.format.channels,
      channelData: frame.channelData,
    };
    emit(this.pcmListeners, pcmEvent);

    const weighted = this.aWeightingFilter.process(
      interleave(frame.channelData),
    );
    const midpoint = Math.floor(weighted.length / 2);
    const windows =
      midpoint === 0
        ? [[0, weighted.length]]
        : [
            [0, midpoint],
            [midpoint, weighted.length],
          ];
    for (const [windowIndex, window] of windows.entries()) {
      const [startIndex, endIndex] = window;
      if (
        startIndex === undefined ||
        endIndex === undefined ||
        startIndex === endIndex
      ) {
        continue;
      }
      emit(this.levelListeners, {
        sourceId: this.id,
        timestamp: frame.timestamp + windowIndex * 25,
        level: rmsToSignalLevelDbfs(
          calculateRms(weighted, startIndex, endIndex),
        ),
      });
    }
  }

  disconnect(reason: string): void {
    if (this.sourceState === 'disconnected') {
      return;
    }

    this.sourceState = 'disconnected';
    emit(this.disconnectedListeners, { sourceId: this.id, reason });
  }
}
