import type {
  AudioSource,
  RemotePeerState,
  RemotePeerStateEvent,
  Unsubscribe,
} from '../contracts';
import {
  CONTROL_PROTOCOL_VERSION,
  type PlaybackGain,
  type RemoteControlMessage,
} from '../domain';

import {
  parseControlMessage,
  RemoteProtocolError,
  serializeControlMessage,
} from './controlProtocol';
import { encodePcm16WireFrame, Pcm16FramePacketizer } from './pcmProtocol';
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

export interface RemoteTerminalAudio {
  readonly source: AudioSource;
  startTestSignal(playbackGain: PlaybackGain): Promise<void>;
  stopTestSignal(): Promise<void>;
}

export interface RemoteTerminalOptions {
  readonly audio: RemoteTerminalAudio;
  readonly peerId?: string;
  readonly peerConnectionFactory?: RtcPeerConnectionFactory;
}

const createPeerId = (): string => crypto.randomUUID();

export class RemoteTerminalSession {
  readonly peerId: string;
  private readonly audio: RemoteTerminalAudio;
  private readonly peerConnection: RtcPeerConnectionLike;
  private controlChannel: RtcDataChannelLike | null = null;
  private pcmChannel: RtcDataChannelLike | null = null;
  private peerState: RemotePeerState = 'connecting';
  private answerCreated = false;
  private starting: Promise<void> | null = null;
  private ending = false;
  private sequence = 0;
  private unsubscribePcm: Unsubscribe | null = null;
  private unsubscribeSourceDisconnected: Unsubscribe | null = null;
  private controlQueue: Promise<void> = Promise.resolve();
  private readonly stateListeners = new Set<
    (event: RemotePeerStateEvent) => void
  >();

  constructor(options: RemoteTerminalOptions) {
    this.peerId = options.peerId ?? createPeerId();
    this.audio = options.audio;
    const peerConnectionFactory =
      options.peerConnectionFactory ?? createBrowserPeerConnection;
    this.peerConnection = peerConnectionFactory({ iceServers: [] });
    this.peerConnection.addEventListener('datachannel', this.handleDataChannel);
    this.peerConnection.addEventListener(
      'connectionstatechange',
      this.handleConnectionStateChange,
    );
  }

  get state(): RemotePeerState {
    return this.peerState;
  }

  async acceptOfferAndCreateAnswer(offerSdp: string): Promise<string> {
    if (this.answerCreated) {
      throw new Error('An answer has already been created for this session.');
    }
    assertManualSdp(offerSdp, 'offer');
    this.answerCreated = true;

    try {
      await this.peerConnection.setRemoteDescription({
        type: 'offer',
        sdp: offerSdp,
      });
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      return await getGatheredLocalSdp(this.peerConnection);
    } catch (error) {
      this.end(
        error instanceof Error
          ? error.message
          : 'Failed to create WebRTC answer.',
      );
      throw error;
    }
  }

  disconnect(): void {
    if (this.ending) {
      return;
    }
    if (this.controlChannel?.readyState === 'open') {
      this.controlChannel.send(
        serializeControlMessage({
          v: CONTROL_PROTOCOL_VERSION,
          type: 'disconnect',
        }),
      );
    }
    this.end('端末側で接続を終了しました。');
  }

