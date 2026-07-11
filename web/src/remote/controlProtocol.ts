import {
  CONTROL_PROTOCOL_VERSION,
  createPlaybackGain,
  type RemoteControlMessage,
} from '../domain';

export class RemoteProtocolError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RemoteProtocolError';
    this.code = code;
  }
}

const asObject = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RemoteProtocolError(
      'invalid-control-message',
      'Control message must be a JSON object.',
    );
  }

  return value as Record<string, unknown>;
};

const requireString = (
  value: unknown,
  fieldName: string,
  allowEmpty = false,
): string => {
  if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0)) {
    throw new RemoteProtocolError(
      'invalid-control-message',
      `${fieldName} must be a non-empty string.`,
    );
  }

  return value;
};

const requirePositiveInteger = (value: unknown, fieldName: string): number => {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new RemoteProtocolError(
      'invalid-control-message',
      `${fieldName} must be a positive integer.`,
    );
  }

  return value as number;
};

export const parseControlMessage = (data: unknown): RemoteControlMessage => {
  if (typeof data !== 'string') {
    throw new RemoteProtocolError(
      'invalid-control-message',
      'Control data channel accepts JSON text only.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(data) as unknown;
  } catch {
    throw new RemoteProtocolError(
      'invalid-control-json',
      'Control message is not valid JSON.',
    );
  }

  const message = asObject(parsed);
  if (message.v !== CONTROL_PROTOCOL_VERSION) {
    throw new RemoteProtocolError(
      'unsupported-control-version',
      `Unsupported control protocol version: ${String(message.v)}.`,
    );
  }

  switch (message.type) {
    case 'hello':
      return {
        v: CONTROL_PROTOCOL_VERSION,
        type: 'hello',
        sourceId: requireString(message.sourceId, 'sourceId'),
        name: requireString(message.name, 'name'),
        sampleRate: requirePositiveInteger(message.sampleRate, 'sampleRate'),
        channels: requirePositiveInteger(message.channels, 'channels'),
      };
    case 'startTestSignal':
      if (typeof message.playbackGain !== 'number') {
        throw new RemoteProtocolError(
          'invalid-control-message',
          'playbackGain must be a number.',
        );
      }
      try {
        return {
          v: CONTROL_PROTOCOL_VERSION,
          type: 'startTestSignal',
          playbackGain: createPlaybackGain(message.playbackGain),
        };
      } catch (error) {
        throw new RemoteProtocolError(
          'invalid-control-message',
          error instanceof Error ? error.message : 'Invalid playbackGain.',
        );
      }
    case 'stopTestSignal':
      return { v: CONTROL_PROTOCOL_VERSION, type: 'stopTestSignal' };
    case 'disconnect':
      return { v: CONTROL_PROTOCOL_VERSION, type: 'disconnect' };
    case 'error':
      return {
        v: CONTROL_PROTOCOL_VERSION,
        type: 'error',
        code: requireString(message.code, 'code'),
        message: requireString(message.message, 'message'),
      };
    default:
      throw new RemoteProtocolError(
        'unsupported-control-type',
        `Unsupported control message type: ${String(message.type)}.`,
      );
  }
};

export const serializeControlMessage = (
  message: RemoteControlMessage,
): string => JSON.stringify(message);
