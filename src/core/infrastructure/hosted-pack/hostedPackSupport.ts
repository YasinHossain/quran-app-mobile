import * as FileSystem from 'expo-file-system/legacy';

export function normalizePositiveInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : 0;
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function asPositiveNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

export function normalizeRelativePath(value: string): string {
  const normalized = value
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');

  if (!normalized) {
    throw new Error('A relative file path is required');
  }

  return normalized;
}

export function normalizeChecksum(checksum: string): string {
  const normalized = checksum.trim().toLowerCase();
  if (!normalized) {
    throw new Error('checksum is required');
  }

  if (/^[a-f0-9]{32}$/.test(normalized)) {
    return normalized;
  }

  const md5PrefixedMatch = normalized.match(/^md5[:\-]([a-f0-9]{32})$/);
  if (md5PrefixedMatch?.[1]) {
    return md5PrefixedMatch[1];
  }

  throw new Error(`Unsupported checksum format: ${checksum}`);
}

export function resolveHostedPackUrl(baseUrl: string, value?: string): string {
  const normalizedValue = value?.trim();
  if (!normalizedValue) {
    throw new Error('A download URL is required');
  }

  return new URL(normalizedValue, baseUrl).toString();
}

export async function verifyDownloadedFileAsync(
  fileUri: string,
  options: {
    checksum?: string | undefined;
    sizeBytes?: number | undefined;
  }
): Promise<void> {
  const shouldComputeMd5 = typeof options.checksum === 'string' && options.checksum.trim().length > 0;
  const info = await FileSystem.getInfoAsync(fileUri, { md5: shouldComputeMd5 });

  if (!info.exists || info.isDirectory) {
    throw new Error(`Downloaded file missing at ${fileUri}`);
  }

  if (typeof options.sizeBytes === 'number' && info.size !== options.sizeBytes) {
    throw new Error(`Downloaded file size mismatch for ${fileUri}`);
  }

  if (shouldComputeMd5) {
    const expectedChecksum = normalizeChecksum(options.checksum ?? '');
    const actualChecksum = info.md5?.toLowerCase();
    if (!actualChecksum || actualChecksum !== expectedChecksum) {
      throw new Error(`Downloaded file checksum mismatch for ${fileUri}`);
    }
  }
}

export async function downloadHostedPackFileAsync(
  url: string,
  fileUri: string,
  onProgress?: ((progress: { percent: number | null }) => void) | undefined
): Promise<void> {
  const parentDirectory = fileUri.slice(0, fileUri.lastIndexOf('/') + 1);
  await FileSystem.makeDirectoryAsync(parentDirectory, { intermediates: true });

  const download = FileSystem.createDownloadResumable(url, fileUri, {}, (progress) => {
    if (!onProgress) return;

    const expected = progress.totalBytesExpectedToWrite;
    const percent =
      expected > 0
        ? Math.max(0, Math.min(100, (progress.totalBytesWritten / expected) * 100))
        : null;

    onProgress({ percent });
  });

  const result = await download.downloadAsync();
  if (!result?.uri) {
    throw new Error(`Failed to download ${url}`);
  }
}

export async function readHostedPackJsonFileAsync<T>(fileUri: string): Promise<T> {
  const raw = await FileSystem.readAsStringAsync(fileUri);
  return JSON.parse(raw) as T;
}
