package com.anonymous.quranappmobile.nativesurahreader

import android.util.JsonReader
import android.util.JsonToken
import java.io.File
import java.io.IOException

internal data class NativeTajweedPageSpan(
    val pageNumber: Int,
    val firstVerseKey: String,
    val lastVerseKey: String,
)

/**
 * Reads word glyphs from an installed QCF Tajweed mushaf pack so Tajweed verse text renders without
 * a word-by-word pack. The installer stores the pack as a page lookup plus one JSON file per page;
 * only the pages overlapping the requested verses are read.
 */
internal class NativeTajweedPackReader(private val versionDirectory: File) {
  /** Words by verse key in position order, or an empty map when the page data is unreadable. */
  fun readWords(range: NativeVerseRange): Map<String, List<NativeWord>> {
    return try {
      val layout = readPageLayout() ?: return emptyMap()
      val pagesDirectory = File(versionDirectory, layout.pagesDirectory)
      val words = mutableMapOf<String, List<NativeWord>>()
      for (pageNumber in selectNativeTajweedPages(readLookup(layout.lookupFile), range)) {
        readPage(File(pagesDirectory, "$pageNumber.json"), words)
      }
      words
    } catch (_: IOException) {
      emptyMap()
    } catch (_: RuntimeException) {
      emptyMap()
    }
  }

  private data class PageLayout(val lookupFile: String, val pagesDirectory: String)

  private fun readPageLayout(): PageLayout? {
    var layout: PageLayout? = null
    read(File(versionDirectory, "manifest.json")) { reader ->
      reader.forEachField { name ->
        if (name != "localPayload") return@forEachField reader.skipValue()
        var format: String? = null
        var lookupFile: String? = null
        var pagesDirectory: String? = null
        reader.forEachField { field ->
          when (field) {
            "format" -> format = reader.nextStringOrNull()
            "lookupFile" -> lookupFile = reader.nextStringOrNull()
            "pagesDirectory" -> pagesDirectory = reader.nextStringOrNull()
            else -> reader.skipValue()
          }
        }
        if (format == PAGE_JSON_FORMAT && !lookupFile.isNullOrBlank() && !pagesDirectory.isNullOrBlank()) {
          layout = PageLayout(lookupFile!!, pagesDirectory!!)
        }
      }
    }
    return layout
  }

  private fun readLookup(lookupFile: String): List<NativeTajweedPageSpan> {
    val spans = mutableListOf<NativeTajweedPageSpan>()
    read(File(versionDirectory, lookupFile)) { reader ->
      reader.forEachField { name ->
        if (name != "lookup") return@forEachField reader.skipValue()
        reader.forEachField { page ->
          var first: String? = null
          var last: String? = null
          reader.forEachField { field ->
            when (field) {
              "firstVerseKey" -> first = reader.nextStringOrNull()
              "lastVerseKey" -> last = reader.nextStringOrNull()
              else -> reader.skipValue()
            }
          }
          val pageNumber = page.toIntOrNull()?.takeIf { it > 0 }
          if (pageNumber != null && first != null && last != null) {
            spans.add(NativeTajweedPageSpan(pageNumber, first!!, last!!))
          }
        }
      }
    }
    return spans
  }

  private fun readPage(file: File, into: MutableMap<String, List<NativeWord>>) {
    read(file) { reader ->
      reader.forEachField { name ->
        if (name != "verses") return@forEachField reader.skipValue()
        reader.beginArray()
        while (reader.hasNext()) {
          var verseKey: String? = null
          var words: List<NativeWord>? = null
          reader.forEachField { field ->
            when (field) {
              "verseKey" -> verseKey = reader.nextStringOrNull()?.trim()
              "words" -> words = readWords(reader)
              else -> reader.skipValue()
            }
          }
          val key = verseKey?.takeIf { it.isNotEmpty() } ?: continue
          val verseWords = words?.sortedBy { it.position } ?: continue
          if (verseWords.map { it.position } == (1..verseWords.size).toList()) {
            into[key] = verseWords
          }
        }
        reader.endArray()
      }
    }
  }

