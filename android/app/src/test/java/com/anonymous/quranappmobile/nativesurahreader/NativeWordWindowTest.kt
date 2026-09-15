package com.anonymous.quranappmobile.nativesurahreader

import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

class NativeWordWindowTest {
  @Test
  fun overlaysOnlyWindowVersesAndSharesTheBoundedWordModels() {
    val base = (1..286).map(::verse)
    val windowWords = (1..400).map(::word)
    val merged = mergeNativeWordWindow(base, mapOf("2:143" to windowWords))

    assertEquals(286, merged.size)
    assertEquals(0, merged.first().words.size)
    assertEquals(400, merged[142].words.size)
    assertSame(windowWords, merged[142].words)
    assertEquals(0, merged.last().words.size)
  }

  @Test
  fun anEmptyWindowRestoresTheWordlessBaseModels() {
    val base = (1..3).map(::verse)

    assertSame(base[1], mergeNativeWordWindow(base, emptyMap())[1])
  }

  private fun verse(number: Int) =
      NativeVerse(
          verseKey = "2:$number",
          verseNumber = number,
          verseApiId = number,
          arabicText = "verse-$number",
          words = emptyList(),
          tajweedGlyphRuns = emptyList(),
          translationItems = emptyList(),
      )

  private fun word(number: Int) =
      NativeWord(
          id = number,
          position = number,
          uthmani = "word-$number",
          translationText = null,
          charTypeName = null,
          codeV2 = null,
          pageNumber = null,
      )
}
