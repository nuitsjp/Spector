import { describe, expect, it } from 'vitest';

import { createPlaybackGain } from '../domain';

import {
  parseControlMessage,
  RemoteProtocolError,
  serializeControlMessage,
} from './controlProtocol';
import {
  decodePcm16WireFrame,
  encodePcm16WireFrame,
  getPcmFrameSampleCount,
  PCM16_HEADER_BYTE_LENGTH,
  Pcm16FramePacketizer,
} from './pcmProtocol';

describe('control-v1 protocol', () => {
  it('round-trips every supported control message', () => {
    const messages = [
      {
        v: 1 as const,
        type: 'hello' as const,
        sourceId: 'mic-1',
        name: '会議室マイク',
        sampleRate: 48_000,
        channels: 2,
      },
      {
        v: 1 as const,
        type: 'startTestSignal' as const,
        playbackGain: createPlaybackGain(0.25),
      },
      { v: 1 as const, type: 'stopTestSignal' as const },
      { v: 1 as const, type: 'disconnect' as const },
      {
        v: 1 as const,
        type: 'error' as const,
        code: 'test-error',
        message: 'test message',
      },
    ];

    for (const message of messages) {
      expect(parseControlMessage(serializeControlMessage(message))).toEqual(
        message,
      );
    }
  });

  it.each([
    ['unsupported version', '{"v":2,"type":"disconnect"}'],
    ['unknown type', '{"v":1,"type":"futureCommand"}'],
    ['invalid JSON', '{'],
    ['binary message', new ArrayBuffer(0)],
  ])('rejects %s as a protocol error', (_label, data) => {
    expect(() => parseControlMessage(data)).toThrow(RemoteProtocolError);
  });
});

describe('pcm-v1 protocol', () => {
  it('fixes the little-endian header layout and round-trips PCM16', () => {
    const left = new Float32Array([-1, -0.5, 0, 0.5, 1]);
    const right = new Float32Array([1, 0.25, 0, -0.25, -1]);
    const buffer = encodePcm16WireFrame({
      sequence: 0x1020_3040,
      timestamp: 12_345.5,
      channelData: [left, right],
    });
    const header = new DataView(buffer);

    expect(PCM16_HEADER_BYTE_LENGTH).toBe(20);
    expect(header.getUint32(0, true)).toBe(1);
    expect(header.getUint32(4, true)).toBe(0x1020_3040);
    expect(header.getFloat64(8, true)).toBe(12_345.5);
    expect(header.getUint32(16, true)).toBe(5);
    expect(buffer.byteLength).toBe(20 + 5 * 2 * 2);

    const decoded = decodePcm16WireFrame(buffer, 2);
    expect(decoded.sequence).toBe(0x1020_3040);
    expect(decoded.timestamp).toBe(12_345.5);
    expect(decoded.sampleCount).toBe(5);
    for (let channelIndex = 0; channelIndex < 2; channelIndex += 1) {
      for (let sampleIndex = 0; sampleIndex < 5; sampleIndex += 1) {
        expect(
          Math.abs(
            decoded.channelData[channelIndex]![sampleIndex]! -
              [left, right][channelIndex]![sampleIndex]!,
          ),
        ).toBeLessThanOrEqual(1 / 0x7fff);
      }
    }
  });

  it('rejects version and payload-format mismatches', () => {
    const buffer = encodePcm16WireFrame({
      sequence: 0,
      timestamp: 0,
      channelData: [new Float32Array([0, 0])],
    });

    new DataView(buffer).setUint32(0, 2, true);
    expect(() => decodePcm16WireFrame(buffer, 1)).toThrow(
      /Unsupported PCM protocol version/,
    );

    new DataView(buffer).setUint32(0, 1, true);
    expect(() => decodePcm16WireFrame(buffer, 2)).toThrow(/payload length/);
  });

  it('packetizes arbitrary chunks into exact 50 ms frames', () => {
    const packetizer = new Pcm16FramePacketizer({
      sampleRate: 48_000,
      channels: 1,
    });
    const first = packetizer.push({
      sourceId: 'mic-1',
      timestamp: 1_000,
      sampleRate: 48_000,
      channels: 1,
      channelData: [new Float32Array(1_200).fill(0.25)],
    });
    const second = packetizer.push({
      sourceId: 'mic-1',
      timestamp: 1_025,
      sampleRate: 48_000,
      channels: 1,
      channelData: [new Float32Array(3_600).fill(0.5)],
    });

    expect(first).toEqual([]);
    expect(second).toHaveLength(2);
    expect(second[0]?.timestamp).toBe(1_000);
    expect(second[1]?.timestamp).toBe(1_050);
    expect(second[0]?.channelData[0]).toHaveLength(
      getPcmFrameSampleCount(48_000),
    );
    expect(second[0]?.channelData[0]?.[0]).toBe(0.25);
    expect(second[0]?.channelData[0]?.[1_200]).toBe(0.5);
  });
});
