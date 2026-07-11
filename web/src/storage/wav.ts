import { WaveFile } from 'wavefile';

export interface DecodedWaveFile {
  readonly blob: Blob;
  readonly samples: Float32Array;
  readonly sampleRate: number;
  readonly channels: number;
}

interface WaveFormatChunk {
  readonly audioFormat?: unknown;
  readonly numChannels?: unknown;
  readonly sampleRate?: unknown;
  readonly bitsPerSample?: unknown;
  readonly subformat?: unknown;
}

const assertPositiveInteger = (value: unknown, field: string): number => {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new Error(`WAV ${field} is invalid.`);
  }
  return value as number;
};

export const encodePcm16Wave = (
  samples: Int16Array,
  sampleRate: number,
  channels: number,
): Blob => {
  assertPositiveInteger(sampleRate, 'sample rate');
  assertPositiveInteger(channels, 'channel count');
  if (samples.length % channels !== 0) {
    throw new RangeError(
      'Interleaved PCM sample count must be divisible by channels.',
    );
  }

  const wave = new WaveFile();
  wave.fromScratch(channels, sampleRate, '16', samples);
  return new Blob([Uint8Array.from(wave.toBuffer())], { type: 'audio/wav' });
};

const patchExtensibleFloatFormat = (source: Uint8Array): Uint8Array => {
  const bytes = Uint8Array.from(source);
  const view = new DataView(bytes.buffer);
  const isBigEndian =
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x58;
  const littleEndian = !isBigEndian;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const isFormatChunk =
      bytes[offset] === 0x66 &&
      bytes[offset + 1] === 0x6d &&
      bytes[offset + 2] === 0x74 &&
      bytes[offset + 3] === 0x20;
    const chunkSize = view.getUint32(offset + 4, littleEndian);
    if (isFormatChunk) {
      if (chunkSize < 40 || offset + 8 + chunkSize > bytes.length) {
        throw new Error('WAVE_FORMAT_EXTENSIBLE fmt chunk is invalid.');
      }
      view.setUint16(offset + 8, 3, littleEndian);
      return bytes;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  throw new Error('WAV fmt chunk is missing.');
};

const normalizeSamples = (
  samples: Float64Array,
  bitDepth: string,
): Float32Array => {
  if (bitDepth.endsWith('f') || bitDepth === '64') {
    return Float32Array.from(samples, (sample) =>
      Math.max(-1, Math.min(1, sample)),
    );
  }

  const numericBitDepth = Number.parseInt(bitDepth, 10);
  if (
    !Number.isInteger(numericBitDepth) ||
    numericBitDepth < 8 ||
    numericBitDepth > 53
  ) {
    throw new Error(`Unsupported WAV bit depth: ${bitDepth}.`);
  }

  if (numericBitDepth === 8) {
    return Float32Array.from(samples, (sample) => (sample - 128) / 128);
  }

  const scale = 2 ** (numericBitDepth - 1);
  return Float32Array.from(samples, (sample) =>
    Math.max(-1, Math.min(1, sample / scale)),
  );
};

export const decodeWaveFile = async (blob: Blob): Promise<DecodedWaveFile> => {
  const sourceBytes = new Uint8Array(await blob.arrayBuffer());
  let wave: WaveFile;
  try {
    wave = new WaveFile(sourceBytes);
    const sourceFormat = wave.fmt as WaveFormatChunk;
    if (sourceFormat.audioFormat === 65_534) {
      const subformat = sourceFormat.subformat;
      const subtype = Array.isArray(subformat) ? subformat[0] : undefined;
      if (subtype === 3) {
        wave = new WaveFile(patchExtensibleFloatFormat(sourceBytes));
      } else if (subtype !== 1) {
        throw new Error(
          `Unsupported WAVE_FORMAT_EXTENSIBLE subtype: ${String(subtype)}.`,
        );
      }
    }
    if (wave.bitDepth === '8a') wave.fromALaw('16');
    if (wave.bitDepth === '8m') wave.fromMuLaw('16');
  } catch (error) {
    throw new Error('WAVファイルを読み込めません。', { cause: error });
  }

  const format = wave.fmt as WaveFormatChunk;
  const sampleRate = assertPositiveInteger(format.sampleRate, 'sample rate');
  const channels = assertPositiveInteger(format.numChannels, 'channel count');
  const audioFormat = assertPositiveInteger(format.audioFormat, 'audio format');
  if (![1, 3, 6, 7, 65_534].includes(audioFormat)) {
    throw new Error(`Unsupported WAV audio format: ${audioFormat}.`);
  }

  const rawSamples = wave.getSamples(true);
  const samples = normalizeSamples(rawSamples, wave.bitDepth);
  if (samples.length % channels !== 0) {
    throw new Error('WAV sample count is not aligned to its channel count.');
  }

  return { blob, samples, sampleRate, channels };
};
