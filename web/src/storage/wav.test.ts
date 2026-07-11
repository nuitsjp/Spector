import { WaveFile } from 'wavefile';
import { describe, expect, it } from 'vitest';

import { decodeWaveFile, encodePcm16Wave } from './wav';

const waveBlob = (bitDepth: string, samples: readonly number[]): Blob => {
  const wave = new WaveFile();
  wave.fromScratch(1, 48_000, bitDepth, samples);
  return new Blob([Uint8Array.from(wave.toBuffer())], { type: 'audio/wav' });
};

const extensibleFloatWaveBlob = (samples: readonly number[]): Blob => {
  const dataSize = samples.length * 4;
  const bytes = new Uint8Array(12 + 8 + 40 + 8 + dataSize);
  const view = new DataView(bytes.buffer);
  const writeId = (offset: number, value: string): void => {
    [...value].forEach((character, index) => {
      bytes[offset + index] = character.charCodeAt(0);
    });
  };
  writeId(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  writeId(8, 'WAVE');
  writeId(12, 'fmt ');
  view.setUint32(16, 40, true);
  view.setUint16(20, 65_534, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 48_000, true);
  view.setUint32(28, 48_000 * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 32, true);
  view.setUint16(36, 22, true);
  view.setUint16(38, 32, true);
  view.setUint32(40, 0, true);
  bytes.set(
    Uint8Array.of(
      3,
      0,
      0,
      0,
      0,
      0,
      0x10,
      0,
      0x80,
      0,
      0,
      0xaa,
      0,
      0x38,
      0x9b,
      0x71,
    ),
    44,
  );
  writeId(60, 'data');
  view.setUint32(64, dataSize, true);
  samples.forEach((sample, index) =>
    view.setFloat32(68 + index * 4, sample, true),
  );
  return new Blob([bytes], { type: 'audio/wav' });
};

describe('WAV codec', () => {
  it('round-trips interleaved PCM16 within one LSB', async () => {
    const source = Int16Array.from([-32_768, -12_345, 0, 12_345, 32_767]);
    const decoded = await decodeWaveFile(encodePcm16Wave(source, 44_100, 1));

    expect(decoded.sampleRate).toBe(44_100);
    expect(decoded.channels).toBe(1);
    decoded.samples.forEach((sample, index) => {
      expect(Math.abs(sample - source[index]! / 32_768)).toBeLessThanOrEqual(
        1 / 32_768,
      );
    });
  });

  it.each([
    ['16', [-32_768, 0, 32_767]],
    ['32f', [-1, 0, 1]],
    ['12', [-2_048, 0, 2_047]],
  ])('reads %s PCM/float WAV', async (bitDepth, samples) => {
    const decoded = await decodeWaveFile(waveBlob(bitDepth, samples));
    expect(decoded.samples).toHaveLength(samples.length);
    expect([...decoded.samples].every(Number.isFinite)).toBe(true);
    expect(
      [...decoded.samples].every((sample) => sample >= -1 && sample <= 1),
    ).toBe(true);
  });

  it('reads WAVE_FORMAT_EXTENSIBLE IEEE Float samples', async () => {
    const source = [-1, 0, 0.5, 1];
    const decoded = await decodeWaveFile(extensibleFloatWaveBlob(source));

    expect(decoded.sampleRate).toBe(48_000);
    expect(decoded.channels).toBe(1);
    expect([...decoded.samples]).toEqual(source);
  });

  it.each(['alaw', 'mulaw'])('decodes %s WAV', async (codec) => {
    const wave = new WaveFile();
    wave.fromScratch(1, 8_000, '16', [-20_000, 0, 20_000, 0]);
    if (codec === 'alaw') wave.toALaw();
    else wave.toMuLaw();

    const decoded = await decodeWaveFile(
      new Blob([Uint8Array.from(wave.toBuffer())], { type: 'audio/wav' }),
    );
    expect(decoded.sampleRate).toBe(8_000);
    expect([...decoded.samples].every(Number.isFinite)).toBe(true);
    expect(
      [...decoded.samples].every((sample) => sample >= -1 && sample <= 1),
    ).toBe(true);
  });

  it('rejects malformed input', async () => {
    await expect(decodeWaveFile(new Blob(['not wav']))).rejects.toThrow(
      'WAVファイルを読み込めません',
    );
  });
});
