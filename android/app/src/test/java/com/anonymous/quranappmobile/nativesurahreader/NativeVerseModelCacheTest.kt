package com.anonymous.quranappmobile.nativesurahreader

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Test

class NativeVerseModelCacheTest {
  private val settings = NativeReaderSettings(
      arabicFontFace = "uthmani", arabicFontSize = 28f, contentLanguage = "en",
      translationFontSize = 16f, translationIds = listOf(20), displayMode = "plain",
      showByWords = false, tajweed = false, audioWordSyncEnabled = true,
      showTranslationAttribution = true, wordLang = "en",
  )
  private val theme = NativeReaderTheme(1, 2, 3, 4, 5, 6)
  private val key = NativeVerseModelKey(2, "session:1", settings, theme)
  private val verse = NativeVerse(
      verseKey = "2:1", verseNumber = 1, verseApiId = 8, arabicText = "الم",
      words = listOf(NativeWord(1, 1, "الم", "Alif Lam Mim", "word", null, 2)),
      tajweedGlyphRuns = emptyList(),
      translationItems = listOf(NativeTranslationItem(20, "Translation", "Alif Lam Mim")),
  )

  @Test
  fun unchangedContentReusesParsedObjectsWithoutInvokingParser() {
    val cache = NativeVerseModelCache()
    val first = cache.resolve(key) { listOf(verse) }
    repeat(22) {
      val next = cache.resolve(key.copy()) { error("Unchanged content was reparsed") }
      assertSame(first, next)
      assertSame(verse, next.verses.single())
      assertSame(verse.words.single(), next.verses.single().words.single())
      assertEquals(first.verses.hashCode(), next.contentHash)
    }
  }

  @Test
  fun contentRevisionReplacesTranslationsWordsAndGlyphsWithoutChangingVerseAddress() {
    val cache = NativeVerseModelCache()
    cache.resolve(key) { listOf(verse) }
    val changed = verse.copy(
        translationItems = listOf(NativeTranslationItem(131, "New attribution", "New text")),
        words = listOf(verse.words.single().copy(translationText = "New word language")),
        tajweedGlyphRuns = listOf(NativeTajweedGlyphRun("page2", "file:///page2.ttf", listOf("glyph"))),
    )
    val next = cache.resolve(key.copy(revision = "session:2")) { listOf(changed) }
    assertEquals(listOf(changed), next.verses)
    assertEquals(changed.verseKey, next.verses.single().verseKey)
  }

  @Test
  fun settingsAndThemeChangesCannotReuseAnOldModel() {
    val variants = listOf(
        key.copy(settings = settings.copy(arabicFontFace = "indopak")),
        key.copy(settings = settings.copy(arabicFontSize = 36f)),
        key.copy(settings = settings.copy(contentLanguage = "bn")),
        key.copy(settings = settings.copy(translationFontSize = 20f)),
        key.copy(settings = settings.copy(translationIds = listOf(131))),
        key.copy(settings = settings.copy(displayMode = "wordByWord", showByWords = true)),
        key.copy(settings = settings.copy(displayMode = "tajweed", tajweed = true)),
        key.copy(settings = settings.copy(audioWordSyncEnabled = false)),
        key.copy(settings = settings.copy(showTranslationAttribution = false)),
        key.copy(settings = settings.copy(wordLang = "bn")),
        key.copy(theme = theme.copy(backgroundColor = 7, textColor = 8)),
    )
    variants.forEach { changed ->
      val cache = NativeVerseModelCache()
      val first = cache.resolve(key) { listOf(verse) }
      var parses = 0
      val next = cache.resolve(changed) { parses++; listOf(verse) }
      assertEquals(1, parses)
      assertNotSame(first, next)
      assertSame(next, cache.resolve(changed) { error("Changed configuration was not cached") })
    }
  }

  @Test
  fun anotherSurahCannotReuseThePreviousSurahEvenWithTheSameRevision() {
    val cache = NativeVerseModelCache()
    cache.resolve(key) { listOf(verse) }
    val other = verse.copy(verseKey = "108:1", verseApiId = 6205)
    val next = cache.resolve(key.copy(surahId = 108)) { listOf(other) }
    assertEquals("108:1", next.verses.single().verseKey)
  }

  @Test
  fun missingRevisionAlwaysParsesAndInvalidatesPreviousCache() {
    val cache = NativeVerseModelCache()
    cache.resolve(key) { listOf(verse) }
    var parses = 0
    repeat(2) { cache.resolve(null) { parses++; listOf(verse) } }
    cache.resolve(key) { parses++; listOf(verse) }
    assertEquals(3, parses)
  }

  @Test
  fun legacyVerseReplacementInvalidatesTheSnapshot() {
    val cache = NativeVerseModelCache()
    val first = cache.resolve(key) { listOf(verse) }
    cache.clear()
    val next = cache.resolve(key) { listOf(verse.copy(arabicText = "updated")) }
    assertNotSame(first, next)
    assertEquals("updated", next.verses.single().arabicText)
  }

  @Test
  fun emptyThenLoadedContentDoesNotRemainStuckOnEmptySnapshot() {
    val cache = NativeVerseModelCache()
    assertEquals(0, cache.resolve(key) { emptyList() }.verses.size)
    assertEquals(1, cache.resolve(key.copy(revision = "session:2")) { listOf(verse) }.verses.size)
  }

  @Test
  fun onlyLatestSnapshotIsCachedAndFailedParseDoesNotReplaceIt() {
    val cache = NativeVerseModelCache()
    val first = cache.resolve(key) { listOf(verse) }
    val changed = key.copy(revision = "session:2")
    assertThrows(IllegalStateException::class.java) {
      cache.resolve(changed) { throw IllegalStateException("unavailable payload") }
    }
    assertSame(first, cache.resolve(key) { error("Previous snapshot was lost") })
    cache.resolve(changed) { listOf(verse) }
    assertNotSame(first, cache.resolve(key) { listOf(verse) })
  }
}
