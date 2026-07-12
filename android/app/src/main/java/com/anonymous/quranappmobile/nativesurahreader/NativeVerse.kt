package com.anonymous.quranappmobile.nativesurahreader

import com.facebook.react.bridge.ReadableMap

internal data class NativeVerse(
    val verseKey: String,
    val verseNumber: Int,
    val verseApiId: Int?,
    val arabicText: String,
    val translationItems: List<NativeTranslationItem>,
)

internal data class NativeTranslationItem(
    val resourceId: Int?,
    val resourceName: String?,
    val text: String,
)

internal fun NativeVerse.stableId(surahId: Int): Long {
  return verseApiId?.toLong() ?: (surahId * 1000L + verseNumber)
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

  return NativeVerse(
      verseKey = verseKey,
      verseNumber = verseNumber,
      verseApiId = getDoubleIfPresent("verseApiId")?.toInt(),
      arabicText = getStringIfPresent("arabicText")?.trim().orEmpty(),
      translationItems = translationItems,
  )
}
