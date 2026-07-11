import { strToU8 } from 'fflate';

import { blobBytes, createZipBlob, safeArchiveName } from './archive';

export interface AnalysisArchiveInput {
  readonly markdown: string;
  readonly chartPng: Blob;
  readonly baseName?: string;
}

export const createAnalysisArchive = async ({
  markdown,
  chartPng,
  baseName = 'analysis',
}: AnalysisArchiveInput): Promise<Blob> => {
  const name = safeArchiveName(baseName);
  return createZipBlob({
    [`${name}.md`]: strToU8(markdown),
    [`${name}.png`]: await blobBytes(chartPng),
  });
};
