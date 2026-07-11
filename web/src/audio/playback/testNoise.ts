import type { PlaybackGain } from '../../domain';

import { AudioEngineError } from '../errors';

export const DEFAULT_TEST_NOISE_SEED = 0x5350_4354;
export const DEFAULT_TEST_NOISE_BUFFER_DURATION_SECONDS = 1;

export interface TestNoiseAudioBuffer {
  getChannelData(channel: number): Float32Array;
}

export interface TestNoiseAudioConnection {
  readonly connectionTarget: unknown;
}

export interface TestNoiseAudioBufferSource {
  buffer: TestNoiseAudioBuffer | null;
  loop: boolean;
  connect(destination: TestNoiseAudioConnection): void;
  disconnect(): void;
  start(): void;
  stop(): void;
}

export interface TestNoiseAudioGain extends TestNoiseAudioConnection {
  readonly gain: { value: number };
  connect(destination: TestNoiseAudioConnection): void;
  disconnect(): void;
}

export interface TestNoiseAudioContext {
  readonly sampleRate: number;
  readonly state: string;
  readonly destination: TestNoiseAudioConnection;
  createBuffer(
    numberOfChannels: number,
    length: number,
    sampleRate: number,
  ): TestNoiseAudioBuffer;
  createBufferSource(): TestNoiseAudioBufferSource;
  createGain(): TestNoiseAudioGain;
  resume(): Promise<void>;
  close(): Promise<void>;
}

export type TestNoiseAudioContextFactory = () => TestNoiseAudioContext;

export interface TestNoisePlaybackOptions {
  readonly seed?: number;
  readonly bufferDurationSeconds?: number;
}

/**
 * Shared command surface for local controls and remote-control message handlers.
 */
export interface TestNoisePlayback {
  readonly isPlaying: boolean;
  start(playbackGain: PlaybackGain): Promise<void>;
  stop(): Promise<void>;
}

interface ActivePlayback {
  readonly context: TestNoiseAudioContext;
  readonly source: TestNoiseAudioBufferSource;
  readonly gain: TestNoiseAudioGain;
}

const UINT32_MAX = 0xffff_ffff;
const UINT32_RANGE = UINT32_MAX + 1;

const assertSeed = (seed: number): void => {
  if (!Number.isInteger(seed) || seed < 0 || seed > UINT32_MAX) {
    throw new RangeError(
      `Test noise seed must be an unsigned 32-bit integer; received ${String(seed)}.`,
    );
  }
};

