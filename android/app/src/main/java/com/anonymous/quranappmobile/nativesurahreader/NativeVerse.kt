package com.anonymous.quranappmobile.nativesurahreader

import com.facebook.react.bridge.ReadableMap

internal data class NativeVerse(
    val verseKey: String,
    val verseNumber: Int,
    val verseApiId: Int?,
    val arabicText: String,
    val words: List<NativeWord>,
    val tajweedGlyphRuns: List<NativeTajweedGlyphRun>,
    val translationItems: List<NativeTranslationItem>,
)

internal data class NativeWord(
    val id: Int,
    val position: Int?,
    val uthmani: String,
    val translationText: String?,
    val charTypeName: String?,
    val codeV2: String?,
    val pageNumber: Int?,
)

internal data class NativeActiveWord(
    val verseKey: String,
    val wordPosition: Int?,
    val wordId: Int?,
)

internal data class NativeTajweedGlyphRun(
    val fontFamily: String,
    val fontFileUri: String,
    val glyphs: List<String>,
)

internal data class NativeTranslationItem(
    val resourceId: Int?,
    val resourceName: String?,
    val text: String,
)

internal data class NativeSurahIntro(
    val chapterId: Int,
    val infoLabel: String,
    val isMakkah: Boolean,
    val showBismillah: Boolean,
    val surahName: String,
)

internal fun NativeVerse.stableId(surahId: Int): Long {
  return verseApiId?.toLong() ?: (surahId * 1000L + verseNumber)
}

internal fun ReadableMap.toNativeSurahIntro(): NativeSurahIntro? {
  val chapterId = getDoubleIfPresent("chapterId")?.toInt() ?: 0
  val surahName = getStringIfPresent("surahName")?.trim().orEmpty()
  val infoLabel = getStringIfPresent("infoLabel")?.trim().orEmpty()
  if (chapterId <= 0 || surahName.isBlank() || infoLabel.isBlank()) return null

  return NativeSurahIntro(
      chapterId = chapterId,
      infoLabel = infoLabel,
      isMakkah = getBooleanIfPresent("isMakkah") ?: false,
      showBismillah = getBooleanIfPresent("showBismillah") ?: false,
      surahName = surahName,
  )
}

internal fun ReadableMap.toNativeActiveWord(): NativeActiveWord? {
  val verseKey = getStringIfPresent("verseKey")?.trim().orEmpty()
  if (verseKey.isBlank()) return null

  val wordPosition = getDoubleIfPresent("wordPosition")?.toInt()?.takeIf { it > 0 }
  val wordId = getDoubleIfPresent("wordId")?.toInt()?.takeIf { it > 0 }
  if (wordPosition == null && wordId == null) return null

  return NativeActiveWord(
      verseKey = verseKey,
      wordPosition = wordPosition,
      wordId = wordId,
  )
}

internal fun ReadableMap.toNativeVerse(): NativeVerse? {
  val verseKey = getStringIfPresent("verseKey")?.trim().orEmpty()
  val verseNumber = getDoubleIfPresent("verseNumber")?.toInt() ?: 0
  if (verseKey.isBlank() || verseNumber <= 0) return null

  val translationItems = mutableListOf<NativeTranslationItem>()
  val incomingTranslationItems = getArrayIfPresent("translationItems")
  if (incomingTranslationItems != null) {
    for (index in 0 until incomingTranslationItems.size()) {
      val item = incomingTranslationItems.getMap(index) ?: continue
      val text = item.getStringIfPresent("text")?.trim().orEmpty()
      if (text.isBlank()) continue
      translationItems.add(
          NativeTranslationItem(
              resourceId = item.getDoubleIfPresent("resourceId")?.toInt(),
              resourceName = item.getStringIfPresent("resourceName")?.trim()?.takeIf { it.isNotBlank() },
              text = text,
          ),
      )
    }
  }

  val words = mutableListOf<NativeWord>()
  val incomingWords = getArrayIfPresent("words")
  if (incomingWords != null) {
    for (index in 0 until incomingWords.size()) {
      val item = incomingWords.getMap(index) ?: continue
      val uthmani = item.getStringIfPresent("uthmani")?.trim().orEmpty()
      if (uthmani.isBlank()) continue
      val charTypeName = item.getStringIfPresent("charTypeName")?.trim()?.takeIf { it.isNotBlank() }
      if (charTypeName == "end") continue

      words.add(
          NativeWord(
              id = item.getDoubleIfPresent("id")?.toInt()?.takeIf { it > 0 } ?: index + 1,
              position = item.getDoubleIfPresent("position")?.toInt()?.takeIf { it > 0 },
              uthmani = uthmani,
              translationText =
                  item.getStringIfPresent("translationText")?.trim()?.takeIf { it.isNotBlank() },
              charTypeName = charTypeName,
              codeV2 = item.getStringIfPresent("codeV2")?.trim()?.takeIf { it.isNotBlank() },
              pageNumber = item.getDoubleIfPresent("pageNumber")?.toInt()?.takeIf { it > 0 },
          ),
      )
    }
  }

  val tajweedGlyphRuns = mutableListOf<NativeTajweedGlyphRun>()
  val incomingTajweedGlyphRuns = getArrayIfPresent("tajweedGlyphRuns")
  if (incomingTajweedGlyphRuns != null) {
    for (index in 0 until incomingTajweedGlyphRuns.size()) {
      val item = incomingTajweedGlyphRuns.getMap(index) ?: continue
      val fontFamily = item.getStringIfPresent("fontFamily")?.trim().orEmpty()
      val fontFileUri = item.getStringIfPresent("fontFileUri")?.trim().orEmpty()
      if (fontFamily.isBlank() || fontFileUri.isBlank()) continue

      val glyphs = mutableListOf<String>()
      val incomingGlyphs = item.getArrayIfPresent("glyphs")
      if (incomingGlyphs != null) {
        for (glyphIndex in 0 until incomingGlyphs.size()) {
          val glyph = incomingGlyphs.getString(glyphIndex)?.trim().orEmpty()
          if (glyph.isNotBlank()) {
            glyphs.add(glyph)
          }
        }
      }
      if (glyphs.isEmpty()) continue

      tajweedGlyphRuns.add(
          NativeTajweedGlyphRun(
              fontFamily = fontFamily,
              fontFileUri = fontFileUri,
              glyphs = glyphs,
          ),
      )
    }
  }

  return NativeVerse(
      verseKey = verseKey,
      verseNumber = verseNumber,
      verseApiId = getDoubleIfPresent("verseApiId")?.toInt(),
      arabicText = getStringIfPresent("arabicText")?.trim().orEmpty(),
      words = words,
      tajweedGlyphRuns = tajweedGlyphRuns,
      translationItems = translationItems,
  )
}