  /** Returns null when any word lacks the text, position, glyph or page needed to render it. */
  private fun readWords(reader: JsonReader): List<NativeWord>? {
    val words = mutableListOf<NativeWord>()
    var isComplete = true
    reader.beginArray()
    while (reader.hasNext()) {
      var id: Int? = null
      var position: Int? = null
      var uthmani: String? = null
      var charType: String? = null
      var codeV2: String? = null
      var pageNumber: Int? = null
      reader.forEachField { field ->
        when (field) {
          "id" -> id = reader.nextPositiveIntOrNull()
          "position" -> position = reader.nextPositiveIntOrNull()
          "textUthmani" -> uthmani = reader.nextStringOrNull()?.trim()
          "charType" -> charType = reader.nextStringOrNull()?.trim()
          "codeV2" -> codeV2 = reader.nextStringOrNull()?.trim()
          "pageNumber" -> pageNumber = reader.nextPositiveIntOrNull()
          else -> reader.skipValue()
        }
      }
      val wordPosition = position
      if (wordPosition == null ||
          uthmani.isNullOrEmpty() ||
          codeV2.isNullOrEmpty() ||
          pageNumber == null) {
        isComplete = false
        continue
      }
      words.add(
          NativeWord(
              id = id ?: wordPosition,
              position = wordPosition,
              uthmani = uthmani!!,
              translationText = null,
              charTypeName = charType?.takeIf { it.isNotEmpty() },
              codeV2 = codeV2,
              pageNumber = pageNumber,
          ),
      )
    }
    reader.endArray()
    return words.takeIf { isComplete && it.isNotEmpty() }
  }

  private inline fun read(file: File, block: (JsonReader) -> Unit) {
    JsonReader(file.bufferedReader()).use(block)
  }

  private inline fun JsonReader.forEachField(block: (String) -> Unit) {
    beginObject()
    while (hasNext()) block(nextName())
    endObject()
  }

  private fun JsonReader.nextStringOrNull(): String? =
      if (peek() == JsonToken.STRING) nextString() else null.also { skipValue() }

  private fun JsonReader.nextPositiveIntOrNull(): Int? =
      if (peek() == JsonToken.NUMBER) nextInt().takeIf { it > 0 } else null.also { skipValue() }

  companion object {
    private const val PAGE_JSON_FORMAT = "page-json-v1"
  }
}

/** Pages whose verses overlap [range], in page order. */
internal fun selectNativeTajweedPages(
    spans: List<NativeTajweedPageSpan>,
    range: NativeVerseRange,
): List<Int> {
  val start = verseOrdinal(range.startSurah, range.startAyah)
  val end = verseOrdinal(range.endSurah, range.endAyah)
  return spans
      .filter { span ->
        val first = verseOrdinal(span.firstVerseKey) ?: return@filter false
        val last = verseOrdinal(span.lastVerseKey) ?: return@filter false
        first <= end && last >= start
      }
      .map { it.pageNumber }
      .distinct()
      .sorted()
}

/**
 * Puts the Tajweed pack's glyphs on [words] by position while keeping their text and translations.
 * Returns [words] unchanged unless the pack has exactly the same word positions.
 */
internal fun withNativeTajweedGlyphs(
    words: List<NativeWord>,
    tajweedWords: List<NativeWord>,
): List<NativeWord> {
  if (tajweedWords.isEmpty() || words.size != tajweedWords.size) return words
  val byPosition = tajweedWords.associateBy { it.position }
  if (byPosition.size != tajweedWords.size || words.any { it.position !in byPosition }) return words
  return words.map { word ->
    val tajweedWord = byPosition.getValue(word.position)
    word.copy(codeV2 = tajweedWord.codeV2, pageNumber = tajweedWord.pageNumber)
  }
}

private const val MAX_AYAH = 999

private fun verseOrdinal(surah: Int, ayah: Int): Long =
    surah.toLong() * (MAX_AYAH + 1) + ayah.coerceIn(0, MAX_AYAH)

private fun verseOrdinal(verseKey: String): Long? {
  val surah = verseKey.substringBefore(':').trim().toIntOrNull() ?: return null
  val ayah = verseKey.substringAfter(':', "").trim().toIntOrNull() ?: return null
  return verseOrdinal(surah, ayah)
}
