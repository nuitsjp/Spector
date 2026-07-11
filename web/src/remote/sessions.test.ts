import { describe, expect, it } from 'vitest';

import type {
  AudioFormat,
  AudioSource,
  AudioSourceDisconnectedEvent,
  AudioSourceState,
  LevelEvent,
  PcmEvent,
  RemotePeerStateEvent,
  Unsubscribe,
} from '../contracts';
import { createPlaybackGain } from '../domain';

import {
  createRemoteCollectorSession,
  MAX_PENDING_PCM_FRAMES_BEFORE_HELLO,
} from './collector';
import { encodePcm16WireFrame } from './pcmProtocol';
import {
  createRemoteTerminalSession,
  type RemoteTerminalAudio,
} from './terminal';
import type {
  RtcDataChannelLike,
  RtcPeerConnectionFactory,
  RtcPeerConnectionLike,
} from './transport';

class FakeDataChannel extends EventTarget implements RtcDataChannelLike {
  readonly maxPacketLifeTime: number | null;
  readonly maxRetransmits: number | null;
  binaryType: BinaryType = 'blob';
  readyState: RTCDataChannelState = 'connecting';
  counterpart: FakeDataChannel | null = null;
  holdOutgoingMessages = false;
  private readonly heldMessages: (string | ArrayBuffer)[] = [];

  constructor(
    readonly label: string,
    readonly ordered: boolean,
    init: RTCDataChannelInit,
  ) {
    super();
    this.maxPacketLifeTime = init.maxPacketLifeTime ?? null;
    this.maxRetransmits = init.maxRetransmits ?? null;
  }

  send(data: string | ArrayBuffer): void {
    if (this.readyState !== 'open') {
      throw new Error(`${this.label} is not open.`);
    }
    const counterpart = this.counterpart;
    if (counterpart?.readyState !== 'open') {
      throw new Error(`${this.label} counterpart is not open.`);
    }
    if (this.holdOutgoingMessages) {
      this.heldMessages.push(data);
      return;
    }
    counterpart.dispatchEvent(new MessageEvent('message', { data }));
  }

  flushHeldMessages(): void {
    this.holdOutgoingMessages = false;
    const counterpart = this.counterpart;
    if (counterpart?.readyState !== 'open') {
      throw new Error(`${this.label} counterpart is not open.`);
    }
    for (const data of this.heldMessages.splice(0)) {
      counterpart.dispatchEvent(new MessageEvent('message', { data }));
    }
  }

  open(): void {
    if (this.readyState !== 'connecting') {
      return;
    }
    this.readyState = 'open';
    this.dispatchEvent(new Event('open'));
  }

  close(): void {
    this.closePair(true);
  }

  private closePair(closeCounterpart: boolean): void {
    if (this.readyState === 'closed') {
      return;
    }
    this.readyState = 'closed';
    this.dispatchEvent(new Event('close'));
    if (closeCounterpart) {
      this.counterpart?.closePair(false);
    }
  }
}

class FakePeerConnection extends EventTarget implements RtcPeerConnectionLike {
  localDescription: RTCSessionDescriptionInit | null = null;
  iceGatheringState: RTCIceGatheringState = 'new';
  connectionState: RTCPeerConnectionState = 'new';
  readonly channels: FakeDataChannel[] = [];
  readonly createdChannels: {
    readonly label: string;
    readonly init: RTCDataChannelInit;
  }[] = [];

  constructor(
    readonly configuration: RTCConfiguration,
    private readonly environment: FakeRtcEnvironment,
  ) {
    super();
  }

  createDataChannel(
    label: string,
    init: RTCDataChannelInit = {},
  ): FakeDataChannel {
    const channel = new FakeDataChannel(label, init.ordered ?? true, init);
    this.channels.push(channel);
    this.createdChannels.push({ label, init });
    return channel;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'offer', sdp: 'fake-offer' };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'answer', sdp: 'fake-answer' };
  }

  async setLocalDescription(
    description: RTCSessionDescriptionInit,
  ): Promise<void> {
    this.localDescription = {
      ...description,
      sdp: `${description.sdp ?? ''}-with-host-candidate`,
    };
    this.iceGatheringState = 'gathering';
    queueMicrotask(() => {
      this.iceGatheringState = 'complete';
      this.dispatchEvent(new Event('icegatheringstatechange'));
    });
  }

  async setRemoteDescription(
    description: RTCSessionDescriptionInit,
  ): Promise<void> {
    if (description.type === 'offer') {
      this.environment.deliverCollectorChannels(this);
    } else if (description.type === 'answer') {
      this.environment.openConnection();
    }
  }

  close(): void {
    if (this.connectionState === 'closed') {
      return;
    }
    this.connectionState = 'closed';
    for (const channel of this.channels) {
      channel.close();
    }
    this.dispatchEvent(new Event('connectionstatechange'));
  }
}