  subscribeState(listener: (event: RemotePeerStateEvent) => void): Unsubscribe {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  private readonly handleDataChannel: EventListener = (event) => {
    try {
      const channel = (event as RTCDataChannelEvent).channel as unknown as
        RtcDataChannelLike | undefined;
      if (channel === undefined) {
        throw new RemoteProtocolError(
          'invalid-data-channel',
          'WebRTC datachannel event did not contain a channel.',
        );
      }
      assertReliableOrderedChannel(channel);

      if (channel.label === CONTROL_DATA_CHANNEL_LABEL) {
        if (this.controlChannel !== null) {
          throw new RemoteProtocolError(
            'duplicate-data-channel',
            'Received duplicate control-v1 DataChannel.',
          );
        }
        this.controlChannel = channel;
        channel.addEventListener('message', this.handleControlMessage);
        channel.addEventListener('open', this.handleChannelOpen);
        channel.addEventListener('close', this.handleControlClose);
      } else if (channel.label === PCM_DATA_CHANNEL_LABEL) {
        if (this.pcmChannel !== null) {
          throw new RemoteProtocolError(
            'duplicate-data-channel',
            'Received duplicate pcm-v1 DataChannel.',
          );
        }
        this.pcmChannel = channel;
        channel.binaryType = 'arraybuffer';
        channel.addEventListener('open', this.handleChannelOpen);
        channel.addEventListener('close', this.handlePcmClose);
      } else {
        throw new RemoteProtocolError(
          'unexpected-data-channel',
          `Unexpected DataChannel: ${channel.label}.`,
        );
      }

      this.maybeStartStreaming();
    } catch (error) {
      this.failProtocol(error);
    }
  };

  private readonly handleChannelOpen: EventListener = () => {
    this.maybeStartStreaming();
  };

  private readonly handleControlMessage: EventListener = (event) => {
    let message: RemoteControlMessage;
    try {
      message = parseControlMessage((event as MessageEvent).data);
    } catch (error) {
      this.failProtocol(error);
      return;
    }

    this.controlQueue = this.controlQueue
      .then(async () => {
        switch (message.type) {
          case 'startTestSignal':
            await this.audio.startTestSignal(message.playbackGain);
            return;
          case 'stopTestSignal':
            await this.audio.stopTestSignal();
            return;
          case 'disconnect':
            this.end('集約側で接続を終了しました。');
            return;
          case 'error':
            this.end(`集約側エラー (${message.code}): ${message.message}`);
            return;
          case 'hello':
            throw new RemoteProtocolError(
              'unexpected-control-message',
              'Terminal cannot receive hello.',
            );
        }
      })
      .catch((error: unknown) => {
        this.failProtocol(error);
      });
  };

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

  private maybeStartStreaming(): void {
    if (
      this.starting !== null ||
      this.ending ||
      this.controlChannel?.readyState !== 'open' ||
      this.pcmChannel?.readyState !== 'open'
    ) {
      return;
    }

    this.starting = this.startStreaming().catch((error: unknown) => {
      this.failProtocol(error);
    });
  }

  private async startStreaming(): Promise<void> {
    await this.audio.source.start();
    const format = this.audio.source.format;
    if (format === null) {
      throw new RemoteProtocolError(
        'missing-audio-format',
        'Audio source did not expose a format after start().',
      );
    }

    const controlChannel = this.controlChannel;
    const pcmChannel = this.pcmChannel;
    if (
      controlChannel?.readyState !== 'open' ||
      pcmChannel?.readyState !== 'open'
    ) {
      throw new RemoteProtocolError(
        'data-channel-closed',
        'DataChannel closed while starting remote audio.',
      );
    }

    const packetizer = new Pcm16FramePacketizer(format);
    controlChannel.send(
      serializeControlMessage({
        v: CONTROL_PROTOCOL_VERSION,
        type: 'hello',
        sourceId: this.audio.source.id,
        name: this.audio.source.displayName,
        sampleRate: format.sampleRate,
        channels: format.channels,
      }),
    );

    this.unsubscribePcm = this.audio.source.subscribePcm((event) => {
      try {
        if (event.sourceId !== this.audio.source.id) {
          throw new RemoteProtocolError(
            'pcm-format-mismatch',
            'Audio source emitted PCM for a different source ID.',
          );
        }
        if (this.pcmChannel?.readyState !== 'open') {
          throw new RemoteProtocolError(
            'data-channel-closed',
            'pcm-v1 DataChannel is not open.',
          );
        }

        for (const frame of packetizer.push(event)) {
          this.pcmChannel.send(
            encodePcm16WireFrame({
              ...frame,
              sequence: this.sequence,
            }),
          );
          this.sequence = (this.sequence + 1) >>> 0;
        }
      } catch (error) {
        this.failProtocol(error);
      }
    });
    this.unsubscribeSourceDisconnected =
      this.audio.source.subscribeDisconnected((event) => {
        this.failProtocol(
          new RemoteProtocolError('audio-source-disconnected', event.reason),
        );
      });
    this.setState('connected', null);
  }

  private failProtocol(error: unknown): void {
    const protocolError =
      error instanceof RemoteProtocolError
        ? error
        : new RemoteProtocolError(
            'protocol-error',
            error instanceof Error ? error.message : 'Remote protocol error.',
          );

    if (this.controlChannel?.readyState === 'open') {
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
    this.unsubscribePcm?.();
    this.unsubscribeSourceDisconnected?.();
    this.unsubscribePcm = null;
    this.unsubscribeSourceDisconnected = null;
    this.setState('disconnected', reason);
    this.controlChannel?.close();
    this.pcmChannel?.close();
    this.peerConnection.close();
    void this.audio.stopTestSignal().catch(() => undefined);
    void this.audio.source.stop().catch(() => undefined);
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

export const createRemoteTerminalSession = (
  options: RemoteTerminalOptions,
): RemoteTerminalSession => new RemoteTerminalSession(options);
