import type { AudioFormat, PcmEvent } from '../contracts';
import { PCM_FRAME_DURATION_MS, PCM_PROTOCOL_VERSION } from '../domain';

import { RemoteProtocolError } from './controlProtocol';

export const PCM16_HEADER_BYTE_LENGTH = 20;
export const PCM16_BYTES_PER_SAMPLE = 2;

export interface Pcm16WireFrameInput {
  readonly sequence: number;
  /** Capture timestamp in milliseconds. */
  readonly timestamp: number;
  /** One channel per array. Samples are interleaved on the wire. */
  readonly channelData: readonly Float32Array[];
}

export interface DecodedPcm16WireFrame {
  readonly version: typeof PCM_PROTOCOL_VERSION;
  readonly sequence: number;
  readonly timestamp: number;
  readonly sampleCount: number;
  readonly channelData: readonly Float32Array[];
}

const assertUint32 = (value: number, fieldName: string): void => {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new RangeError(`${fieldName} must be an unsigned 32-bit integer.`);
  }
};

export const getPcmFrameSampleCount = (sampleRate: number): number => {
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new RangeError('sampleRate must be a positive integer.');
  }

  const sampleCount = (sampleRate * PCM_FRAME_DURATION_MS) / 1000;
  if (!Number.isInteger(sampleCount) || sampleCount <= 0) {
    throw new RangeError(
      `sampleRate ${String(sampleRate)} cannot produce an exact ${String(PCM_FRAME_DURATION_MS)} ms PCM frame.`,
    );
  }

  return sampleCount;
};

const floatToPcm16 = (value: number): number => {
  const finiteValue = Number.isFinite(value) ? value : 0;
  const clamped = Math.max(-1, Math.min(1, finiteValue));
  return clamped < 0
    ? Math.round(clamped * 0x8000)
    : Math.round(clamped * 0x7fff);
};

const pcm16ToFloat = (value: number): number =>
  value < 0 ? value / 0x8000 : value / 0x7fff;

export const encodePcm16WireFrame = (
  frame: Pcm16WireFrameInput,
): ArrayBuffer => {
  assertUint32(frame.sequence, 'sequence');
  if (!Number.isFinite(frame.timestamp)) {
    throw new RangeError('timestamp must be finite.');
  }
  if (frame.channelData.length === 0) {
    throw new RangeError('channelData must contain at least one channel.');
  }

  const sampleCount = frame.channelData[0]?.length ?? 0;
  if (sampleCount === 0) {
    throw new RangeError('PCM frame must contain at least one sample.');
  }
  for (const channel of frame.channelData) {
    if (channel.length !== sampleCount) {
      throw new RangeError(
        'All PCM channels must contain the same sample count.',
      );
    }
  }

  const payloadByteLength =
    sampleCount * frame.channelData.length * PCM16_BYTES_PER_SAMPLE;
  const buffer = new ArrayBuffer(PCM16_HEADER_BYTE_LENGTH + payloadByteLength);
  const view = new DataView(buffer);
  view.setUint32(0, PCM_PROTOCOL_VERSION, true);
  view.setUint32(4, frame.sequence, true);
  view.setFloat64(8, frame.timestamp, true);
  view.setUint32(16, sampleCount, true);

  let byteOffset = PCM16_HEADER_BYTE_LENGTH;
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    for (
      let channelIndex = 0;
      channelIndex < frame.channelData.length;
      channelIndex += 1
    ) {
      const sample = frame.channelData[channelIndex]?.[sampleIndex] ?? 0;
      view.setInt16(byteOffset, floatToPcm16(sample), true);
      byteOffset += PCM16_BYTES_PER_SAMPLE;
    }
  }

  return buffer;
};

