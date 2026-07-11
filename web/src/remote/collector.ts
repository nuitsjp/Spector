import type {
  RemotePeer,
  RemotePeerState,
  RemotePeerStateEvent,
  Unsubscribe,
} from '../contracts';
import { CONTROL_PROTOCOL_VERSION, type RemoteControlMessage } from '../domain';

import {
  parseControlMessage,
  RemoteProtocolError,
  serializeControlMessage,
} from './controlProtocol';
import { decodePcm16WireFrame, getPcmFrameSampleCount } from './pcmProtocol';
import { RemoteAudioSource } from './remoteAudioSource';
import {
  assertManualSdp,
  assertReliableOrderedChannel,
  CONTROL_DATA_CHANNEL_LABEL,
  createBrowserPeerConnection,
  getGatheredLocalSdp,
  PCM_DATA_CHANNEL_LABEL,
  type RtcDataChannelLike,
  type RtcPeerConnectionFactory,
  type RtcPeerConnectionLike,
} from './transport';

export interface RemoteCollectorOptions {
  readonly peerId?: string;
  readonly peerConnectionFactory?: RtcPeerConnectionFactory;
}

export const MAX_PENDING_PCM_FRAMES_BEFORE_HELLO = 20;

const createPeerId = (): string => crypto.randomUUID();

export class RemoteCollectorSession implements RemotePeer {
  readonly peerId: string;
  private readonly peerConnection: RtcPeerConnectionLike;
  private readonly controlChannel: RtcDataChannelLike;
  private readonly pcmChannel: RtcDataChannelLike;
  private peerState: RemotePeerState = 'connecting';
  private remoteSource: RemoteAudioSource | null = null;
  private expectedSequence = 0;
  private readonly pendingPcmFrames: ArrayBuffer[] = [];
  private offerCreated = false;
  private answerAccepted = false;
  private ending = false;
  private readonly stateListeners = new Set<
    (event: RemotePeerStateEvent) => void
  >();

  constructor(options: RemoteCollectorOptions = {}) {
    this.peerId = options.peerId ?? createPeerId();
    const peerConnectionFactory =
      options.peerConnectionFactory ?? createBrowserPeerConnection;
    this.peerConnection = peerConnectionFactory({ iceServers: [] });
    this.controlChannel = this.peerConnection.createDataChannel(
      CONTROL_DATA_CHANNEL_LABEL,
      { ordered: true },
    );
    this.pcmChannel = this.peerConnection.createDataChannel(
      PCM_DATA_CHANNEL_LABEL,
      { ordered: true },
    );

    assertReliableOrderedChannel(this.controlChannel);
    assertReliableOrderedChannel(this.pcmChannel);
    this.pcmChannel.binaryType = 'arraybuffer';
    this.attachChannelHandlers();
    this.peerConnection.addEventListener(
      'connectionstatechange',
      this.handleConnectionStateChange,
    );
  }

  get displayName(): string {
    return this.remoteSource?.displayName ?? '接続中の端末';
  }

  get state(): RemotePeerState {
    return this.peerState;
  }

  get source(): RemoteAudioSource | null {
    return this.remoteSource;
  }

  async createOffer(): Promise<string> {
    if (this.offerCreated) {
      throw new Error('An offer has already been created for this session.');
    }
    this.offerCreated = true;

    try {
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      return await getGatheredLocalSdp(this.peerConnection);
    } catch (error) {
      this.end(
        error instanceof Error
          ? error.message
          : 'Failed to create WebRTC offer.',
      );
      throw error;
    }
  }

