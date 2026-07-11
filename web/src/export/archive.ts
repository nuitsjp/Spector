import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export class ArchiveValidationError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ArchiveValidationError';
  }
}

export type ArchiveFiles = Readonly<Record<string, Uint8Array>>;

export const jsonBytes = (value: unknown): Uint8Array =>
  strToU8(`${JSON.stringify(value, null, 2)}\n`);

export const decodeJson = (bytes: Uint8Array, path: string): unknown => {
  try {
    return JSON.parse(strFromU8(bytes)) as unknown;
  } catch (error) {
    throw new ArchiveValidationError(`${path} は正しいJSONではありません。`, {
      cause: error,
    });
  }
};

export const blobBytes = async (blob: Blob): Promise<Uint8Array> =>
  new Uint8Array(await blob.arrayBuffer());

export const createZipBlob = (files: Record<string, Uint8Array>): Blob => {
  try {
    return new Blob([Uint8Array.from(zipSync(files, { level: 6 }))], {
      type: 'application/zip',
    });
  } catch (error) {
    throw new ArchiveValidationError('ZIPファイルを作成できません。', {
      cause: error,
    });
  }
};

export const readZipBlob = async (blob: Blob): Promise<ArchiveFiles> => {
  let unpacked: Record<string, Uint8Array>;
  try {
    unpacked = unzipSync(await blobBytes(blob));
  } catch (error) {
    throw new ArchiveValidationError('ZIPファイルを読み込めません。', {
      cause: error,
    });
  }

  const files: Record<string, Uint8Array> = {};
  for (const [rawPath, bytes] of Object.entries(unpacked)) {
    const path = rawPath.replaceAll('\\', '/');
    if (
      path.startsWith('/') ||
      path.split('/').some((part) => part === '..') ||
      Object.hasOwn(files, path)
    ) {
      throw new ArchiveValidationError(`ZIP内のパスが不正です: ${rawPath}`);
    }
    if (!path.endsWith('/')) files[path] = bytes;
  }
  return files;
};

export const replaceWindowsInvalidFileNameCharacters = (
  value: string,
): string =>
  [...value]
    .map((character) =>
      '<>:"/\\|?*'.includes(character) || character.charCodeAt(0) < 32
        ? '_'
        : character,
    )
    .join('');

export const safeArchiveName = (value: string): string => {
  const sanitized = replaceWindowsInvalidFileNameCharacters(value)
    .normalize('NFC')
    .replace(/[. ]+$/g, '')
    .trim();
  return sanitized.length === 0 ? 'audio' : sanitized;
};
