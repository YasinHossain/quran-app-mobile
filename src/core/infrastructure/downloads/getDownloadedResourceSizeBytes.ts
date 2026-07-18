import * as FileSystem from 'expo-file-system/legacy';

import type { DownloadIndexItemWithKey } from '@/src/core/domain/entities/DownloadIndexItem';
import { AudioFileStore } from '@/src/core/infrastructure/audio/AudioFileStore';
import { getAppDbAsync } from '@/src/core/infrastructure/db';
import { MushafPackFileStore } from '@/src/core/infrastructure/mushaf/MushafPackFileStore';
import { WordReferencePackFileStore } from '@/src/core/infrastructure/word-reference/WordReferencePackFileStore';

type SizeRow = { bytes: number | null };

function getPositiveSize(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

async function getQuerySizeBytes(
  sql: string,
  params: Array<string | number>
): Promise<number> {
  const db = await getAppDbAsync();
  const row = await db.getFirstAsync<SizeRow>(sql, params);
  return getPositiveSize(row?.bytes);
}

async function getDirectorySizeBytes(directoryUri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(directoryUri);
  if (!info.exists) return 0;
  if (!info.isDirectory) return getPositiveSize(info.size);

  const children = await FileSystem.readDirectoryAsync(directoryUri);
  const sizes = await Promise.all(
    children.map((child) => {
      const separator = directoryUri.endsWith('/') ? '' : '/';
      return getDirectorySizeBytes(`${directoryUri}${separator}${child}`);
    })
  );
  return sizes.reduce((total, size) => total + size, 0);
}

function placeholders(values: readonly unknown[]): string {
  return values.map(() => '?').join(', ');
}

async function getAudioSizeBytes(item: DownloadIndexItemWithKey): Promise<number> {
  if (item.content.kind !== 'audio') return 0;

  const fileStore = new AudioFileStore({
    reciterId: item.content.reciterId,
    surahId: item.content.surahId,
  });
  const info = await FileSystem.getInfoAsync(fileStore.getLocalUri());
  return info.exists && !info.isDirectory ? getPositiveSize(info.size) : 0;
}

async function getMushafPackSizeBytes(item: DownloadIndexItemWithKey): Promise<number> {
  if (item.content.kind !== 'mushaf-pack') return 0;

  const fileStore = new MushafPackFileStore();
  return getDirectorySizeBytes(
    fileStore.getInstalledVersionDirectoryUri(item.content.packId, item.content.version)
  );
}

async function getWordReferencePackSizeBytes(item: DownloadIndexItemWithKey): Promise<number> {
  if (item.content.kind !== 'word-reference-pack') return 0;
  return getDirectorySizeBytes(
    new WordReferencePackFileStore().getVersionDirectoryUri(
      item.content.packId,
      item.content.version
    )
  );
}

async function getIndividualDownloadedResourceSizeBytes(
  item: DownloadIndexItemWithKey
): Promise<number> {
  switch (item.content.kind) {
    case 'translation':
      return getQuerySizeBytes(
        `SELECT COALESCE(SUM(LENGTH(CAST(text AS BLOB))), 0) AS bytes
         FROM offline_translations
         WHERE translation_id = ?;`,
        [item.content.translationId]
      );
    case 'tafsir':
      return 'scope' in item.content
        ? getQuerySizeBytes(
            `SELECT COALESCE(SUM(LENGTH(CAST(html AS BLOB))), 0) AS bytes
             FROM offline_tafsir
             WHERE tafsir_id = ? AND verse_key LIKE ?;`,
            [item.content.tafsirId, `${item.content.surahId}:%`]
          )
        : getQuerySizeBytes(
            `SELECT COALESCE(SUM(LENGTH(CAST(html AS BLOB))), 0) AS bytes
             FROM offline_tafsir
             WHERE tafsir_id = ?;`,
            [item.content.tafsirId]
          );
    case 'words':
      return getQuerySizeBytes(
        `SELECT COALESCE(SUM(LENGTH(CAST(words_json AS BLOB))), 0) AS bytes
         FROM offline_verses
         WHERE surah = ?;`,
        [item.content.surahId]
      );
    case 'word-translation':
      return getQuerySizeBytes(
        `SELECT COALESCE(SUM(LENGTH(CAST(words_json AS BLOB))), 0) AS bytes
         FROM offline_word_translations
         WHERE language_code = ?;`,
        [item.content.languageCode]
      );
    case 'audio':
      return getAudioSizeBytes(item);
    case 'mushaf-pack':
      return getMushafPackSizeBytes(item);
    case 'word-reference-pack':
      return getWordReferencePackSizeBytes(item);
    default:
      return 0;
  }
}

export async function getDownloadedResourceSizeBytesByKey(
  items: DownloadIndexItemWithKey[]
): Promise<Record<string, number>> {
  const sizedItems = await Promise.all(
    items
      .filter((item) => item.status === 'installed')
      .map(async (item) => [item.key, await getIndividualDownloadedResourceSizeBytes(item)] as const)
  );

  return Object.fromEntries(sizedItems);
}

/**
 * Returns the logical on-device bytes owned by installed download resources.
 * SQLite content is measured by byte length; audio and mushaf packs use their
 * actual files. SQLite page and index overhead is intentionally excluded, as
 * it cannot be attributed reliably to a single managed download.
 */
export async function getDownloadedResourceSizeBytes(
  items: DownloadIndexItemWithKey[]
): Promise<number> {
  const installedItems = items.filter((item) => item.status === 'installed');
  const translationIds = Array.from(
    new Set(
      installedItems.flatMap((item) =>
        item.content.kind === 'translation' ? [item.content.translationId] : []
      )
    )
  );
  const fullTafsirIds = Array.from(
    new Set(
      installedItems.flatMap((item) =>
        item.content.kind === 'tafsir' && !('scope' in item.content) ? [item.content.tafsirId] : []
      )
    )
  );
  const scopedTafsirItems = installedItems.flatMap((item) => {
    if (item.content.kind !== 'tafsir' || !('scope' in item.content)) return [];
    return [{ tafsirId: item.content.tafsirId, surahId: item.content.surahId }];
  });
  const wordLanguageCodes = Array.from(
    new Set(
      installedItems.flatMap((item) =>
        item.content.kind === 'word-translation' ? [item.content.languageCode] : []
      )
    )
  );
  const includesOfflineVerses = translationIds.length > 0 || wordLanguageCodes.length > 0;
  const databaseSizePromises: Array<Promise<number>> = [];

  if (includesOfflineVerses) {
    databaseSizePromises.push(
      getQuerySizeBytes(
        `
          SELECT COALESCE(SUM(
            LENGTH(CAST(verse_key AS BLOB)) +
            LENGTH(CAST(arabic_uthmani AS BLOB)) +
            COALESCE(LENGTH(CAST(words_json AS BLOB)), 0)
          ), 0) AS bytes
          FROM offline_verses;
        `,
        []
      )
    );
  }

  if (translationIds.length > 0) {
    databaseSizePromises.push(
      getQuerySizeBytes(
        `SELECT COALESCE(SUM(LENGTH(CAST(text AS BLOB))), 0) AS bytes
         FROM offline_translations
         WHERE translation_id IN (${placeholders(translationIds)});`,
        translationIds
      )
    );
  }

  if (fullTafsirIds.length > 0 || scopedTafsirItems.length > 0) {
    const conditions: string[] = [];
    const tafsirParams: Array<string | number> = [];

    if (fullTafsirIds.length > 0) {
      conditions.push(`tafsir_id IN (${placeholders(fullTafsirIds)})`);
      tafsirParams.push(...fullTafsirIds);
    }

    for (const { tafsirId, surahId } of scopedTafsirItems) {
      conditions.push('(tafsir_id = ? AND verse_key LIKE ?)');
      tafsirParams.push(tafsirId, `${surahId}:%`);
    }

    databaseSizePromises.push(
      getQuerySizeBytes(
        `SELECT COALESCE(SUM(LENGTH(CAST(html AS BLOB))), 0) AS bytes
         FROM offline_tafsir
         WHERE ${conditions.join(' OR ')};`,
        tafsirParams
      )
    );
  }

  if (wordLanguageCodes.length > 0) {
    databaseSizePromises.push(
      getQuerySizeBytes(
        `SELECT COALESCE(SUM(LENGTH(CAST(words_json AS BLOB))), 0) AS bytes
         FROM offline_word_translations
         WHERE language_code IN (${placeholders(wordLanguageCodes)});`,
        wordLanguageCodes
      )
    );
  }

  const fileSizePromises = installedItems.flatMap((item): Array<Promise<number>> => {
    if (item.content.kind === 'audio') {
      return [getAudioSizeBytes(item)];
    }

    if (item.content.kind === 'mushaf-pack') {
      return [getMushafPackSizeBytes(item)];
    }

    if (item.content.kind === 'word-reference-pack') {
      return [getWordReferencePackSizeBytes(item)];
    }

    return [];
  });

  const sizes = await Promise.all([...databaseSizePromises, ...fileSizePromises]);
  return sizes.reduce((total, size) => total + size, 0);
}
