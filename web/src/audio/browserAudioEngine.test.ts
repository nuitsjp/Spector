import { describe, expect, it, vi } from 'vitest';

import { createPlaybackGain } from '../domain';

import { BrowserAudioEngine } from './browserAudioEngine';

class FakeTrack extends EventTarget {
  readonly stop = vi.fn();

  constructor(
    readonly kind: 'audio' | 'video',
    private readonly settings: MediaTrackSettings = {},
  ) {
    super();
  }

  getSettings(): MediaTrackSettings {
    return this.settings;
  }

  end(): void {
    this.dispatchEvent(new Event('ended'));
  }
}

class FakeStream {
  constructor(private readonly tracks: readonly FakeTrack[]) {}

  getAudioTracks(): MediaStreamTrack[] {
    return this.tracks.filter(
      (track) => track.kind === 'audio',
    ) as unknown as MediaStreamTrack[];
  }

  getTracks(): MediaStreamTrack[] {
    return [...this.tracks] as unknown as MediaStreamTrack[];
  }
}

class FakeNode {
  readonly connect = vi.fn(() => this);
  readonly disconnect = vi.fn();
  channelCount = 1;
}

class FakePort extends EventTarget {
  readonly start = vi.fn();
  readonly close = vi.fn();

  send(data: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
}

class FakeWorkletNode extends FakeNode {
  readonly port = new FakePort();
}

class FakeAudioContext extends EventTarget {
  readonly sampleRate = 48_000;
  readonly currentTime = 2;
  readonly destination = new FakeNode();
  readonly addModule = vi.fn(async () => undefined);
  readonly audioWorklet = { addModule: this.addModule };
  readonly gainNode = new FakeNode() as FakeNode & {
    gain: { value: number; setValueAtTime: ReturnType<typeof vi.fn> };
  };
  readonly mediaNode = new FakeNode();
  state: AudioContextState = 'suspended';

  constructor(setSinkId?: (sinkId: string) => Promise<void>) {
    super();
    this.gainNode.gain = { value: 0, setValueAtTime: vi.fn() };
    if (setSinkId !== undefined) {
      Object.assign(this, { setSinkId });
    }
  }

  readonly createGain = vi.fn(() => this.gainNode as unknown as GainNode);
  readonly createMediaStreamSource = vi.fn(
    () => this.mediaNode as unknown as MediaStreamAudioSourceNode,
  );
  readonly resume = vi.fn(async () => {
    this.state = 'running';
  });
  readonly close = vi.fn(async () => {
    this.state = 'closed';
  });

