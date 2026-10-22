package com.anonymous.quranappmobile.nativesurahreader

import org.junit.Assert.assertEquals
import org.junit.Test

class NativeReaderRowsTest {
  private fun verse(key: String): NativeVerse {
    val (_, ayah) = key.split(':').map(String::toInt)
    return NativeVerse(
        verseKey = key, verseNumber = ayah, verseApiId = null, arabicText = "text",
        words = emptyList(), tajweedGlyphRuns = emptyList(), translationItems = emptyList(),
    )
  }

  private fun intro(chapterId: Int) = NativeSurahIntro(
      chapterId = chapterId, infoLabel = "info", isMakkah = true,
      showBismillah = chapterId != 9, surahName = "Surah $chapterId",
  )

  private val intros = (1..114).associateWith(::intro)
  private val banner = NativeScopeBanner("Juz 30", "An-Naba 1 – An-Nas 6")

  private fun describe(rows: List<NativeReaderRow>, verses: List<NativeVerse>) = rows.map { row ->
    when (row) {
      is NativeReaderRow.Banner -> "banner"
      is NativeReaderRow.Intro -> "intro:${row.intro.chapterId}:${if (row.isLeading) "leading" else "inline"}"
      is NativeReaderRow.Verse -> verses[row.verseIndex].verseKey
    }
  }

  @Test
  fun surahReaderKeepsSingleLeadingIntroWithoutBanner() {
    val verses = listOf(verse("2:1"), verse("2:2"))
    val rows = buildNativeReaderRows(verses, mapOf(2 to intro(2)), scopeBanner = null)
    assertEquals(listOf("intro:2:leading", "2:1", "2:2"), describe(rows, verses))
  }

  @Test
  fun passageStartingMidSurahOpensWithBannerAndIntroducesLaterSurahsInline() {
    val verses = listOf(verse("2:286"), verse("3:1"), verse("3:2"))
    val rows = buildNativeReaderRows(verses, intros, banner)
    assertEquals(listOf("banner", "2:286", "intro:3:inline", "3:1", "3:2"), describe(rows, verses))
  }

  @Test
  fun passageStartingAtSurahStartShowsBannerThenLeadingIntro() {
    val verses = listOf(verse("78:1"), verse("78:2"))
    val rows = buildNativeReaderRows(verses, intros, banner)
    assertEquals(listOf("banner", "intro:78:leading", "78:1", "78:2"), describe(rows, verses))
  }

  @Test
  fun emptyPassageHasNoRows() {
    assertEquals(emptyList<NativeReaderRow>(), buildNativeReaderRows(emptyList(), intros, banner))
  }

  @Test
  fun verseStableIdsStayDistinctAcrossSurahs() {
    assertEquals(2286L, verse("2:286").stableId())
    assertEquals(3001L, verse("3:1").stableId())
  }
}
