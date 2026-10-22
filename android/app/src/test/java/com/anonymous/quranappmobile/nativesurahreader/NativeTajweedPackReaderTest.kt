package com.anonymous.quranappmobile.nativesurahreader

import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

class NativeTajweedPackReaderTest {
  private val spans =
      listOf(
          NativeTajweedPageSpan(1, "1:1", "1:7"),
          NativeTajweedPageSpan(2, "2:1", "2:5"),
          NativeTajweedPageSpan(3, "2:6", "2:16"),
          NativeTajweedPageSpan(49, "2:283", "3:9"),
          NativeTajweedPageSpan(50, "3:10", "3:15"),
      )

  private fun word(position: Int, codeV2: String? = null, pageNumber: Int? = null, translation: String? = null) =
      NativeWord(
          id = position,
          position = position,
          uthmani = "w$position",
          translationText = translation,
          charTypeName = "word",
          codeV2 = codeV2,
          pageNumber = pageNumber,
      )

  @Test
  fun selectsEveryPageOfAnOpenEndedSurah() {
    assertEquals(listOf(2, 3, 49), selectNativeTajweedPages(spans, NativeVerseRange.forSurah(2)))
  }

  @Test
  fun selectsPagesSharedWithTheNeighbouringSurah() {
    assertEquals(listOf(49, 50), selectNativeTajweedPages(spans, NativeVerseRange.forSurah(3)))
    assertEquals(listOf(3), selectNativeTajweedPages(spans, NativeVerseRange(2, 10, 2, 12)))
  }

  @Test
  fun copiesTajweedGlyphsOntoWordsByPosition() {
    val words = listOf(word(2, translation = "two"), word(1, translation = "one"))
    val tajweed = listOf(word(1, "A", 120), word(2, "B", 121))

    val merged = withNativeTajweedGlyphs(words, tajweed)

    assertEquals(listOf("two" to "B", "one" to "A"), merged.map { it.translationText to it.codeV2 })
    assertEquals(listOf(121, 120), merged.map { it.pageNumber })
  }

  @Test
  fun keepsWordsWhenTajweedPositionsDoNotMatch() {
    val words = listOf(word(1, "x", 1), word(2, "y", 1))

    assertSame(words, withNativeTajweedGlyphs(words, listOf(word(1, "A", 1))))
    assertSame(words, withNativeTajweedGlyphs(words, listOf(word(1, "A", 1), word(3, "C", 1))))
    assertSame(words, withNativeTajweedGlyphs(words, emptyList()))
  }
}
