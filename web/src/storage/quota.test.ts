import { describe, expect, it, vi } from 'vitest';

import {
  InsufficientStorageError,
  StorageQuotaExceededError,
  StorageQuotaService,
  calculateRequiredRecordingBytes,
  toStorageDomainError,
} from './quota';

describe('storage quota', () => {
  it('calculates PCM16 capacity including one WAV header per input', () => {
    expect(
      calculateRequiredRecordingBytes(2, [
        { sampleRate: 48_000, channels: 1 },
        { sampleRate: 44_100, channels: 2 },
      ]),
    ).toBe(2 * 48_000 * 2 + 44 + 2 * 44_100 * 2 * 2 + 44);
  });

  it('rejects a recording that cannot fit in the current estimate', async () => {
    const storage = {
      estimate: vi.fn().mockResolvedValue({ quota: 1_000, usage: 750 }),
      persist: vi.fn().mockResolvedValue(true),
    } as unknown as StorageManager;
    const service = new StorageQuotaService(storage);

    await expect(service.ensureCapacity(251)).rejects.toEqual(
      expect.objectContaining<Partial<InsufficientStorageError>>({
        name: 'InsufficientStorageError',
        requiredBytes: 251,
        availableBytes: 250,
      }),
    );
  });

  it('requests persistence only once', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    const service = new StorageQuotaService({
      persist,
    } as unknown as StorageManager);

    await expect(service.requestPersistenceOnFirstSave()).resolves.toBe(true);
    await expect(service.requestPersistenceOnFirstSave()).resolves.toBe(false);
    expect(persist).toHaveBeenCalledOnce();
  });

  it('converts browser quota errors to the domain error', () => {
    const source = new DOMException('full', 'QuotaExceededError');
    expect(toStorageDomainError(source)).toEqual(
      expect.objectContaining<Partial<StorageQuotaExceededError>>({
        name: 'StorageQuotaExceededError',
      }),
    );
  });
});
