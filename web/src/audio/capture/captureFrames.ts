export const CAPTURE_WINDOW_DURATION_SECONDS = 0.025;

export interface CaptureWindow {
  readonly sampleRate: number;
  readonly timestamp: number;
  readonly channelData: readonly Float32Array[];
}

/**
 * Converts AudioWorklet render quanta into stable 25 ms planar windows.
 * Non-finite samples are replaced at the browser boundary before DSP/recording.
 */
export class CaptureWindowAccumulator {
  readonly windowFrameCount: number;

  private buffers: Float32Array[] = [];
  private frameCount = 0;
  private windowStartedAt = 0;

  constructor(readonly sampleRate: number) {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new RangeError('sampleRate must be greater than zero.');
    }
    this.windowFrameCount = Math.max(
      1,
      Math.floor(sampleRate * CAPTURE_WINDOW_DURATION_SECONDS),
    );
  }

  append(
    channelData: readonly Float32Array[],
    timestamp: number,
  ): CaptureWindow[] {
    if (channelData.length === 0) return [];
    const sourceFrameCount = channelData[0]?.length ?? 0;
    if (
      sourceFrameCount === 0 ||
      channelData.some((channel) => channel.length !== sourceFrameCount)
    ) {
      throw new RangeError(
        'All capture channels must contain equal sample counts.',
      );
    }

    if (this.buffers.length === 0) {
      this.buffers = Array.from(
        { length: channelData.length },
        () => new Float32Array(this.windowFrameCount),
      );
      this.windowStartedAt = timestamp;
    } else if (this.buffers.length !== channelData.length) {
      throw new RangeError('The capture channel count changed while active.');
    }

    const windows: CaptureWindow[] = [];
    let sourceOffset = 0;

    while (sourceOffset < sourceFrameCount) {
      if (this.frameCount === 0) {
        this.windowStartedAt =
          timestamp + (sourceOffset / this.sampleRate) * 1_000;
      }

      const framesToCopy = Math.min(
        sourceFrameCount - sourceOffset,
        this.windowFrameCount - this.frameCount,
      );

      for (
        let channelIndex = 0;
        channelIndex < channelData.length;
        channelIndex += 1
      ) {
        const source = channelData[channelIndex];
        const destination = this.buffers[channelIndex];
        if (source === undefined || destination === undefined) continue;

        for (let index = 0; index < framesToCopy; index += 1) {
          const candidate = source[sourceOffset + index] ?? 0;
          destination[this.frameCount + index] = Number.isFinite(candidate)
            ? candidate
            : 0;
        }
      }

      sourceOffset += framesToCopy;
      this.frameCount += framesToCopy;

      if (this.frameCount === this.windowFrameCount) {
        windows.push({
          sampleRate: this.sampleRate,
          timestamp: this.windowStartedAt,
          channelData: this.buffers,
        });
        this.buffers = Array.from(
          { length: channelData.length },
          () => new Float32Array(this.windowFrameCount),
        );
        this.frameCount = 0;
      }
    }

    return windows;
  }
}

export const interleaveChannels = (
  channelData: readonly Float32Array[],
): Float32Array => {
  if (channelData.length === 0) return new Float32Array();
  const frameCount = channelData[0]?.length ?? 0;
  if (channelData.some((channel) => channel.length !== frameCount)) {
    throw new RangeError('All channels must contain equal sample counts.');
  }

  const interleaved = new Float32Array(frameCount * channelData.length);
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    for (
      let channelIndex = 0;
      channelIndex < channelData.length;
      channelIndex += 1
    ) {
      const candidate = channelData[channelIndex]?.[frameIndex] ?? 0;
      interleaved[frameIndex * channelData.length + channelIndex] =
        Number.isFinite(candidate) ? candidate : 0;
    }
  }
  return interleaved;
};