export const decodePcm16WireFrame = (
  buffer: ArrayBuffer,
  channels: number,
): DecodedPcm16WireFrame => {
  if (!Number.isInteger(channels) || channels <= 0) {
    throw new RemoteProtocolError(
      'pcm-format-mismatch',
      'PCM channel count must be a positive integer.',
    );
  }
  if (buffer.byteLength < PCM16_HEADER_BYTE_LENGTH) {
    throw new RemoteProtocolError(
      'invalid-pcm-frame',
      'PCM frame is shorter than its fixed header.',
    );
  }

  const view = new DataView(buffer);
  const version = view.getUint32(0, true);
  if (version !== PCM_PROTOCOL_VERSION) {
    throw new RemoteProtocolError(
      'unsupported-pcm-version',
      `Unsupported PCM protocol version: ${String(version)}.`,
    );
  }

  const sequence = view.getUint32(4, true);
  const timestamp = view.getFloat64(8, true);
  const sampleCount = view.getUint32(16, true);
  if (!Number.isFinite(timestamp)) {
    throw new RemoteProtocolError(
      'invalid-pcm-frame',
      'PCM capture timestamp must be finite.',
    );
  }

  const expectedByteLength =
    PCM16_HEADER_BYTE_LENGTH + sampleCount * channels * PCM16_BYTES_PER_SAMPLE;
  if (sampleCount === 0 || buffer.byteLength !== expectedByteLength) {
    throw new RemoteProtocolError(
      'pcm-format-mismatch',
      `PCM payload length does not match ${String(sampleCount)} samples and ${String(channels)} channels.`,
    );
  }

  const channelData = Array.from(
    { length: channels },
    () => new Float32Array(sampleCount),
  );
  let byteOffset = PCM16_HEADER_BYTE_LENGTH;
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
      const pcm16 = view.getInt16(byteOffset, true);
      channelData[channelIndex]![sampleIndex] = pcm16ToFloat(pcm16);
      byteOffset += PCM16_BYTES_PER_SAMPLE;
    }
  }

  return {
    version: PCM_PROTOCOL_VERSION,
    sequence,
    timestamp,
    sampleCount,
    channelData,
  };
};

interface QueuedPcmChunk {
  readonly timestamp: number;
  readonly channelData: readonly Float32Array[];
  offset: number;
}

/** Converts arbitrary source PCM chunks into exact 50 ms wire frames. */
export class Pcm16FramePacketizer {
  private readonly format: AudioFormat;
  private readonly sampleCountPerFrame: number;
  private readonly chunks: QueuedPcmChunk[] = [];
  private queuedSampleCount = 0;

  constructor(format: AudioFormat) {
    if (!Number.isInteger(format.channels) || format.channels <= 0) {
      throw new RangeError('channels must be a positive integer.');
    }
    this.format = { ...format };
    this.sampleCountPerFrame = getPcmFrameSampleCount(format.sampleRate);
  }

  push(event: PcmEvent): readonly Omit<Pcm16WireFrameInput, 'sequence'>[] {
    if (
      event.sampleRate !== this.format.sampleRate ||
      event.channels !== this.format.channels ||
      event.channelData.length !== this.format.channels
    ) {
      throw new RemoteProtocolError(
        'pcm-format-mismatch',
        'Audio source format changed while the remote connection was active.',
      );
    }

    const sampleCount = event.channelData[0]?.length ?? 0;
    if (sampleCount === 0) {
      return [];
    }
    if (event.channelData.some((channel) => channel.length !== sampleCount)) {
      throw new RemoteProtocolError(
        'pcm-format-mismatch',
        'Audio source channels have different sample counts.',
      );
    }

    this.chunks.push({
      timestamp: event.timestamp,
      channelData: event.channelData.map((channel) => channel.slice()),
      offset: 0,
    });
    this.queuedSampleCount += sampleCount;

    const frames: Omit<Pcm16WireFrameInput, 'sequence'>[] = [];
    while (this.queuedSampleCount >= this.sampleCountPerFrame) {
      frames.push(this.takeFrame());
    }

    return frames;
  }

  private takeFrame(): Omit<Pcm16WireFrameInput, 'sequence'> {
    const firstChunk = this.chunks[0];
    if (firstChunk === undefined) {
      throw new Error('PCM packetizer queue is empty.');
    }

    const timestamp =
      firstChunk.timestamp +
      (firstChunk.offset / this.format.sampleRate) * 1000;
    const channelData = Array.from(
      { length: this.format.channels },
      () => new Float32Array(this.sampleCountPerFrame),
    );

    let outputOffset = 0;
    while (outputOffset < this.sampleCountPerFrame) {
      const chunk = this.chunks[0];
      if (chunk === undefined) {
        throw new Error(
          'PCM packetizer queue ended before a frame was filled.',
        );
      }

      const available = chunk.channelData[0]!.length - chunk.offset;
      const copyCount = Math.min(
        available,
        this.sampleCountPerFrame - outputOffset,
      );
      for (
        let channelIndex = 0;
        channelIndex < this.format.channels;
        channelIndex += 1
      ) {
        channelData[channelIndex]!.set(
          chunk.channelData[channelIndex]!.subarray(
            chunk.offset,
            chunk.offset + copyCount,
          ),
          outputOffset,
        );
      }

      outputOffset += copyCount;
      chunk.offset += copyCount;
      if (chunk.offset === chunk.channelData[0]!.length) {
        this.chunks.shift();
      }
    }

    this.queuedSampleCount -= this.sampleCountPerFrame;
    return { timestamp, channelData };
  }
}