  async acceptAnswer(answerSdp: string): Promise<void> {
    if (!this.offerCreated) {
      throw new Error('Create an offer before accepting an answer.');
    }
    if (this.answerAccepted) {
      throw new Error('An answer has already been accepted for this session.');
    }
    assertManualSdp(answerSdp, 'answer');
    this.answerAccepted = true;

    try {
      await this.peerConnection.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      });
    } catch (error) {
      this.end(
        error instanceof Error
          ? error.message
          : 'Failed to accept WebRTC answer.',
      );
      throw error;
    }
  }

  sendControl(message: RemoteControlMessage): void {
    if (message.type === 'hello' || message.type === 'disconnect') {
      throw new Error(
        `${message.type} is not a collector-to-terminal control command.`,
      );
    }
    if (this.controlChannel.readyState !== 'open') {
      throw new Error('Remote control channel is not open.');
    }
    this.controlChannel.send(serializeControlMessage(message));
  }

  disconnect(): void {
    if (this.ending) {
      return;
    }
    if (this.controlChannel.readyState === 'open') {
      this.controlChannel.send(
        serializeControlMessage({
          v: CONTROL_PROTOCOL_VERSION,
          type: 'disconnect',
        }),
      );
    }
    this.end('集約側で接続を終了しました。');
  }

  subscribeState(listener: (event: RemotePeerStateEvent) => void): Unsubscribe {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  private attachChannelHandlers(): void {
    this.controlChannel.addEventListener('message', this.handleControlMessage);
    this.controlChannel.addEventListener('close', this.handleControlClose);
    this.pcmChannel.addEventListener('message', this.handlePcmMessage);
    this.pcmChannel.addEventListener('close', this.handlePcmClose);
  }

  private readonly handleControlMessage: EventListener = (event) => {
    try {
      const message = parseControlMessage((event as MessageEvent).data);
      switch (message.type) {
        case 'hello':
          if (this.remoteSource !== null) {
            throw new RemoteProtocolError(
              'duplicate-hello',
              'Remote terminal sent hello more than once.',
            );
          }
          getPcmFrameSampleCount(message.sampleRate);
          this.remoteSource = new RemoteAudioSource({
            sourceId: message.sourceId,
            name: message.name,
            sampleRate: message.sampleRate,
            channels: message.channels,
          });
          for (const pendingFrame of this.pendingPcmFrames.splice(0)) {
            this.processPcmFrame(pendingFrame);
          }
          this.setState('connected', null);
          return;
        case 'disconnect':
          this.end('端末側で接続を終了しました。');
          return;
        case 'error':
          this.end(`端末エラー (${message.code}): ${message.message}`);
          return;
        case 'startTestSignal':
        case 'stopTestSignal':
          throw new RemoteProtocolError(
            'unexpected-control-message',
            `Collector cannot receive ${message.type}.`,
          );
      }
    } catch (error) {
      this.failProtocol(error);
    }
  };

  private readonly handlePcmMessage: EventListener = (event) => {
    try {
      const data = (event as MessageEvent).data as unknown;
      if (!(data instanceof ArrayBuffer)) {
        throw new RemoteProtocolError(
          'invalid-pcm-frame',
          'PCM data channel accepts ArrayBuffer messages only.',
        );
      }

      if (this.remoteSource === null) {
        if (
          this.pendingPcmFrames.length >= MAX_PENDING_PCM_FRAMES_BEFORE_HELLO
        ) {
          throw new RemoteProtocolError(
            'pcm-before-hello-overflow',
            `More than ${String(MAX_PENDING_PCM_FRAMES_BEFORE_HELLO)} PCM frames arrived before hello.`,
          );
        }
        this.pendingPcmFrames.push(data.slice(0));
        return;
      }

      this.processPcmFrame(data);
    } catch (error) {
      this.failProtocol(error);
    }
  };

  private processPcmFrame(data: ArrayBuffer): void {
    const remoteSource = this.remoteSource;
    if (remoteSource === null) {
      throw new Error(
        'Cannot process PCM before the remote source is created.',
      );
    }

    const frame = decodePcm16WireFrame(data, remoteSource.format.channels);
    if (frame.sequence !== this.expectedSequence) {
      throw new RemoteProtocolError(
        'pcm-sequence-error',
        `Expected PCM sequence ${String(this.expectedSequence)}, received ${String(frame.sequence)}.`,
      );
    }
    if (
      frame.sampleCount !==
      getPcmFrameSampleCount(remoteSource.format.sampleRate)
    ) {
      throw new RemoteProtocolError(
        'pcm-format-mismatch',
        'PCM frame duration does not match the format announced by hello.',
      );
    }

    this.expectedSequence = (this.expectedSequence + 1) >>> 0;
    remoteSource.acceptFrame(frame);
  }

  private readonly handleControlClose: EventListener = () => {
    this.end('control-v1 DataChannelが閉じられました。');
  };

  private readonly handlePcmClose: EventListener = () => {
    this.end('pcm-v1 DataChannelが閉じられました。');
  };

  private readonly handleConnectionStateChange: EventListener = () => {
    if (
      this.peerConnection.connectionState === 'failed' ||
      this.peerConnection.connectionState === 'disconnected' ||
      this.peerConnection.connectionState === 'closed'
    ) {
      this.end(
        `WebRTC接続が${this.peerConnection.connectionState}になりました。`,
      );
    }
  };

  private failProtocol(error: unknown): void {
    const protocolError =
      error instanceof RemoteProtocolError
        ? error
        : new RemoteProtocolError(
            'protocol-error',
            error instanceof Error ? error.message : 'Remote protocol error.',
          );

    if (this.controlChannel.readyState === 'open') {
      this.controlChannel.send(
        serializeControlMessage({
          v: CONTROL_PROTOCOL_VERSION,
          type: 'error',
          code: protocolError.code,
          message: protocolError.message,
        }),
      );
    }
    this.end(
      `リモート音声プロトコルエラー (${protocolError.code}): ${protocolError.message}`,
    );
  }

  private end(reason: string): void {
    if (this.ending) {
      return;
    }
    this.ending = true;
    this.pendingPcmFrames.length = 0;
    this.remoteSource?.disconnect(reason);
    this.setState('disconnected', reason);
    this.controlChannel.close();
    this.pcmChannel.close();
    this.peerConnection.close();
  }

  private setState(state: RemotePeerState, reason: string | null): void {
    if (this.peerState === state && state !== 'disconnected') {
      return;
    }
    this.peerState = state;
    const event: RemotePeerStateEvent = {
      peerId: this.peerId,
      state,
      reason,
    };
    for (const listener of this.stateListeners) {
      listener(event);
    }
  }
}

export const createRemoteCollectorSession = (
  options: RemoteCollectorOptions = {},
): RemoteCollectorSession => new RemoteCollectorSession(options);
