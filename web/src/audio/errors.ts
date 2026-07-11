export type AudioEngineErrorCode =
  | 'unsupported-feature'
  | 'permission-denied'
  | 'device-not-found'
  | 'invalid-state'
  | 'missing-primary-input'
  | 'missing-playback-output'
  | 'insufficient-storage'
  | 'source-disconnected'
  | 'audio-context-stopped'
  | 'recording-failed';

export type RequiredAudioFeature =
  | 'web-audio'
  | 'audio-worklet'
  | 'media-devices'
  | 'microphone-capture'
  | 'display-audio-capture'
  | 'playback-output-selection';

export interface AudioEngineErrorOptions {
  readonly feature?: RequiredAudioFeature;
  readonly cause?: unknown;
}

/** A user-presentable failure at a browser audio boundary. */
export class AudioEngineError extends Error {
  readonly code: AudioEngineErrorCode;
  readonly feature: RequiredAudioFeature | null;
  override readonly cause: unknown;

  constructor(
    code: AudioEngineErrorCode,
    message: string,
    options: AudioEngineErrorOptions = {},
  ) {
    super(message);
    this.name = 'AudioEngineError';
    this.code = code;
    this.feature = options.feature ?? null;
    this.cause = options.cause;
  }
}

export const isQuotaExceededError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  const name = 'name' in error ? error.name : undefined;
  if (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    name === 'StorageQuotaExceededError' ||
    name === 'InsufficientStorageError'
  ) {
    return true;
  }
  const cause = 'cause' in error ? error.cause : undefined;
  return cause !== error && isQuotaExceededError(cause);
};

export const toAudioCaptureError = (
  error: unknown,
  feature: 'microphone-capture' | 'display-audio-capture',
): AudioEngineError => {
  if (error instanceof AudioEngineError) return error;

  if (
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'SecurityError')
  ) {
    return new AudioEngineError(
      'permission-denied',
      feature === 'microphone-capture'
        ? 'マイクの利用が許可されませんでした。'
        : 'システム音声の共有が許可されませんでした。',
      { feature, cause: error },
    );
  }

  if (
    error instanceof DOMException &&
    (error.name === 'NotFoundError' || error.name === 'OverconstrainedError')
  ) {
    return new AudioEngineError(
      'device-not-found',
      feature === 'microphone-capture'
        ? '選択したマイクを利用できません。'
        : '共有された画面に音声トラックがありません。',
      { feature, cause: error },
    );
  }

  return new AudioEngineError(
    'invalid-state',
    feature === 'microphone-capture'
      ? 'マイクを開始できませんでした。'
      : 'システム音声の共有を開始できませんでした。',
    { feature, cause: error },
  );
};
