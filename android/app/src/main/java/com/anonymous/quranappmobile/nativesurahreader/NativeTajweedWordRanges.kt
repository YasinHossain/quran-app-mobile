package com.anonymous.quranappmobile.nativesurahreader

internal data class NativeTajweedWordRange(
    val start: Int,
    val end: Int,
    val wordIndex: Int,
)

internal fun buildNativeTajweedWordRanges(
    glyphs: List<String>,
    wordCount: Int,
): List<NativeTajweedWordRange> {
  if (wordCount <= 0 || glyphs.size != wordCount || glyphs.any { it.isEmpty() }) return emptyList()

  var offset = 0
  return glyphs.mapIndexed { wordIndex, glyph ->
    val start = offset
    offset += glyph.length
    NativeTajweedWordRange(start = start, end = offset, wordIndex = wordIndex)
  }
}
