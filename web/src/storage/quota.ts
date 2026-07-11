export interface RecordingCapacityInput {
  readonly sampleRate: number;
  readonly channels: number;
}

export interface StorageEstimateResult {
  readonly quota: number;
  readonly usage: number;
  readonly available: number;
}

export class InsufficientStorageError extends Error {
  public constructor(
    public readonly requiredBytes: number,
    public readonly availableBytes: number,
  ) {
    super(
      `録音に必要な空き容量が不足しています。必要: ${requiredBytes} bytes、空き: ${availableBytes} bytes。`,
    );
    this.name = 'InsufficientStorageError';
  }
}

export class StorageQuotaExceededError extends Error {
  public constructor(options?: ErrorOptions) {
    super('ブラウザーの保存容量を超えました。', options);
    this.name = 'StorageQuotaExceededError';
  }
}

export const calculateRequiredRecordingBytes = (
  durationSeconds: number,
  inputs: readonly RecordingCapacityInput[],
): number => {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new RangeError('durationSeconds must be greater than zero.');
  }

  return inputs.reduce((total, input) => {
    if (
      !Number.isInteger(input.sampleRate) ||
      input.sampleRate <= 0 ||
      !Number.isInteger(input.channels) ||
      input.channels <= 0
    ) {
      throw new RangeError(
        'Sample rates and channel counts must be positive integers.',
      );
    }

    return (
      total +
      Math.ceil(durationSeconds * input.sampleRate * input.channels * 2) +
      44
    );
  }, 0);
};

export const toStorageDomainError = (error: unknown): Error => {
  if (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  ) {
    return new StorageQuotaExceededError({ cause: error });
  }

  return error instanceof Error ? error : new Error(String(error));
};

export class StorageQuotaService {
  private persistenceRequested = false;
  private readonly storage: StorageManager | undefined;

  public constructor(storage?: StorageManager) {
    this.storage =
      storage ??
      (typeof navigator === 'undefined' ? undefined : navigator.storage);
  }

  public async estimate(): Promise<StorageEstimateResult> {
    if (this.storage === undefined) {
      throw new Error('StorageManager is not available.');
    }

    const estimate = await this.storage.estimate();
    const quota = estimate.quota ?? 0;
    const usage = estimate.usage ?? 0;
    return { quota, usage, available: Math.max(0, quota - usage) };
  }

  public async ensureCapacity(
    requiredBytes: number,
  ): Promise<StorageEstimateResult> {
    if (!Number.isSafeInteger(requiredBytes) || requiredBytes < 0) {
      throw new RangeError(
        'requiredBytes must be a non-negative safe integer.',
      );
    }

    const estimate = await this.estimate();
    if (requiredBytes > estimate.available) {
      throw new InsufficientStorageError(requiredBytes, estimate.available);
    }
    return estimate;
  }

  public async requestPersistenceOnFirstSave(): Promise<boolean> {
    if (this.persistenceRequested) return false;
    this.persistenceRequested = true;
    if (this.storage?.persist === undefined) return false;
    return this.storage.persist();
  }
}
