package com.anonymous.quranappmobile.nativesurahreader

import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import java.io.File
import org.json.JSONArray
import org.json.JSONObject

internal data class NativeSurahLoadRequest(
    val verseRange: NativeVerseRange,
    val expectedVerseCount: Int,
    val translationIds: List<Int>,
    val translationNames: Map<Int, String>,
    val wordLang: String,
    val requireWordTranslations: Boolean,
)

internal sealed class NativeSurahLoadResult {
  data class Success(val verses: List<NativeVerse>, val missingTranslationIds: List<Int>) : NativeSurahLoadResult()

  data class Failure(
      val code: String,
      val message: String,
  ) : NativeSurahLoadResult()
}

/** Reads the Expo SQLite app database without involving JS or the React Native bridge. */
internal class NativeSurahReaderRepository(private val context: Context) {
  fun load(request: NativeSurahLoadRequest): NativeSurahLoadResult {
    val databaseFile = File(File(context.filesDir, "SQLite"), APP_DATABASE_NAME)
    if (!databaseFile.isFile) {
      return NativeSurahLoadResult.Failure(
          code = "database_unavailable",
          message = "The offline Quran database is not ready yet.",
      )
    }

    val database =
        try {
          SQLiteDatabase.openDatabase(databaseFile.absolutePath, null, SQLiteDatabase.OPEN_READONLY)
        } catch (_: RuntimeException) {
          return NativeSurahLoadResult.Failure(
              code = "database_unavailable",
              message = "The offline Quran database could not be opened.",
          )
        }

    return try {
      loadFromDatabase(database, request)
    } catch (_: RuntimeException) {
      NativeSurahLoadResult.Failure(
          code = "database_read_failed",
          message = "The offline Quran data could not be read.",
      )
    } finally {
      database.close()
    }
  }

  private fun loadFromDatabase(
      database: SQLiteDatabase,
      request: NativeSurahLoadRequest,
  ): NativeSurahLoadResult {
    val translationIds = request.translationIds.distinct().filter { it > 0 }
    val arguments = mutableListOf(request.wordLang)
    arguments.addAll(translationIds.map(Int::toString))
    val range = request.verseRange
    arguments.addAll(
        listOf(
                range.startSurah,
                range.endSurah,
                range.startSurah,
                range.startSurah,
                range.startAyah,
                range.endSurah,
                range.endSurah,
                range.endAyah,
            )
            .map(Int::toString),
    )

    val translationJoin =
        if (translationIds.isEmpty()) {
          ""
        } else {
          val placeholders = translationIds.joinToString(",") { "?" }
          """
          LEFT JOIN offline_translations t
            ON t.verse_key = v.verse_key
            AND t.translation_id IN ($placeholders)
          """.trimIndent()
        }
    val translationColumns =
        if (translationIds.isEmpty()) {
          "NULL AS translation_id, NULL AS translation_text"
        } else {
          "t.translation_id AS translation_id, t.text AS translation_text"
        }

    val cursor =
        database.rawQuery(
            """
            SELECT
              v.verse_key AS verse_key,
              v.surah AS surah,
              v.ayah AS ayah,
              v.arabic_uthmani AS arabic_uthmani,
              wt.words_json AS words_json,
              $translationColumns
            FROM offline_verses v
            LEFT JOIN offline_word_translations wt
              ON wt.verse_key = v.verse_key
              AND wt.language_code = ?
            $translationJoin
            WHERE v.surah BETWEEN ? AND ?
              AND (v.surah > ? OR (v.surah = ? AND v.ayah >= ?))
              AND (v.surah < ? OR (v.surah = ? AND v.ayah <= ?))
            ORDER BY v.surah ASC, v.ayah ASC, translation_id ASC;
            """.trimIndent(),
            arguments.toTypedArray(),
        )

    cursor.use {
      val builders = linkedMapOf<String, VerseBuilder>()
      val verseKeyColumn = it.getColumnIndexOrThrow("verse_key")
      val surahColumn = it.getColumnIndexOrThrow("surah")
      val ayahColumn = it.getColumnIndexOrThrow("ayah")
      val arabicColumn = it.getColumnIndexOrThrow("arabic_uthmani")
      val wordsColumn = it.getColumnIndexOrThrow("words_json")
      val translationIdColumn = it.getColumnIndexOrThrow("translation_id")
      val translationTextColumn = it.getColumnIndexOrThrow("translation_text")

      while (it.moveToNext()) {
        val verseKey = it.getString(verseKeyColumn)?.trim().orEmpty()
        val surahNumber = it.getInt(surahColumn)
        val verseNumber = it.getInt(ayahColumn)
        if (verseKey.isBlank() || surahNumber <= 0 || verseNumber <= 0) continue

        val builder =
            builders.getOrPut(verseKey) {
              VerseBuilder(
                  verseKey = verseKey,
                  surahNumber = surahNumber,
                  verseNumber = verseNumber,
                  arabicText = it.getString(arabicColumn)?.trim().orEmpty(),
                  wordsJson = it.stringOrNull(wordsColumn),
              )
            }
        if (!it.isNull(translationIdColumn) && !it.isNull(translationTextColumn)) {
          val translationId = it.getInt(translationIdColumn)
          val text = it.getString(translationTextColumn)?.trim().orEmpty()
          if (translationId > 0 && text.isNotBlank()) {
            builder.translations[translationId] = text
          }
        }
      }

      if (builders.isEmpty()) {
        return NativeSurahLoadResult.Failure(
            code = "surah_not_downloaded",
            message = "These verses are not available in the offline database.",
        )
      }
      if (request.expectedVerseCount > 0 && builders.size != request.expectedVerseCount) {
        return NativeSurahLoadResult.Failure(
            code = "incomplete_surah",
            message = "The offline Quran data is incomplete.",
        )
      }

      val tajweedVersion = findActiveTajweedVersion(database)
      val verses = mutableListOf<NativeVerse>()
      for (builder in builders.values) {
        if (builder.arabicText.isBlank()) {
          return NativeSurahLoadResult.Failure(
              code = "incomplete_surah",
              message = "The offline Quran text is incomplete.",
          )
        }


        // The word language is only a preference until its pack is installed. Plain rows render
        // the full Arabic text without word data, so only word-by-word reading requires the pack.
        val words = parseWords(builder.wordsJson, request.requireWordTranslations)
        if (words.isEmpty() && request.requireWordTranslations) {
          return NativeSurahLoadResult.Failure(
              code = "words_not_downloaded",
              message = "The selected word-by-word language is not downloaded for these verses.",
          )
        }

        verses.add(
            NativeVerse(
                verseKey = builder.verseKey,
                verseNumber = builder.verseNumber,
                surahNumber = builder.surahNumber,
                verseApiId = null,
                arabicText = builder.arabicText,
                words = words,
                tajweedGlyphRuns = buildTajweedGlyphRuns(words, tajweedVersion),
                translationItems =
                    translationIds.mapNotNull { translationId ->
                      val text = builder.translations[translationId] ?: return@mapNotNull null
                      NativeTranslationItem(
                          resourceId = translationId,
                          resourceName = request.translationNames[translationId],
                          text = text,
                      )
                    },
            ),
        )
      }

      return NativeSurahLoadResult.Success(
          verses,
          missingTranslationIds(verses, translationIds),
      )
    }
  }

