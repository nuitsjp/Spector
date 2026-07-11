import { describe, expect, it } from 'vitest';

import { isQuotaExceededError, toAudioCaptureError } from './errors';

describe('audio boundary errors', () => {
  it('recognizes browser and storage-layer quota errors', () => {
    expect(
      isQuotaExceededError(new DOMException('full', 'QuotaExceededError')),
    ).toBe(true);
    const storageError = new Error('full');
    storageError.name = 'StorageQuotaExceededError';
    expect(isQuotaExceededError(storageError)).toBe(true);
    expect(isQuotaExceededError(new Error('other'))).toBe(false);
  });

  it('maps denied capture without adding a browser fallback', () => {
    expect(
      toAudioCaptureError(
        new DOMException('denied', 'NotAllowedError'),
        'microphone-capture',
      ),
    ).toMatchObject({
      code: 'permission-denied',
      feature: 'microphone-capture',
    });
  });
});