  suspendUnexpectedly(): void {
    this.state = 'suspended';
    this.dispatchEvent(new Event('statechange'));
  }
}

class FakeMediaDevices extends EventTarget {
  devices: MediaDeviceInfo[] = [];
  microphoneStream: MediaStream | null = null;
  displayStream: MediaStream | null = null;
  readonly enumerateDevices = vi.fn(async () => this.devices);
  readonly getUserMedia = vi.fn(async () => {
    if (this.microphoneStream === null) throw new Error('missing mic fixture');
    return this.microphoneStream;
  });
  readonly getDisplayMedia = vi.fn(async () => {
    if (this.displayStream === null) throw new Error('missing display fixture');
    return this.displayStream;
  });
}

const mediaDevice = (
  kind: 'audioinput' | 'audiooutput',
  deviceId: string,
  label: string,
): MediaDeviceInfo =>
  ({
    kind,
    deviceId,
    label,
    groupId: '',
    toJSON: () => ({}),
  }) as MediaDeviceInfo;

const createHarness = (withSinkSelection = true) => {
  const setSinkId = vi.fn(async () => undefined);
  const context = new FakeAudioContext(
    withSinkSelection ? setSinkId : undefined,
  );
  const mediaDevices = new FakeMediaDevices();
  mediaDevices.devices = [
    mediaDevice('audioinput', 'mic-1', 'Main microphone'),
    mediaDevice('audiooutput', 'speaker-1', 'Main speaker'),
  ];
  const microphoneTrack = new FakeTrack('audio', {
    channelCount: 1,
    deviceId: 'mic-1',
  });
  const videoTrack = new FakeTrack('video');
  const systemAudioTrack = new FakeTrack('audio', { channelCount: 2 });
  mediaDevices.microphoneStream = new FakeStream([
    microphoneTrack,
  ]) as unknown as MediaStream;
  mediaDevices.displayStream = new FakeStream([
    videoTrack,
    systemAudioTrack,
  ]) as unknown as MediaStream;
  const workletNodes: FakeWorkletNode[] = [];
  const engine = new BrowserAudioEngine({
    mediaDevices: mediaDevices as unknown as MediaDevices,
    createAudioContext: () => context as unknown as AudioContext,
    createWorkletNode: () => {
      const node = new FakeWorkletNode();
      workletNodes.push(node);
      return node as unknown as AudioWorkletNode;
    },
    workletModuleUrl: '/capture-worklet.js',
    createId: () => 'system-1',
  });
  return {
    context,
    engine,
    mediaDevices,
    microphoneTrack,
    setSinkId,
    systemAudioTrack,
    videoTrack,
    workletNodes,
  };
};

describe('BrowserAudioEngine', () => {
  it('initializes only when called and publishes audio input/output devices', async () => {
    const harness = createHarness();

    expect(harness.context.resume).not.toHaveBeenCalled();
    await harness.engine.initialize();

    expect(harness.context.addModule).toHaveBeenCalledWith(
      '/capture-worklet.js',
    );
    expect(harness.context.resume).toHaveBeenCalledOnce();
    expect(harness.engine.devices.inputs).toEqual([
      { id: 'mic-1', label: 'Main microphone', kind: 'audioinput' },
    ]);
    expect(harness.engine.devices.outputs).toEqual([
      { id: 'speaker-1', label: 'Main speaker', kind: 'audiooutput' },
    ]);
  });

  it('starts one selected microphone and emits Worklet PCM/level events', async () => {
    const harness = createHarness();
    await harness.engine.initialize();
    const source = await harness.engine.startMicrophone('mic-1');
    const pcmEvents: unknown[] = [];
    const levelEvents: unknown[] = [];
    source.subscribePcm((event) => pcmEvents.push(event));
    source.subscribeLevel((event) => levelEvents.push(event));

    const channel = new Float32Array([0.25, -0.25]);
    harness.workletNodes[0]?.port.send({
      type: 'capture-window',
      sampleRate: 48_000,
      timestamp: 123,
      level: -24,
      channelBuffers: [channel.buffer],
    });

    expect(harness.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: { deviceId: { exact: 'mic-1' } },
      video: false,
    });
    expect(source.state).toBe('active');
    expect(pcmEvents).toHaveLength(1);
    expect(levelEvents).toEqual([
      { sourceId: 'microphone:mic-1', timestamp: 123, level: -24 },
    ]);

    await harness.engine.stopSource(source.id);
    expect(harness.microphoneTrack.stop).toHaveBeenCalledOnce();
    expect(source.state).toBe('idle');
  });

  it('keeps display video/audio tracks alive until system capture stops', async () => {
    const harness = createHarness();
    await harness.engine.initialize();
    const source = await harness.engine.startSystemAudio();

    expect(harness.mediaDevices.getDisplayMedia).toHaveBeenCalledWith({
      audio: true,
      video: true,
    });
    expect(source.id).toBe('system-audio:system-1');
    expect(harness.videoTrack.stop).not.toHaveBeenCalled();
    expect(harness.systemAudioTrack.stop).not.toHaveBeenCalled();

    await harness.engine.stopSource(source.id);
    expect(harness.videoTrack.stop).toHaveBeenCalledOnce();
    expect(harness.systemAudioTrack.stop).toHaveBeenCalledOnce();
  });

  it('disconnects a live microphone when device enumeration no longer contains it', async () => {
    const harness = createHarness();
    await harness.engine.initialize();
    const source = await harness.engine.startMicrophone('mic-1');
    const disconnected = vi.fn();
    source.subscribeDisconnected(disconnected);
    harness.mediaDevices.devices = [
      mediaDevice('audiooutput', 'speaker-1', 'Main speaker'),
    ];

    await harness.engine.refreshDevices();

    expect(source.state).toBe('disconnected');
    expect(disconnected).toHaveBeenCalledWith({
      sourceId: 'microphone:mic-1',
      reason: 'マイクが取り外されました。',
    });
  });

  it('selects an Edge playback sink and changes the site gain', async () => {
    const harness = createHarness();
    await harness.engine.initialize();

    await harness.engine.setPlaybackOutput('speaker-1');
    harness.engine.setPlaybackGain(createPlaybackGain(0.3));

    expect(harness.setSinkId).toHaveBeenCalledWith('speaker-1');
    expect(harness.engine.playbackOutputId).toBe('speaker-1');
    expect(harness.context.gainNode.gain.setValueAtTime).toHaveBeenCalledWith(
      0.3,
      2,
    );
  });

  it('returns a typed unsupported error instead of an output fallback', async () => {
    const harness = createHarness(false);
    await harness.engine.initialize();

    await expect(harness.engine.setPlaybackOutput('speaker-1')).rejects.toEqual(
      expect.objectContaining({
        code: 'unsupported-feature',
        feature: 'playback-output-selection',
      }),
    );
  });

  it('publishes an engine fault when an active AudioContext stops', async () => {
    const harness = createHarness();
    const fault = vi.fn();
    harness.engine.subscribeFault(fault);
    await harness.engine.initialize();

    harness.context.suspendUnexpectedly();

    expect(fault).toHaveBeenCalledWith({
      code: 'audio-context-stopped',
      reason: 'AudioContextがsuspendedになりました。',
    });
  });
});
