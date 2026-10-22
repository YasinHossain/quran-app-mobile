package com.anonymous.quranappmobile.nativesurahreader

internal fun missingTranslationIds(verses: List<NativeVerse>, selectedIds: List<Int>): List<Int> =
    selectedIds.filter { id -> verses.isEmpty() || verses.any { verse ->
      verse.translationItems.none { it.resourceId == id && it.text.isNotBlank() }
    } }

/** Merge by verse address and selected resource, never by response position. */
internal fun mergeRecoveredTranslations(
    verses: List<NativeVerse>,
    selectedIds: List<Int>,
    recovered: Map<String, List<NativeTranslationItem>>,
): List<NativeVerse> = verses.map { verse ->
  val incoming = recovered[verse.verseKey].orEmpty().filter {
    it.resourceId in selectedIds && it.text.isNotBlank()
  }
  if (incoming.isEmpty()) verse
  else {
    val byId = (verse.translationItems + incoming).associateBy { it.resourceId }
    val items = selectedIds.mapNotNull { byId[it] }
    if (items == verse.translationItems) verse else verse.copy(translationItems = items)
  }
}
