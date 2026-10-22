package com.anonymous.quranappmobile.nativesurahreader

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeArabicWordSegmenterTest {
  private fun words(verseKey: String, text: String): List<String> =
      buildNativeWordsFromArabicText(verseKey, text).map { it.uthmani }

  @Test
  fun attachesStandalonePauseMarksToThePrecedingWord() {
    assertEquals(
        listOf("ذَٰلِكَ", "ٱلْكِتَـٰبُ", "لَا", "رَيْبَ ۛ", "فِيهِ ۛ", "هُدًى", "لِّلْمُتَّقِينَ"),
        words("2:2", "ذَٰلِكَ ٱلْكِتَـٰبُ لَا رَيْبَ ۛ فِيهِ ۛ هُدًى لِّلْمُتَّقِينَ"),
    )
  }

  @Test
  fun attachesRubElHizbToTheFollowingWord() {
    assertEquals(
        listOf("۞ أَتَأْمُرُونَ", "ٱلنَّاسَ", "بِٱلْبِرِّ"),
        words("2:44", "۞ أَتَأْمُرُونَ ٱلنَّاسَ بِٱلْبِرِّ"),
    )
  }

  @Test
  fun joinsTwoTokenWordsAtQuranComPositions() {
    val verseWords = buildNativeWordsFromArabicText("37:130", "سَلَـٰمٌ عَلَىٰٓ إِلْ يَاسِينَ")

    assertEquals(listOf("سَلَـٰمٌ", "عَلَىٰٓ", "إِلْ يَاسِينَ"), verseWords.map { it.uthmani })
    assertEquals(listOf(1, 2, 3), verseWords.map { it.position })
  }

  @Test
  fun rejectsTextThatCannotBeSegmented() {
    assertTrue(segmentNativeArabicWords("1:1", "ۖ بِسْمِ").isEmpty())
    assertTrue(segmentNativeArabicWords("1:1", "بِسْمِ ۞").isEmpty())
    assertTrue(segmentNativeArabicWords("37:130", "سَلَـٰمٌ").isEmpty())
  }
}
