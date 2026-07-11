import type { RecordingRecord, SpectorSettings } from '../domain';

export interface StoredAudioBlob {
  readonly key: string;
  readonly recordingId: string;
  readonly blob: Blob;
}

export interface PendingAudioChunk {
  readonly id?: number;
  readonly sessionId: string;
  readonly inputId: string;
  readonly sequence: number;
  readonly pcm: Int16Array;
}

export interface LegacyImportEntry {
  readonly hash: string;
  readonly relativePath: string;
  readonly importedAt: string;
  readonly recordingIds: readonly string[];
}

export interface RecordingWithAudio {
  readonly record: RecordingRecord;
  readonly audioBlobs: readonly StoredAudioBlob[];
}

export interface StorageSnapshot {
  readonly settings: SpectorSettings;
  readonly recordings: readonly RecordingWithAudio[];
}

export interface FinalizeAudioInput {
  readonly inputId: string;
  readonly wavBlobKey: string;
  readonly sampleRate: number;
  readonly channels: number;
}

export interface LegacyImportBatch {
  readonly settings: SpectorSettings;
  readonly imports: readonly {
    readonly provenance: LegacyImportEntry;
    readonly recordings: readonly RecordingWithAudio[];
  }[];
}

export interface LegacyImportCommitResult {
  readonly imported: number;
  readonly skipped: number;
  readonly recordingIds: readonly string[];
}
