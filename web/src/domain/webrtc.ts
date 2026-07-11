import type { PlaybackGain } from './types';

export const CONTROL_PROTOCOL_VERSION = 1 as const;
export const PCM_PROTOCOL_VERSION = 1 as const;
export const PCM_FRAME_DURATION_MS = 50 as const;

export type RemoteControlMessage =
  | {
      readonly v: typeof CONTROL_PROTOCOL_VERSION;
      readonly type: 'hello';
      readonly sourceId: string;
      readonly name: string;
      readonly sampleRate: number;
      readonly channels: number;
    }
  | {
      readonly v: typeof CONTROL_PROTOCOL_VERSION;
      readonly type: 'startTestSignal';
      readonly playbackGain: PlaybackGain;
    }
  | {
      readonly v: typeof CONTROL_PROTOCOL_VERSION;
      readonly type: 'stopTestSignal';
    }
  | {
      readonly v: typeof CONTROL_PROTOCOL_VERSION;
      readonly type: 'disconnect';
    }
  | {
      readonly v: typeof CONTROL_PROTOCOL_VERSION;
      readonly type: 'error';
      readonly code: string;
      readonly message: string;
    };

/** Header shared by every little-endian PCM16 frame sent over `pcm-v1`. */
export interface Pcm16FrameHeader {
  readonly version: typeof PCM_PROTOCOL_VERSION;
  readonly sequence: number;
  /** Capture timestamp in milliseconds. */
  readonly timestamp: number;
  /** Number of sample frames per channel. */
  readonly sampleCount: number;
  readonly sampleRate: number;
  readonly channels: number;
}

export interface Pcm16Frame {
  readonly header: Pcm16FrameHeader;
  readonly pcm16: ArrayBuffer;
}