class FakeRtcEnvironment {
  readonly peerConnections: FakePeerConnection[] = [];
  readonly factory: RtcPeerConnectionFactory = (configuration) => {
    const peerConnection = new FakePeerConnection(configuration, this);
    this.peerConnections.push(peerConnection);
    return peerConnection;
  };

  deliverCollectorChannels(terminal: FakePeerConnection): void {
    const collector = this.peerConnections[0];
    if (collector === undefined || collector === terminal) {
      throw new Error('Collector peer connection is missing.');
    }

    for (const collectorChannel of collector.channels) {
      const terminalChannel = new FakeDataChannel(
        collectorChannel.label,
        collectorChannel.ordered,
        {
          ordered: collectorChannel.ordered,
          ...(collectorChannel.maxPacketLifeTime === null
            ? {}
            : { maxPacketLifeTime: collectorChannel.maxPacketLifeTime }),
          ...(collectorChannel.maxRetransmits === null
            ? {}
            : { maxRetransmits: collectorChannel.maxRetransmits }),
        },
      );
      collectorChannel.counterpart = terminalChannel;
      terminalChannel.counterpart = collectorChannel;
      terminal.channels.push(terminalChannel);
      const event = new Event('datachannel');
      Object.defineProperty(event, 'channel', { value: terminalChannel });
      terminal.dispatchEvent(event);
    }
  }

  openConnection(): void {
    for (const peerConnection of this.peerConnections) {
      peerConnection.connectionState = 'connected';
      peerConnection.dispatchEvent(new Event('connectionstatechange'));
      for (const channel of peerConnection.channels) {
        channel.open();
      }
    }
  }

  get collector(): FakePeerConnection {
    const collector = this.peerConnections[0];
    if (collector === undefined) {
      throw new Error('Collector peer connection is missing.');
    }
    return collector;
  }

  get terminal(): FakePeerConnection {
    const terminal = this.peerConnections[1];
    if (terminal === undefined) {
      throw new Error('Terminal peer connection is missing.');
    }
    return terminal;
  }

  terminalChannel(label: string): FakeDataChannel {
    const channel = this.terminal.channels.find(
      (candidate) => candidate.label === label,
    );
    if (channel === undefined) {
      throw new Error(`Terminal channel ${label} is missing.`);
    }
    return channel;
  }
}

class FakeAudioSource implements AudioSource {
  readonly id = 'remote-mic-1';
  readonly displayName = '端末マイク';
  readonly kind = 'microphone' as const;
  readonly format: AudioFormat = { sampleRate: 48_000, channels: 1 };
  state: AudioSourceState = 'idle';
  private readonly pcmListeners = new Set<(event: PcmEvent) => void>();
  private readonly levelListeners = new Set<(event: LevelEvent) => void>();
  private readonly disconnectedListeners = new Set<
    (event: AudioSourceDisconnectedEvent) => void
  >();

  async start(): Promise<void> {
    this.state = 'active';
  }

  async stop(): Promise<void> {
    if (this.state !== 'disconnected') {
      this.state = 'idle';
    }
  }

  subscribeLevel(listener: (event: LevelEvent) => void): Unsubscribe {
    this.levelListeners.add(listener);
    return () => this.levelListeners.delete(listener);
  }

  subscribePcm(listener: (event: PcmEvent) => void): Unsubscribe {
    this.pcmListeners.add(listener);
    return () => this.pcmListeners.delete(listener);
  }

  subscribeDisconnected(
    listener: (event: AudioSourceDisconnectedEvent) => void,
  ): Unsubscribe {
    this.disconnectedListeners.add(listener);
    return () => this.disconnectedListeners.delete(listener);
  }

