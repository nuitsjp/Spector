import { Pcm16ChunkAccumulator } from './pcm16';

interface ConfigureMessage {
  readonly type: 'configure';
  readonly sampleRate: number;
  readonly channels: number;
}

interface AppendMessage {
  readonly type: 'append';
  readonly timestamp: number;
  readonly channelBuffers: readonly ArrayBuffer[];
}

interface FlushMessage {
  readonly type: 'flush';
}

type RecorderRequest = ConfigureMessage | AppendMessage | FlushMessage;

let accumulator: Pcm16ChunkAccumulator | null = null;

const postChunk = (chunk: {
  readonly sequence: number;
  readonly timestamp: number;
  readonly sampleCount: number;
  readonly pcm16: ArrayBuffer;
}): void => {
  self.postMessage({ type: 'chunk', ...chunk }, { transfer: [chunk.pcm16] });
};

self.addEventListener('message', (event: MessageEvent<RecorderRequest>) => {
  try {
    const message = event.data;
    switch (message.type) {
      case 'configure':
        accumulator = new Pcm16ChunkAccumulator(
          message.sampleRate,
          message.channels,
        );
        self.postMessage({ type: 'configured' });
        break;
      case 'append':
        if (accumulator === null)
          throw new Error('Recorder is not configured.');
        for (const chunk of accumulator.append(
          message.channelBuffers.map((buffer) => new Float32Array(buffer)),
          message.timestamp,
        )) {
          postChunk(chunk);
        }
        break;
      case 'flush': {
        if (accumulator === null)
          throw new Error('Recorder is not configured.');
        const chunk = accumulator.flush();
        if (chunk !== null) postChunk(chunk);
        self.postMessage({ type: 'flushed' });
        break;
      }
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export {};
