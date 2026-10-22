const QURAN_CDN_AUDIO_BASE_URL = 'https://audio.qurancdn.com';

export type QuranWordLocation = {
  verseKey: string;
  wordPosition: number;
};

function toPositiveInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : null;
}

/**
 * Resolves Quran Foundation's public, dedicated word-pronunciation asset.
 *
 * These clips are intentionally separate from chapter/ayah recitation audio:
 * https://api-docs.quran.foundation/docs/sdk/javascript/audio/
 */
export function buildQuranWordAudioUrl({
  verseKey,
  wordPosition,
}: QuranWordLocation): string | null {
  const parts = verseKey.trim().split(':');
  if (parts.length !== 2) return null;

  const chapterId = toPositiveInteger(Number(parts[0]));
  const verseNumber = toPositiveInteger(Number(parts[1]));
  const position = toPositiveInteger(wordPosition);
  if (!chapterId || chapterId > 114 || !verseNumber || !position) return null;

  const assetName = [chapterId, verseNumber, position]
    .map((value) => String(value).padStart(3, '0'))
    .join('_');

  return `${QURAN_CDN_AUDIO_BASE_URL}/wbw/${assetName}.mp3`;
}
