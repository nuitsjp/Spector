import type { RecordingRecord, SpectorSettings } from '../domain';

export interface RecordingAudioBlob {
  readonly key: string;
  readonly blob: Blob;
}

export interface SpectorRepository {
  loadSettings(): Promise<SpectorSettings | undefined>;
  saveSettings(settings: SpectorSettings): Promise<void>;
  listRecordings(): Promise<readonly RecordingRecord[]>;
  getRecording(id: string): Promise<RecordingRecord | undefined>;
  saveRecording(
    record: RecordingRecord,
    audioBlobs: readonly RecordingAudioBlob[],
  ): Promise<void>;
  deleteRecording(id: string): Promise<void>;
  getAudioBlob(key: string): Promise<Blob | undefined>;
}
