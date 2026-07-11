import type { RecordingWithAudio } from '../storage';
import {
  blobBytes,
  createZipBlob,
  jsonBytes,
  safeArchiveName,
} from './archive';

export const createRecordingArchive = async (
  recording: RecordingWithAudio,
): Promise<Blob> => {
  const byKey = new Map(
    recording.audioBlobs.map((audio) => [audio.key, audio]),
  );
  const files: Record<string, Uint8Array> = {
    'record.json': jsonBytes(recording.record),
  };

  for (const [index, device] of recording.record.deviceRecordings.entries()) {
    const audio = byKey.get(device.wavBlobKey);
    if (audio === undefined) {
      throw new Error(`Recording audio is missing: ${device.wavBlobKey}.`);
    }
    files[`audio/${index + 1}-${safeArchiveName(device.displayName)}.wav`] =
      await blobBytes(audio.blob);
  }
  return createZipBlob(files);
};
