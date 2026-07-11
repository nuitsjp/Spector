import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

import type { RecordingRecord, SpectorSettings } from '../domain';
import type {
  LegacyImportEntry,
  PendingAudioChunk,
  StoredAudioBlob,
} from './types';

export const SPECTOR_DATABASE_NAME = 'spector';
export const SPECTOR_DATABASE_VERSION = 1;

export interface SpectorDatabaseSchema extends DBSchema {
  settings: {
    key: string;
    value: SpectorSettings;
  };
  records: {
    key: string;
    value: RecordingRecord;
    indexes: { 'by-started-at': string };
  };
  audioBlobs: {
    key: string;
    value: StoredAudioBlob;
    indexes: { 'by-recording-id': string };
  };
  pendingAudioChunks: {
    key: number;
    value: PendingAudioChunk;
    indexes: {
      'by-session-id': string;
      'by-session-input': [string, string];
    };
  };
  legacyImports: {
    key: string;
    value: LegacyImportEntry;
    indexes: { 'by-hash': string };
  };
}

export type SpectorDatabase = IDBPDatabase<SpectorDatabaseSchema>;

export const openSpectorDatabase = (
  name = SPECTOR_DATABASE_NAME,
): Promise<SpectorDatabase> =>
  openDB<SpectorDatabaseSchema>(name, SPECTOR_DATABASE_VERSION, {
    upgrade(database) {
      database.createObjectStore('settings');

      const records = database.createObjectStore('records', {
        keyPath: 'id',
      });
      records.createIndex('by-started-at', 'startedAt');

      const audioBlobs = database.createObjectStore('audioBlobs', {
        keyPath: 'key',
      });
      audioBlobs.createIndex('by-recording-id', 'recordingId');

      const pendingAudioChunks = database.createObjectStore(
        'pendingAudioChunks',
        { keyPath: 'id', autoIncrement: true },
      );
      pendingAudioChunks.createIndex('by-session-id', 'sessionId');
      pendingAudioChunks.createIndex('by-session-input', [
        'sessionId',
        'inputId',
      ]);

      const legacyImports = database.createObjectStore('legacyImports', {
        keyPath: 'hash',
      });
      legacyImports.createIndex('by-hash', 'hash', { unique: true });
    },
  });