  private fun parseWords(wordsJson: String?, requireTranslations: Boolean): List<NativeWord> {
    if (wordsJson.isNullOrBlank()) return emptyList()
    val array = tryOrNull { JSONArray(wordsJson) } ?: return emptyList()
    val words = mutableListOf<NativeWord>()
    for (index in 0 until array.length()) {
      val item = array.optJSONObject(index) ?: return emptyList()
      val uthmani = item.optNonBlankString("uthmani") ?: return emptyList()
      val charTypeName = item.optNonBlankString("charTypeName")
      val translationText = item.optNonBlankString("translationText")
      if (requireTranslations && charTypeName != "end" && translationText == null) {
        return emptyList()
      }
      words.add(
          NativeWord(
              id = item.optPositiveInt("id") ?: index + 1,
              position = item.optPositiveInt("position") ?: index + 1,
              uthmani = uthmani,
              translationText = translationText,
              charTypeName = charTypeName,
              codeV2 = item.optNonBlankString("codeV2"),
              pageNumber = item.optPositiveInt("pageNumber"),
          ),
      )
    }
    val positions = words.mapNotNull { it.position }.sorted()
    if (positions != (1..words.size).toList()) return emptyList()
    return words
  }

  private fun findActiveTajweedVersion(database: SQLiteDatabase): String? {
    return try {
      database
          .rawQuery(
              """
              SELECT version
              FROM mushaf_pack_installs
              WHERE pack_id = ? AND is_active = 1
              LIMIT 1;
              """.trimIndent(),
              arrayOf(TAJWEED_PACK_ID),
          )
          .use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0)?.trim()?.takeIf { it.isNotBlank() } else null
          }
    } catch (_: RuntimeException) {
      null
    }
  }

  private fun buildTajweedGlyphRuns(
      words: List<NativeWord>,
      version: String?,
  ): List<NativeTajweedGlyphRun> {
    if (version.isNullOrBlank()) return emptyList()
    val runs = mutableListOf<NativeTajweedGlyphRun>()
    var currentPage: Int? = null
    var currentGlyphs = mutableListOf<String>()

    fun commitRun() {
      val page = currentPage ?: return
      if (currentGlyphs.isEmpty()) return
      val fontFile =
          File(
              File(File(File(File(context.filesDir, "mushaf-packs"), TAJWEED_PACK_ID), version), "fonts"),
              "p$page.ttf",
          )
      if (fontFile.isFile) {
        runs.add(
            NativeTajweedGlyphRun(
                fontFamily = "p$page-v4",
                fontFileUri = fontFile.absolutePath,
                glyphs = currentGlyphs.toList(),
            ),
        )
      }
    }

    words.sortedBy { it.position ?: Int.MAX_VALUE }.forEach { word ->
      val glyph = word.codeV2?.trim()?.takeIf { it.isNotEmpty() } ?: return@forEach
      val page = word.pageNumber?.takeIf { it > 0 } ?: return@forEach
      if (currentPage != page) {
        commitRun()
        currentPage = page
        currentGlyphs = mutableListOf()
      }
      currentGlyphs.add(glyph)
    }
    commitRun()
    return runs
  }

  private data class VerseBuilder(
      val verseKey: String,
      val surahNumber: Int,
      val verseNumber: Int,
      val arabicText: String,
      val wordsJson: String?,
      val translations: MutableMap<Int, String> = mutableMapOf(),
  )

  private fun Cursor.stringOrNull(column: Int): String? =
      if (isNull(column)) null else getString(column)?.trim()?.takeIf { it.isNotBlank() }

  private fun JSONObject.optNonBlankString(key: String): String? =
      optString(key, "").trim().takeIf { it.isNotEmpty() }

  private fun JSONObject.optPositiveInt(key: String): Int? =
      if (has(key) && !isNull(key)) optInt(key, 0).takeIf { it > 0 } else null

  private inline fun <T> tryOrNull(block: () -> T): T? =
      try {
        block()
      } catch (_: RuntimeException) {
        null
      }

  companion object {
    private const val APP_DATABASE_NAME = "quran_app.db"
    private const val TAJWEED_PACK_ID = "qcf-tajweed-v4"
  }
}