/** Generates a stable white-noise sequence using the Mulberry32 algorithm. */
export const generateDeterministicWhiteNoise = (
  sampleCount: number,
  seed: number = DEFAULT_TEST_NOISE_SEED,
): Float32Array => {
  if (!Number.isSafeInteger(sampleCount) || sampleCount < 0) {
    throw new RangeError(
      `Sample count must be a non-negative safe integer; received ${String(sampleCount)}.`,
    );
  }
  assertSeed(seed);

  let state = seed >>> 0;
  const samples = new Float32Array(sampleCount);

  for (let index = 0; index < sampleCount; index += 1) {
    state = (state + 0x6d2b_79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    const unitValue = ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
    samples[index] = unitValue * 2 - 1;
  }

  return samples;
};

const adaptBrowserAudioContext = (
  context: AudioContext,
  close: () => Promise<void>,
  playbackGainNode?: GainNode,
): TestNoiseAudioContext => {
  const destination: TestNoiseAudioConnection = {
    connectionTarget: context.destination,
  };

  return {
    get sampleRate() {
      return context.sampleRate;
    },
    get state() {
      return context.state;
    },
    destination,
    createBuffer(numberOfChannels, length, sampleRate) {
      return context.createBuffer(numberOfChannels, length, sampleRate);
    },
    createBufferSource() {
      const source = context.createBufferSource();

      return {
        get buffer() {
          return source.buffer;
        },
        set buffer(buffer) {
          source.buffer = buffer as AudioBuffer | null;
        },
        get loop() {
          return source.loop;
        },
        set loop(loop) {
          source.loop = loop;
        },
        connect(connection) {
          source.connect(connection.connectionTarget as AudioNode);
        },
        disconnect() {
          source.disconnect();
        },
        start() {
          source.start();
        },
        stop() {
          source.stop();
        },
      };
    },
    createGain() {
      if (playbackGainNode !== undefined) {
        return {
          connectionTarget: playbackGainNode,
          gain: playbackGainNode.gain,
          connect() {},
          disconnect() {},
        };
      }
      const gain = context.createGain();

      return {
        connectionTarget: gain,
        gain: gain.gain,
        connect(connection) {
          gain.connect(connection.connectionTarget as AudioNode);
        },
        disconnect() {
          gain.disconnect();
        },
      };
    },
    async resume() {
      await context.resume();
    },
    close,
  };
};

const createBrowserAudioContext = (): TestNoiseAudioContext => {
  if (typeof AudioContext === 'undefined') {
    throw new AudioEngineError(
      'unsupported-feature',
      'Web Audio APIに対応していません。',
      { feature: 'web-audio' },
    );
  }

  const context = new AudioContext();
  return adaptBrowserAudioContext(context, async () => context.close());
};

class DeterministicTestNoisePlayback implements TestNoisePlayback {
  private readonly seed: number;
  private readonly bufferDurationSeconds: number;
  private readonly audioContextFactory: TestNoiseAudioContextFactory;
  private activePlayback: ActivePlayback | null = null;
  private pendingOperation: Promise<void> = Promise.resolve();

  constructor(
    options: TestNoisePlaybackOptions,
    audioContextFactory: TestNoiseAudioContextFactory,
  ) {
    const seed = options.seed ?? DEFAULT_TEST_NOISE_SEED;
    const bufferDurationSeconds =
      options.bufferDurationSeconds ??
      DEFAULT_TEST_NOISE_BUFFER_DURATION_SECONDS;

    assertSeed(seed);
    if (!Number.isFinite(bufferDurationSeconds) || bufferDurationSeconds <= 0) {
      throw new RangeError(
        `Test noise buffer duration must be greater than zero; received ${String(bufferDurationSeconds)}.`,
      );
    }

    this.seed = seed;
    this.bufferDurationSeconds = bufferDurationSeconds;
    this.audioContextFactory = audioContextFactory;
  }

  get isPlaying(): boolean {
    return this.activePlayback !== null;
  }

  start(playbackGain: PlaybackGain): Promise<void> {
    return this.enqueue(async () => {
      if (this.activePlayback !== null) {
        this.activePlayback.gain.gain.value = playbackGain;
        return;
      }

      const context = this.audioContextFactory();
      let source: TestNoiseAudioBufferSource | null = null;
      let gain: TestNoiseAudioGain | null = null;

      try {
        if (context.state === 'suspended') {
          await context.resume();
        }

        const sampleCount = Math.round(
          context.sampleRate * this.bufferDurationSeconds,
        );
        if (!Number.isSafeInteger(sampleCount) || sampleCount <= 0) {
          throw new RangeError(
            `Audio context produced an invalid test-noise sample count: ${String(sampleCount)}.`,
          );
        }

        const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
        buffer
          .getChannelData(0)
          .set(generateDeterministicWhiteNoise(sampleCount, this.seed));

        source = context.createBufferSource();
        gain = context.createGain();
        source.buffer = buffer;
        source.loop = true;
        gain.gain.value = playbackGain;
        source.connect(gain);
        gain.connect(context.destination);
        source.start();

        this.activePlayback = { context, source, gain };
      } catch (error) {
        source?.disconnect();
        gain?.disconnect();
        await context.close();
        throw error;
      }
    });
  }

  stop(): Promise<void> {
    return this.enqueue(async () => {
      const playback = this.activePlayback;
      if (playback === null) {
        return;
      }

      this.activePlayback = null;
      let stopError: unknown = null;
      try {
        playback.source.stop();
      } catch (error) {
        stopError = error;
      } finally {
        playback.source.disconnect();
        playback.gain.disconnect();
        await playback.context.close();
      }
      if (stopError !== null) throw stopError;
    });
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.pendingOperation.then(operation, operation);
    this.pendingOperation = result.catch(() => undefined);
    return result;
  }
}

export const createTestNoisePlayback = (
  options: TestNoisePlaybackOptions = {},
  audioContextFactory: TestNoiseAudioContextFactory = createBrowserAudioContext,
): TestNoisePlayback =>
  new DeterministicTestNoisePlayback(options, audioContextFactory);

/**
 * Uses an already initialized AudioContext so its selected Edge sink is shared.
 * Stopping test noise never closes the caller-owned context.
 */
export const createTestNoisePlaybackForAudioContext = (
  context: AudioContext,
  playbackGainNode: GainNode,
  options: TestNoisePlaybackOptions = {},
): TestNoisePlayback =>
  createTestNoisePlayback(options, () =>
    adaptBrowserAudioContext(context, async () => undefined, playbackGainNode),
  );
