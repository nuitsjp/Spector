const PCM16_POSITIVE_MAX = 0x7fff;
const PCM16_NEGATIVE_SCALE = 0x8000;

export interface EncodedPcm16Chunk {
  readonly sequence: number;
  readonly timestamp: number;
  readonly sampleCount: number;
  readonly pcm16: ArrayBuffer;
}

export const floatSampleToPcm16 = (sample: number): number => {
  const finiteSample = Number.isFinite(sample) ? sample : 0;
  const clamped = Math.max(-1, Math.min(1, finiteSample));
  return Math.round(
    clamped < 0 ? clamped * PCM16_NEGATIVE_SCALE : clamped * PCM16_POSITIVE_MAX,
  );
};

export const pcm16SampleToFloat = (sample: number): number =>
  sample < 0 ? sample / PCM16_NEGATIVE_SCALE : sample / PCM16_POSITIVE_MAX;

/** Buffers at most one second and emits interleaved little-endian PCM16. */
export class Pcm16ChunkAccumulator {
  private buffer: ArrayBuffer;
  private samples: Int16Array;
  private frameCount = 0;
  private sequence = 0;
  private chunkStartedAt = 0;

  constructor(
    readonly sampleRate: number,
    readonly channels: number,
  ) {
    if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
      throw new RangeError('sampleRate must be a positive integer.');
    }
    if (!Number.isInteger(channels) || channels <= 0) {
      throw new RangeError('channels must be a positive integer.');
    }
    this.buffer = new ArrayBuffer(
      sampleRate * channels * Int16Array.BYTES_PER_ELEMENT,
    );
    this.samples = new Int16Array(this.buffer);
  }

  append(
    channelData: readonly Float32Array[],
    timestamp: number,
  ): EncodedPcm16Chunk[] {
    if (channelData.length !== this.channels) {
      throw new RangeError(
        `Expected ${this.channels} channels; received ${channelData.length}.`,
      );
    }
    const sourceFrameCount = channelData[0]?.length ?? 0;
    if (channelData.some((channel) => channel.length !== sourceFrameCount)) {
      throw new RangeError(
        'All PCM channels must contain equal sample counts.',
      );
    }

    const chunks: EncodedPcm16Chunk[] = [];
    let sourceOffset = 0;

    while (sourceOffset < sourceFrameCount) {
      if (this.frameCount === 0) {
        this.chunkStartedAt =
          timestamp + (sourceOffset / this.sampleRate) * 1_000;
      }
      const framesToCopy = Math.min(
        sourceFrameCount - sourceOffset,
        this.sampleRate - this.frameCount,
      );

      for (let frameIndex = 0; frameIndex < framesToCopy; frameIndex += 1) {
        for (
          let channelIndex = 0;
          channelIndex < this.channels;
          channelIndex += 1
        ) {
          const sample =
            channelData[channelIndex]?.[sourceOffset + frameIndex] ?? 0;
          const destinationIndex =
            (this.frameCount + frameIndex) * this.channels + channelIndex;
          this.samples[destinationIndex] = floatSampleToPcm16(sample);
        }
      }

      this.frameCount += framesToCopy;
      sourceOffset += framesToCopy;
      if (this.frameCount === this.sampleRate) {
        chunks.push(this.takeChunk());
      }
    }
    return chunks;
  }

  flush(): EncodedPcm16Chunk | null {
    return this.frameCount === 0 ? null : this.takeChunk();
  }

  private takeChunk(): EncodedPcm16Chunk {
    const byteLength =
      this.frameCount * this.channels * Int16Array.BYTES_PER_ELEMENT;
    const pcm16 =
      byteLength === this.buffer.byteLength
        ? this.buffer
        : this.buffer.slice(0, byteLength);
    const chunk: EncodedPcm16Chunk = {
      sequence: this.sequence,
      timestamp: this.chunkStartedAt,
      sampleCount: this.frameCount,
      pcm16,
    };

    this.sequence += 1;
    this.buffer = new ArrayBuffer(
      this.sampleRate * this.channels * Int16Array.BYTES_PER_ELEMENT,
    );
    this.samples = new Int16Array(this.buffer);
    this.frameCount = 0;
    return chunk;
  }
}