  emitPcm(channelData: readonly Float32Array[], timestamp = 1_000): void {
    const event: PcmEvent = {
      sourceId: this.id,
      timestamp,
      sampleRate: this.format.sampleRate,
      channels: this.format.channels,
      channelData,
    };
    for (const listener of this.pcmListeners) {
      listener(event);
    }
  }
}

class FakeTerminalAudio implements RemoteTerminalAudio {
  readonly source = new FakeAudioSource();
  readonly startedGains: number[] = [];
  stopCount = 0;

  async startTestSignal(playbackGain: ReturnType<typeof createPlaybackGain>) {
    this.startedGains.push(playbackGain);
  }

  async stopTestSignal(): Promise<void> {
    this.stopCount += 1;
  }
}

const settle = async (): Promise<void> => {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
};

const connectPair = async (
  options: { readonly holdTerminalControlMessages?: boolean } = {},
) => {
  const environment = new FakeRtcEnvironment();
  const audio = new FakeTerminalAudio();
  const collector = createRemoteCollectorSession({
    peerId: 'collector-peer',
    peerConnectionFactory: environment.factory,
  });
  const terminal = createRemoteTerminalSession({
    peerId: 'terminal-peer',
    audio,
    peerConnectionFactory: environment.factory,
  });

  const offer = await collector.createOffer();
  const answer = await terminal.acceptOfferAndCreateAnswer(offer);
  if (options.holdTerminalControlMessages === true) {
    environment.terminalChannel('control-v1').holdOutgoingMessages = true;
  }
  await collector.acceptAnswer(answer);
  await settle();
  return { environment, audio, collector, terminal, offer, answer };
};

