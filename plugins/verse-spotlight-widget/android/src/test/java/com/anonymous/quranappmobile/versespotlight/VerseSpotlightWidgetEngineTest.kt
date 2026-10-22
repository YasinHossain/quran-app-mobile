package com.anonymous.quranappmobile.versespotlight

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private class MemoryStatePersistence : WidgetStatePersistence {
  val values = mutableMapOf<Int, WidgetSpotlightState>()

  override fun read(widgetId: Int): WidgetSpotlightState? = values[widgetId]

  override fun write(widgetId: Int, state: WidgetSpotlightState) {
    values[widgetId] = state
  }

  override fun remove(widgetId: Int) {
    values.remove(widgetId)
  }
}

class VerseSpotlightWidgetEngineTest {
  private val index =
      SpotlightIndex(
          verseKeys = listOf("1:1", "1:7", "2:1", "2:2", "114:6"),
          chapters =
              listOf(
                  SpotlightChapter(1, "Al-Fatihah", "الفاتحة", 7, 0),
                  SpotlightChapter(2, "Al-Baqarah", "البقرة", 2, 2),
                  SpotlightChapter(114, "An-Nas", "الناس", 6, 4),
              ),
          poolKeys = listOf("1:1", "2:2", "114:6"),
          poolVersion = "test.v1",
      )

  @Test
  fun canonicalBoundariesClampAndCrossSurahs() {
    assertNull(index.previous("1:1"))
    assertEquals("2:1", index.next("1:7"))
    assertEquals("1:7", index.previous("2:1"))
    assertNull(index.next("114:6"))
  }

  @Test
  fun shuffleDoesNotImmediatelyRepeatWhenAlternativesExist() {
    val selected = index.randomAnchor("2:2") { 1 }
    assertNotEquals("2:2", selected)
    assertTrue(index.poolKeys.contains(selected))
  }

  @Test
  fun obsoleteAndInvalidStateMigratesToValidCurrentContract() {
    val obsolete =
        WidgetSpotlightState(
            schemaVersion = 0,
            surface = SPOTLIGHT_SURFACE,
            verseKey = "not-a-verse",
            selectedAt = -1,
            requestedTranslationId = 999,
            effectiveTranslationId = 999,
            poolVersion = "old",
        )

    val normalized = normalizeWidgetState(obsolete, index, 131, 500L) { 0 }
    assertEquals(SPOTLIGHT_SCHEMA_VERSION, normalized.schemaVersion)
    assertEquals(SPOTLIGHT_SURFACE, normalized.surface)
    assertEquals("1:1", normalized.verseKey)
    assertEquals(131, normalized.requestedTranslationId)
    assertEquals(BUNDLED_SAHIH_ID, normalized.effectiveTranslationId)
    assertEquals("test.v1", normalized.poolVersion)
    assertNull(normalized.nextRandomAt)
  }

  @Test
  fun widgetInstancesPersistAndNavigateIndependently() {
    val persistence = MemoryStatePersistence()
    val manager = WidgetStateManager(persistence, index, now = { 1000L }, nextInt = { 0 })

    manager.load(7, 20)
    manager.load(8, 20)
    manager.navigate(7, 20, VerseSpotlightWidgetProvider.ACTION_NEXT)

    assertNotEquals(persistence.values[7]?.verseKey, persistence.values[8]?.verseKey)
    manager.remove(7)
    assertFalse(persistence.values.containsKey(7))
    assertTrue(persistence.values.containsKey(8))
  }

  @Test
  fun selectedTranslationWinsOnlyForMatchingCompleteCacheRow() {
    val fallback = SpotlightFallbackVerse("2:2", "Arabic", "Sahih")
    val selected =
        WidgetContentSnapshot(
            requestedTranslationId = 131,
            cachedTranslation =
                CachedTranslation(
                    translationId = 131,
                    textByVerseKey = mapOf("2:2" to "Installed translation"),
                ),
        )
    val installed = resolveWidgetContent("2:2", selected, fallback)
    assertEquals(131, installed.effectiveTranslationId)
    assertEquals("Installed translation", installed.displayText)
    assertFalse(installed.isArabicOnly)

    val missingRow =
        resolveWidgetContent(
            "1:1",
            selected,
            SpotlightFallbackVerse("1:1", "Arabic", "Fallback"),
        )
    assertEquals(BUNDLED_SAHIH_ID, missingRow.effectiveTranslationId)
    assertEquals("Fallback", missingRow.displayText)
    assertFalse(missingRow.isArabicOnly)
  }

  @Test
  fun mismatchedCacheNeverMixesTranslationSources() {
    val content =
        resolveWidgetContent(
            "2:2",
            WidgetContentSnapshot(
                requestedTranslationId = 131,
                cachedTranslation =
                    CachedTranslation(
                        translationId = 85,
                        textByVerseKey = mapOf("2:2" to "Wrong translation"),
                    ),
            ),
            SpotlightFallbackVerse("2:2", "Arabic", "Sahih"),
        )
    assertEquals(BUNDLED_SAHIH_ID, content.effectiveTranslationId)
    assertEquals("Sahih", content.displayText)
    assertFalse(content.isArabicOnly)
  }

  @Test
  fun noTranslationSelectionShowsArabicOnly() {
    val content =
        resolveWidgetContent(
            "2:2",
            WidgetContentSnapshot(
                requestedTranslationId = BUNDLED_SAHIH_ID,
                translationSelected = false,
            ),
            SpotlightFallbackVerse("2:2", "Arabic only", "Translation hidden"),
        )

    assertEquals("Arabic only", content.displayText)
    assertTrue(content.isArabicOnly)
  }
}
