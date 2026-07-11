export interface RecordingChunk {
  readonly recordingId: string;
  readonly inputId: string;
  readonly sequence: number;
  /** Capture timestamp in milliseconds. */
  readonly timestamp: number;
  readonly sampleRate: number;
  readonly channels: number;
  /** Number of sample frames per channel. */
  readonly sampleCount: number;
  readonly pcm16: ArrayBuffer;
}

export interface RecordingChunkSink {
  writeChunk(chunk: RecordingChunk): Promise<void>;
}