describe('manual WebRTC sessions', () => {
  it('exchanges gathered SDP and creates two ordered reliable channels', async () => {
    const { environment, collector, terminal, offer, answer } =
      await connectPair();

    expect(offer).toBe('fake-offer-with-host-candidate');
    expect(answer).toBe('fake-answer-with-host-candidate');
    expect(environment.peerConnections).toHaveLength(2);
    for (const peerConnection of environment.peerConnections) {
      expect(peerConnection.configuration).toEqual({ iceServers: [] });
    }
    expect(environment.collector.createdChannels).toEqual([
      { label: 'control-v1', init: { ordered: true } },
      { label: 'pcm-v1', init: { ordered: true } },
    ]);
    expect(collector.state).toBe('connected');
    expect(collector.source?.id).toBe('remote-mic-1');
    expect(collector.source?.displayName).toBe('端末マイク');
    expect(terminal.state).toBe('connected');
  });

  it('accepts PCM that arrives on pcm-v1 before hello on control-v1', async () => {
    const { environment, audio, collector } = await connectPair({
      holdTerminalControlMessages: true,
    });

    audio.source.emitPcm([new Float32Array(2_400).fill(0.25)]);
    expect(collector.state).toBe('connecting');
    expect(collector.source).toBeNull();

    environment.terminalChannel('control-v1').flushHeldMessages();
    await settle();

    expect(collector.state).toBe('connected');
    expect(collector.source?.state).toBe('active');
  });

  it('drains multiple pre-hello PCM frames in their receive order', async () => {
    const { environment, audio, collector } = await connectPair({
      holdTerminalControlMessages: true,
    });

    audio.source.emitPcm([new Float32Array(2_400).fill(0.1)], 1_000);
    audio.source.emitPcm([new Float32Array(2_400).fill(0.2)], 1_050);
    environment.terminalChannel('control-v1').flushHeldMessages();
    await settle();

    const source = collector.source;
    if (source === null) {
      throw new Error('Remote source was not created.');
    }
    const received: PcmEvent[] = [];
    source.subscribePcm((event) => received.push(event));
    audio.source.emitPcm([new Float32Array(2_400).fill(0.3)], 1_100);

    expect(collector.state).toBe('connected');
    expect(received).toHaveLength(1);
    expect(received[0]?.timestamp).toBe(1_100);
    expect(received[0]?.channelData[0]?.[0]).toBeCloseTo(0.3, 4);
  });

  it('disconnects when the pre-hello PCM buffer exceeds its limit', async () => {
    const { audio, collector } = await connectPair({
      holdTerminalControlMessages: true,
    });
    const stateEvents: RemotePeerStateEvent[] = [];
    collector.subscribeState((event) => stateEvents.push(event));

    for (
      let sequence = 0;
      sequence <= MAX_PENDING_PCM_FRAMES_BEFORE_HELLO;
      sequence += 1
    ) {
      audio.source.emitPcm([new Float32Array(2_400)], 1_000 + sequence * 50);
    }
    await settle();

    expect(collector.state).toBe('disconnected');
    expect(collector.source).toBeNull();
    expect(stateEvents.at(-1)?.reason).toContain('pcm-before-hello-overflow');
  });

  it('rejects non-binary PCM immediately even before hello', async () => {
    const { environment, collector } = await connectPair({
      holdTerminalControlMessages: true,
    });

    environment.terminalChannel('pcm-v1').send('not-pcm');
    await settle();

    expect(collector.state).toBe('disconnected');
    expect(collector.source).toBeNull();
  });

  it('delegates test-signal control and publishes PCM and level events', async () => {
    const { audio, collector } = await connectPair();
    const source = collector.source;
    if (source === null) {
      throw new Error('Remote source was not created.');
    }
    const pcmEvents: PcmEvent[] = [];
    const levelEvents: LevelEvent[] = [];
    source.subscribePcm((event) => pcmEvents.push(event));
    source.subscribeLevel((event) => levelEvents.push(event));

    collector.sendControl({
      v: 1,
      type: 'startTestSignal',
      playbackGain: createPlaybackGain(0.4),
    });
    collector.sendControl({ v: 1, type: 'stopTestSignal' });
    audio.source.emitPcm([new Float32Array(2_400).fill(0.5)]);
    await settle();

    expect(audio.startedGains).toEqual([0.4]);
    expect(audio.stopCount).toBe(1);
    expect(pcmEvents).toHaveLength(1);
    expect(pcmEvents[0]?.channelData[0]).toHaveLength(2_400);
    expect(pcmEvents[0]?.channelData[0]?.[0]).toBeCloseTo(0.5, 4);
    expect(levelEvents).toHaveLength(2);
    expect(levelEvents.map((event) => event.timestamp)).toEqual([1_000, 1_025]);
    expect(
      levelEvents.every((event) => event.level >= -84 && event.level <= 0),
    ).toBe(true);
  });

  it.each([
    {
      caseName: 'sequence is missing',
      frames: [{ sequence: 2, sampleCount: 2_400 }],
      errorCode: 'pcm-sequence-error',
    },
    {
      caseName: 'sequence is reversed',
      frames: [
        { sequence: 0, sampleCount: 2_400 },
        { sequence: 0, sampleCount: 2_400 },
      ],
      errorCode: 'pcm-sequence-error',
    },
    {
      caseName: 'format differs from hello',
      frames: [{ sequence: 0, sampleCount: 1_200 }],
      errorCode: 'pcm-format-mismatch',
    },
  ])(
    'disconnects the remote source when PCM $caseName',
    async ({ frames, errorCode }) => {
      const { environment, collector } = await connectPair();
      const source = collector.source;
      if (source === null) {
        throw new Error('Remote source was not created.');
      }
      const disconnected: AudioSourceDisconnectedEvent[] = [];
      source.subscribeDisconnected((event) => disconnected.push(event));

      for (const [index, frame] of frames.entries()) {
        environment.terminalChannel('pcm-v1').send(
          encodePcm16WireFrame({
            sequence: frame.sequence,
            timestamp: 1_000 + index * 50,
            channelData: [new Float32Array(frame.sampleCount)],
          }),
        );
      }
      await settle();

      expect(collector.state).toBe('disconnected');
      expect(source.state).toBe('disconnected');
      expect(disconnected).toHaveLength(1);
      expect(disconnected[0]?.reason).toContain(errorCode);
    },
  );

  it('treats unknown control versions and channel close as connection errors', async () => {
    const first = await connectPair();
    first.environment
      .terminalChannel('control-v1')
      .send('{"v":9,"type":"disconnect"}');
    await settle();
    expect(first.collector.state).toBe('disconnected');

    const second = await connectPair();
    second.environment.terminalChannel('pcm-v1').close();
    await settle();
    expect(second.collector.state).toBe('disconnected');
    expect(second.collector.source?.state).toBe('disconnected');
  });
});
