package com.anonymous.quranappmobile.nativesurahreader

internal data class NativeArabicWordRange(
    val start: Int,
    val end: Int,
)

private const val RUB_EL_HIZB = '۞'

// Quran.com counts these two-token spellings (بَعْدَ مَا, إِلْ يَاسِينَ) as one word, so verse text
// alone cannot place them. Values are the index of the first token after pause marks are merged.
private val JOINED_TOKEN_WORDS = mapOf(
    "2:181" to 2,
    "8:6" to 3,
    "13:37" to 7,
    "37:130" to 2,
)

/**
 * Splits a verse's Uthmani text at the Quran.com word positions that word packs, audio timings and
 * Word Study use, so plain verse text stays word-addressable before any word-by-word pack is
 * installed. Verse text puts pause marks between spaces, but they belong to the preceding word; the
 * rub el hizb belongs to the following word. Returns no ranges when the text cannot be segmented.
 */
internal fun segmentNativeArabicWords(verseKey: String, text: String): List<NativeArabicWordRange> {
  val ranges = mutableListOf<NativeArabicWordRange>()
  var pendingStart: Int? = null
  var index = 0
  while (index < text.length) {
    while (index < text.length && text[index].isWhitespace()) index++
    if (index >= text.length) break
    val start = index
    while (index < text.length && !text[index].isWhitespace()) index++
    val end = index

    if (end - start == 1 && text[start] == RUB_EL_HIZB) {
      if (pendingStart != null) return emptyList()
      pendingStart = start
    } else if (isPauseMarkToken(text, start, end)) {
      if (ranges.isEmpty() || pendingStart != null) return emptyList()
      ranges[ranges.lastIndex] = ranges.last().copy(end = end)
    } else {
      ranges.add(NativeArabicWordRange(pendingStart ?: start, end))
      pendingStart = null
    }
  }
  if (pendingStart != null) return emptyList()

  val joinedIndex = JOINED_TOKEN_WORDS[verseKey] ?: return ranges
  if (joinedIndex + 1 >= ranges.size) return emptyList()
  ranges[joinedIndex] = ranges[joinedIndex].copy(end = ranges[joinedIndex + 1].end)
  ranges.removeAt(joinedIndex + 1)
  return ranges
}

/** Words for verse text without a word-by-word pack: no translations or mushaf glyphs. */
internal fun buildNativeWordsFromArabicText(verseKey: String, text: String): List<NativeWord> {
  return segmentNativeArabicWords(verseKey, text).mapIndexed { index, range ->
    NativeWord(
        id = index + 1,
        position = index + 1,
        uthmani = text.substring(range.start, range.end),
        translationText = null,
        charTypeName = null,
        codeV2 = null,
        pageNumber = null,
    )
  }
}

private fun isPauseMarkToken(text: String, start: Int, end: Int): Boolean {
  for (index in start until end) {
    val char = text[index]
    if (char !in 'ۖ'..'ۜ' && char != '۩') return false
  }
  return true
}
