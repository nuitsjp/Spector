import type { SignalLevelDbfs } from '../domain';

export type Unsubscribe = () => void;

export type AudioSourceKind = 'microphone' | 'system-audio' | 'remote';
export type AudioSourceState = 'idle' | 'active' | 'disconnected';

export interface AudioFormat {
  readonly sampleRate: number;
  readonly channels: number;
}

export interface LevelEvent {
  readonly sourceId: string;
  /** Capture timestamp in milliseconds. */
  readonly timestamp: number;
  readonly level: SignalLevelDbfs;
}

export interface PcmEvent extends AudioFormat {
  readonly sourceId: string;
  /** Capture timestamp in milliseconds. */
  readonly timestamp: number;
  /** One Float32Array per channel, with an equal number of sample frames. */
  readonly channelData: readonly Float32Array[];
}

export interface AudioSourceDisconnectedEvent {
  readonly sourceId: string;
  readonly reason: string;
}

export interface AudioSource {
  readonly id: string;
  readonly displayName: string;
  readonly kind: AudioSourceKind;
  readonly format: AudioFormat | null;
  readonly state: AudioSourceState;
  start(): Promise<void>;
  stop(): Promise<void>;
  subscribeLevel(listener: (event: LevelEvent) => void): Unsubscribe;
  subscribePcm(listener: (event: PcmEvent) => void): Unsubscribe;
  subscribeDisconnected(
    listener: (event: AudioSourceDisconnectedEvent) => void,
  ): Unsubscribe;
}
