import { describe, expect, it, vi } from 'vitest';

import { createPlaybackGain } from '../../domain';

import {
  createTestNoisePlayback,
  createTestNoisePlaybackForAudioContext,
  generateDeterministicWhiteNoise,
  type TestNoiseAudioBuffer,
  type TestNoiseAudioBufferSource,
  type TestNoiseAudioConnection,
  type TestNoiseAudioContext,
  type TestNoiseAudioGain,
} from './testNoise';

const createAudioHarness = (sampleRate = 48_000) => {
  let state = 'suspended';
  const channelData = new Float32Array(sampleRate / 100);
  const buffer: TestNoiseAudioBuffer = {
    getChannelData: vi.fn((channel: number) => {
      if (channel !== 0) {
        throw new RangeError('Only the mono channel exists in this test.');
      }
      return channelData;
    }),
  };
  const destination: TestNoiseAudioConnection = {
    connectionTarget: Symbol('destination'),
  };
  const gain: TestNoiseAudioGain = {
    connectionTarget: Symbol('gain'),
    gain: { value: 0 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  const source: TestNoiseAudioBufferSource = {
    buffer: null,
    loop: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  const context: TestNoiseAudioContext = {
    sampleRate,
    get state() {
      return state;
    },
    destination,
    createBuffer: vi.fn(() => buffer),
    createBufferSource: vi.fn(() => source),
    createGain: vi.fn(() => gain),
    resume: vi.fn(async () => {
      state = 'running';
    }),
    close: vi.fn(async () => {
      state = 'closed';
    }),
  };
  const factory = vi.fn(() => context);

  return { buffer, channelData, context, destination, factory, gain, source };
};

describe('generateDeterministicWhiteNoise', () => {
  it('returns the same finite sample sequence for the same seed', () => {
    const first = generateDeterministicWhiteNoise(4_096, 123_456);
    const second = generateDeterministicWhiteNoise(4_096, 123_456);

    expect(second).toEqual(first);
    expect(
      Array.from(first).every(
        (sample) => Number.isFinite(sample) && sample >= -1 && sample < 1,
      ),
    ).toBe(true);
  });

  it('returns a different sample sequence for a different seed', () => {
    expect(generateDeterministicWhiteNoise(256, 1)).not.toEqual(
      generateDeterministicWhiteNoise(256, 2),
    );
  });
});

describe('test-noise playback', () => {
  it('loops deterministic mono noise through a gain node', async () => {
    const harness = createAudioHarness();
    const playback = createTestNoisePlayback(
      { seed: 42, bufferDurationSeconds: 0.01 },
      harness.factory,
    );

    await playback.start(createPlaybackGain(0.35));

    expect(playback.isPlaying).toBe(true);
    expect(harness.context.resume).toHaveBeenCalledOnce();
    expect(harness.context.createBuffer).toHaveBeenCalledWith(1, 480, 48_000);
    expect(harness.channelData).toEqual(
      generateDeterministicWhiteNoise(480, 42),
    );
    expect(harness.source.buffer).toBe(harness.buffer);
    expect(harness.source.loop).toBe(true);
    expect(harness.gain.gain.value).toBe(0.35);
    expect(harness.source.connect).toHaveBeenCalledWith(harness.gain);
    expect(harness.gain.connect).toHaveBeenCalledWith(harness.destination);
    expect(harness.source.start).toHaveBeenCalledOnce();
  });

  it('makes repeated start and stop calls idempotent and disconnects nodes', async () => {
    const harness = createAudioHarness();
    const playback = createTestNoisePlayback(
      { bufferDurationSeconds: 0.01 },
      harness.factory,
    );

    await Promise.all([
      playback.start(createPlaybackGain(0.25)),
      playback.start(createPlaybackGain(0.4)),
    ]);

    expect(harness.factory).toHaveBeenCalledOnce();
    expect(harness.source.start).toHaveBeenCalledOnce();
    expect(harness.gain.gain.value).toBe(0.4);

    await Promise.all([playback.stop(), playback.stop()]);

    expect(playback.isPlaying).toBe(false);
    expect(harness.source.stop).toHaveBeenCalledOnce();
    expect(harness.source.disconnect).toHaveBeenCalledOnce();
    expect(harness.gain.disconnect).toHaveBeenCalledOnce();
    expect(harness.context.close).toHaveBeenCalledOnce();
  });

  it('uses a caller-owned AudioContext and its selected-output gain node', async () => {
    const rawSource = {
      buffer: null as AudioBuffer | null,
      loop: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const close = vi.fn(async () => undefined);
    const resume = vi.fn(async () => undefined);
    const context = {
      sampleRate: 4,
      state: 'running',
      destination: Symbol('destination'),
      createBuffer: vi.fn(() => ({
        getChannelData: () => new Float32Array(4),
      })),
      createBufferSource: vi.fn(() => rawSource),
      createGain: vi.fn(),
      resume,
      close,
    } as unknown as AudioContext;
    const sharedGain = {
      gain: { value: 1 },
    } as unknown as GainNode;
    const playback = createTestNoisePlaybackForAudioContext(
      context,
      sharedGain,
    );

    await playback.start(createPlaybackGain(0.6));
    await playback.stop();

    expect(rawSource.connect).toHaveBeenCalledWith(sharedGain);
    expect(sharedGain.gain.value).toBe(0.6);
    expect(context.createGain).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});
