const toFloat32 = Math.fround;

/**
 * NAudio 2.2.1 compatible biquad implementation.
 *
 * Coefficients remain float64 while delay elements are rounded to float32 after
 * every transform, matching NAudio.Dsp.BiQuadFilter.
 */
class BiQuadFilter {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  private constructor(
    private readonly a0: number,
    private readonly a1: number,
    private readonly a2: number,
    private readonly a3: number,
    private readonly a4: number,
  ) {}

  static highPass(
    sampleRate: number,
    cutoffFrequency: number,
    q: number,
  ): BiQuadFilter {
    const w0 = (2 * Math.PI * cutoffFrequency) / sampleRate;
    const cosw0 = Math.cos(w0);
    const alpha = Math.sin(w0) / toFloat32(2 * q);
    const b0 = (1 + cosw0) / 2;
    const b1 = -(1 + cosw0);
    const b2 = (1 + cosw0) / 2;
    const aa0 = 1 + alpha;
    const aa1 = -2 * cosw0;
    const aa2 = 1 - alpha;

    return BiQuadFilter.fromCoefficients(aa0, aa1, aa2, b0, b1, b2);
  }

  static lowPass(
    sampleRate: number,
    cutoffFrequency: number,
    q: number,
  ): BiQuadFilter {
    const w0 = (2 * Math.PI * cutoffFrequency) / sampleRate;
    const cosw0 = Math.cos(w0);
    const alpha = Math.sin(w0) / toFloat32(2 * q);
    const b0 = (1 - cosw0) / 2;
    const b1 = 1 - cosw0;
    const b2 = (1 - cosw0) / 2;
    const aa0 = 1 + alpha;
    const aa1 = -2 * cosw0;
    const aa2 = 1 - alpha;

    return BiQuadFilter.fromCoefficients(aa0, aa1, aa2, b0, b1, b2);
  }

  static peakingEq(
    sampleRate: number,
    centreFrequency: number,
    q: number,
    dbGain: number,
  ): BiQuadFilter {
    const w0 = (2 * Math.PI * centreFrequency) / sampleRate;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const alpha = sinw0 / toFloat32(2 * q);
    const gainExponent = toFloat32(dbGain / toFloat32(40));
    const a = Math.pow(10, gainExponent);
    const b0 = 1 + alpha * a;
    const b1 = -2 * cosw0;
    const b2 = 1 - alpha * a;
    const aa0 = 1 + alpha / a;
    const aa1 = -2 * cosw0;
    const aa2 = 1 - alpha / a;

    return BiQuadFilter.fromCoefficients(aa0, aa1, aa2, b0, b1, b2);
  }

  private static fromCoefficients(
    aa0: number,
    aa1: number,
    aa2: number,
    b0: number,
    b1: number,
    b2: number,
  ): BiQuadFilter {
    return new BiQuadFilter(b0 / aa0, b1 / aa0, b2 / aa0, aa1 / aa0, aa2 / aa0);
  }

  transform(input: number): number {
    const result =
      this.a0 * input +
      this.a1 * this.x1 +
      this.a2 * this.x2 -
      this.a3 * this.y1 -
      this.a4 * this.y2;

    this.x2 = this.x1;
    this.x1 = input;
    this.y2 = this.y1;
    this.y1 = toFloat32(result);

    return this.y1;
  }

  reset(): void {
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
  }
}

const createFilterCascade = (sampleRate: number): BiQuadFilter[] => {
  const floatSampleRate = toFloat32(sampleRate);
  let f1 = toFloat32(20.598997);
  let f2 = toFloat32(107.65265);
  let f3 = toFloat32(737.86223);
  let f4 = toFloat32(12194.217);

  const nyquist = toFloat32(floatSampleRate / toFloat32(2));
  const frequencyLimit = toFloat32(nyquist * toFloat32(0.8));
  f1 = Math.min(f1, frequencyLimit);
  f2 = Math.min(f2, frequencyLimit);
  f3 = Math.min(f3, frequencyLimit);
  f4 = Math.min(f4, frequencyLimit);

  const q = toFloat32(0.5);
  const centreFrequency = toFloat32(Math.sqrt(toFloat32(f2 * f3)));

  return [
    BiQuadFilter.highPass(floatSampleRate, f1, q),
    BiQuadFilter.highPass(floatSampleRate, f1, q),
    BiQuadFilter.lowPass(floatSampleRate, f4, q),
    BiQuadFilter.lowPass(floatSampleRate, f4, q),
    BiQuadFilter.peakingEq(floatSampleRate, centreFrequency, q, toFloat32(3)),
  ];
};

/** Stateful A-weighting cascade ported from the WPF implementation. */
export class AWeightingFilter {
  private readonly filters: readonly BiQuadFilter[];

  constructor(readonly sampleRate: number) {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new RangeError(
        `sampleRate must be a finite number greater than 0; received ${String(sampleRate)}.`,
      );
    }

    this.filters = createFilterCascade(sampleRate);
  }

  /** Processes one interleaved PCM stream and advances this filter's state. */
  process(samples: Float32Array): Float32Array {
    const output = new Float32Array(samples.length);

    for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
      let sample = samples[sampleIndex] ?? 0;

      for (const filter of this.filters) {
        sample = filter.transform(sample);
        if (!Number.isFinite(sample)) {
          sample = 0;
        }
      }

      output[sampleIndex] = Math.max(-1, Math.min(1, sample));
    }

    return output;
  }

  reset(): void {
    for (const filter of this.filters) {
      filter.reset();
    }
  }
}
