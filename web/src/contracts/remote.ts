import type { RemoteControlMessage } from '../domain';

import type { AudioSource, Unsubscribe } from './audio';

export type RemotePeerState = 'connecting' | 'connected' | 'disconnected';

export interface RemotePeerStateEvent {
  readonly peerId: string;
  readonly state: RemotePeerState;
  readonly reason: string | null;
}

export interface RemotePeer {
  readonly peerId: string;
  readonly displayName: string;
  readonly state: RemotePeerState;
  readonly source: AudioSource | null;
  sendControl(message: RemoteControlMessage): void;
  disconnect(): void;
  subscribeState(listener: (event: RemotePeerStateEvent) => void): Unsubscribe;
}
