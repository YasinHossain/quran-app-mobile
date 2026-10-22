import * as FileSystem from 'expo-file-system/legacy';

function getCacheDirectory(): string {
  const dir = FileSystem.cacheDirectory;
  if (!dir) {
    throw new Error('FileSystem.cacheDirectory is unavailable on this platform');
  }
  return dir;
}

function normalizeId(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : 0;
}

function sanitizeSegment(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export class HostedPackFileStore {
  async prepareTemporaryPackDirectoryAsync(
    bucket: string,
    resourceId: number,
    version: string
  ): Promise<string> {
    const normalizedBucket = sanitizeSegment(bucket);
    if (!normalizedBucket) {
      throw new Error('bucket is required');
    }

    const normalizedResourceId = normalizeId(resourceId);
    if (normalizedResourceId <= 0) {
      throw new Error('resourceId must be a positive integer');
    }

    const normalizedVersion = sanitizeSegment(version);
    if (!normalizedVersion) {
      throw new Error('version is required');
    }

    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const directoryUri = `${getCacheDirectory()}${normalizedBucket}/${normalizedResourceId}/${normalizedVersion}/${nonce}/`;

    await FileSystem.deleteAsync(directoryUri, { idempotent: true });
    await FileSystem.makeDirectoryAsync(directoryUri, { intermediates: true });

    return directoryUri;
  }

  async deleteTemporaryPackDirectoryAsync(directoryUri: string): Promise<void> {
    await FileSystem.deleteAsync(directoryUri, { idempotent: true });
  }
}
