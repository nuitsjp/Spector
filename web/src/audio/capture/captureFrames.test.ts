import { describe, expect, it } from 'vitest';

import { CaptureWindowAccumulator, interleaveChannels } from './captureFrames';

describe('CaptureWindowAccumulator', () => {
  it.each([
    [44_100, 1, 1_102],
    [48_000, 2, 1_200],
  ] as const)(
    'emits 25 ms windows for %i Hz and %i channel(s)',
    (sampleRate, channels, expectedFrames) => {
      const accumulator = new CaptureWindowAccumulator(sampleRate);
      const first = Array.from({ length: channels }, (_, channel) =>
        new Float32Array(700).fill(channel + 0.25),
      );
      const second = Array.from({ length: channels }, (_, channel) =>
        new Float32Array(700).fill(channel + 0.5),
      );

      expect(accumulator.append(first, 10)).toEqual([]);
      const windows = accumulator.append(
        second,
        10 + (700 / sampleRate) * 1_000,
      );

      expect(windows).toHaveLength(1);
      expect(windows[0]?.channelData).toHaveLength(channels);
      expect(windows[0]?.channelData[0]).toHaveLength(expectedFrames);
      expect(windows[0]?.timestamp).toBeCloseTo(10, 8);
    },
  );

  it('replaces non-finite input and preserves channel order', () => {
    const accumulator = new CaptureWindowAccumulator(40);
    const windows = accumulator.append(
      [
        new Float32Array([Number.NaN]),
        new Float32Array([Number.POSITIVE_INFINITY]),
      ],
      25,
    );

    expect(windows).toHaveLength(1);
    expect(interleaveChannels(windows[0]?.channelData ?? [])).toEqual(
      new Float32Array([0, 0]),
    );
  });

  it('rejects a channel-count change instead of silently corrupting PCM', () => {
    const accumulator = new CaptureWindowAccumulator(48_000);
    accumulator.append([new Float32Array(128)], 0);

    expect(() =>
      accumulator.append([new Float32Array(128), new Float32Array(128)], 3),
    ).toThrow(/channel count changed/i);
  });
});

describe('interleaveChannels', () => {
  it('interleaves mono/stereo frame order', () => {
    expect(
      interleaveChannels([
        new Float32Array([0.1, 0.2]),
        new Float32Array([-0.1, -0.2]),
      ]),
    ).toEqual(new Float32Array([0.1, -0.1, 0.2, -0.2]));
  });
});
