export interface CalibrationSplinePoint {
  readonly levelDb: number;
  readonly playbackGain: number;
}

/** Natural cubic spline using the same Thomas-algorithm order as AudioCalibrator.cs. */
export class NaturalCubicCalibrationSpline {
  private readonly levelsDb: readonly number[];
  private readonly a: readonly number[];
  private readonly b: readonly number[];
  private readonly c: readonly number[];
  private readonly d: readonly number[];

  constructor(points: readonly CalibrationSplinePoint[]) {
    if (points.length < 2) {
      throw new RangeError('At least two calibration points are required.');
    }

    const sortedPoints = [...points].sort(
      (left, right) => left.levelDb - right.levelDb,
    );
    for (let index = 0; index < sortedPoints.length; index += 1) {
      const point = sortedPoints[index];
      if (
        point === undefined ||
        !Number.isFinite(point.levelDb) ||
        !Number.isFinite(point.playbackGain)
      ) {
        throw new RangeError('Calibration point values must be finite.');
      }
      if (index > 0 && sortedPoints[index - 1]?.levelDb === point.levelDb) {
        throw new RangeError(
          `Calibration level ${String(point.levelDb)} is duplicated.`,
        );
      }
    }

    this.levelsDb = sortedPoints.map((point) => point.levelDb);
    const playbackGains = sortedPoints.map((point) => point.playbackGain);
    const coefficients = this.calculateCoefficients(playbackGains);
    this.a = coefficients.a;
    this.b = coefficients.b;
    this.c = coefficients.c;
    this.d = coefficients.d;
  }

  estimatePlaybackGain(targetLevelDb: number): number {
    if (!Number.isFinite(targetLevelDb)) {
      throw new RangeError(
        `targetLevelDb must be finite; received ${String(targetLevelDb)}.`,
      );
    }

    const lastIntervalIndex = this.levelsDb.length - 2;
    let low = 0;
    let high = this.levelsDb.length - 1;
    let exactIndex = -1;

    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const middleLevel = this.levelsDb[middle];
      if (middleLevel === undefined) break;
      if (middleLevel === targetLevelDb) {
        exactIndex = middle;
        break;
      }
      if (middleLevel < targetLevelDb) low = middle + 1;
      else high = middle - 1;
    }

    const intervalIndex = Math.max(
      0,
      Math.min(lastIntervalIndex, exactIndex >= 0 ? exactIndex : low - 1),
    );
    const intervalStart = this.levelsDb[intervalIndex];
    const a = this.a[intervalIndex];
    const b = this.b[intervalIndex];
    const c = this.c[intervalIndex];
    const d = this.d[intervalIndex];
    if (
      intervalStart === undefined ||
      a === undefined ||
      b === undefined ||
      c === undefined ||
      d === undefined
    ) {
      throw new RangeError('Calibration spline coefficients are unavailable.');
    }

    const difference = targetLevelDb - intervalStart;
    return (
      a +
      b * difference +
      c * difference * difference +
      d * difference * difference * difference
    );
  }

  private calculateCoefficients(playbackGains: readonly number[]): {
    readonly a: number[];
    readonly b: number[];
    readonly c: number[];
    readonly d: number[];
  } {
    const pointCount = this.levelsDb.length;
    const levelDifferences = new Array<number>(pointCount - 1).fill(0);
    for (let index = 0; index < pointCount - 1; index += 1) {
      levelDifferences[index] =
        (this.levelsDb[index + 1] ?? 0) - (this.levelsDb[index] ?? 0);
    }

    const equationRightSide = new Array<number>(pointCount - 1).fill(0);
    for (let index = 1; index < pointCount - 1; index += 1) {
      equationRightSide[index] =
        3 *
        (((playbackGains[index + 1] ?? 0) - (playbackGains[index] ?? 0)) /
          (levelDifferences[index] ?? 0) -
          ((playbackGains[index] ?? 0) - (playbackGains[index - 1] ?? 0)) /
            (levelDifferences[index - 1] ?? 0));
    }

    const lowerDiagonal = new Array<number>(pointCount).fill(0);
    const diagonal = new Array<number>(pointCount).fill(0);
    const upperDiagonal = new Array<number>(pointCount).fill(0);
    const result = new Array<number>(pointCount).fill(0);

    diagonal[0] = 1;
    for (let index = 1; index < pointCount - 1; index += 1) {
      lowerDiagonal[index] = levelDifferences[index - 1] ?? 0;
      diagonal[index] =
        2 * ((this.levelsDb[index + 1] ?? 0) - (this.levelsDb[index - 1] ?? 0));
      upperDiagonal[index] = levelDifferences[index] ?? 0;
      result[index] = equationRightSide[index] ?? 0;
    }
    diagonal[pointCount - 1] = 1;

    for (let index = 1; index < pointCount; index += 1) {
      const multiplier =
        (lowerDiagonal[index] ?? 0) / (diagonal[index - 1] ?? 0);
      diagonal[index] =
        (diagonal[index] ?? 0) - multiplier * (upperDiagonal[index - 1] ?? 0);
      result[index] =
        (result[index] ?? 0) - multiplier * (result[index - 1] ?? 0);
    }

    const secondDerivatives = new Array<number>(pointCount).fill(0);
    secondDerivatives[pointCount - 1] =
      (result[pointCount - 1] ?? 0) / (diagonal[pointCount - 1] ?? 0);
    for (let index = pointCount - 2; index >= 0; index -= 1) {
      secondDerivatives[index] =
        ((result[index] ?? 0) -
          (upperDiagonal[index] ?? 0) * (secondDerivatives[index + 1] ?? 0)) /
        (diagonal[index] ?? 0);
    }

    const a = new Array<number>(pointCount - 1).fill(0);
    const b = new Array<number>(pointCount - 1).fill(0);
    const c = new Array<number>(pointCount - 1).fill(0);
    const d = new Array<number>(pointCount - 1).fill(0);
    for (let index = 0; index < pointCount - 1; index += 1) {
      const levelDifference = levelDifferences[index] ?? 0;
      a[index] = playbackGains[index] ?? 0;
      b[index] =
        ((playbackGains[index + 1] ?? 0) - (playbackGains[index] ?? 0)) /
          levelDifference -
        (levelDifference *
          ((secondDerivatives[index + 1] ?? 0) +
            2 * (secondDerivatives[index] ?? 0))) /
          3;
      c[index] = secondDerivatives[index] ?? 0;
      d[index] =
        ((secondDerivatives[index + 1] ?? 0) -
          (secondDerivatives[index] ?? 0)) /
        (3 * levelDifference);
    }

    return { a, b, c, d };
  }
}
