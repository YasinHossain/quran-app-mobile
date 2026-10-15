package com.anonymous.quranappmobile.nativesurahreader

import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap

/** Inclusive verse range in Mushaf order. A Surah is the range s:1 through s:last. */
internal data class NativeVerseRange(
    val startSurah: Int,
    val startAyah: Int,
    val endSurah: Int,
    val endAyah: Int,
) {
  val cacheKey: String
    get() = "$startSurah:$startAyah-$endSurah:$endAyah"

  companion object {
    fun forSurah(surahId: Int): NativeVerseRange =
        NativeVerseRange(surahId, 1, surahId, Int.MAX_VALUE)
  }
}

/** Quiet label above a Juz or Page passage. Surah readers have none. */
internal data class NativeScopeBanner(
    val title: String,
    val subtitle: String?,
)

internal sealed class NativeReaderRow {
  data class Banner(val banner: NativeScopeBanner) : NativeReaderRow()

  /** [isLeading] is false when the Surah starts after earlier verses in the same passage. */
  data class Intro(val intro: NativeSurahIntro, val isLeading: Boolean) : NativeReaderRow()

  data class Verse(val verseIndex: Int) : NativeReaderRow()
}

internal const val BANNER_ROW_ID = Long.MIN_VALUE

internal fun introRowId(chapterId: Int): Long = Long.MIN_VALUE + chapterId

/**
 * A Surah intro precedes its first verse only when that verse is in the passage, so a Juz that
 * starts mid-Surah opens with the banner and later Surahs still get their name and Bismillah.
 */
internal fun buildNativeReaderRows(
    verses: List<NativeVerse>,
    surahIntros: Map<Int, NativeSurahIntro>,
    scopeBanner: NativeScopeBanner?,
): List<NativeReaderRow> {
  val rows = ArrayList<NativeReaderRow>(verses.size + 2)
  if (scopeBanner != null && verses.isNotEmpty()) rows.add(NativeReaderRow.Banner(scopeBanner))
  verses.forEachIndexed { index, verse ->
    if (verse.verseNumber == 1) {
      surahIntros[verse.surahNumber]?.let { rows.add(NativeReaderRow.Intro(it, isLeading = index == 0)) }
    }
    rows.add(NativeReaderRow.Verse(index))
  }
  return rows
}

internal fun ReadableMap.toNativeVerseRange(): NativeVerseRange? {
  val startSurah = getDoubleIfPresent("startSurah")?.toInt() ?: return null
  val startAyah = getDoubleIfPresent("startAyah")?.toInt() ?: return null
  val endSurah = getDoubleIfPresent("endSurah")?.toInt() ?: return null
  val endAyah = getDoubleIfPresent("endAyah")?.toInt() ?: return null
  if (startSurah !in 1..114 || endSurah !in startSurah..114) return null
  if (startAyah <= 0 || endAyah <= 0) return null
  if (startSurah == endSurah && endAyah < startAyah) return null
  return NativeVerseRange(startSurah, startAyah, endSurah, endAyah)
}

internal fun ReadableMap.toNativeScopeBanner(): NativeScopeBanner? {
  val title = getStringIfPresent("title")?.trim().orEmpty()
  if (title.isBlank()) return null
  return NativeScopeBanner(
      title = title,
      subtitle = getStringIfPresent("subtitle")?.trim()?.takeIf { it.isNotBlank() },
  )
}

/** Accepts the legacy single `surahIntro` and the multi-Surah `surahIntros` list. */
internal fun ReadableMap.toNativeSurahIntros(): Map<Int, NativeSurahIntro> {
  val intros = linkedMapOf<Int, NativeSurahIntro>()
  getMapIfPresent("surahIntro")?.toNativeSurahIntro()?.let { intros[it.chapterId] = it }
  val list: ReadableArray = getArrayIfPresent("surahIntros") ?: return intros
  for (index in 0 until list.size()) {
    list.getMap(index)?.toNativeSurahIntro()?.let { intros[it.chapterId] = it }
  }
  return intros
}
