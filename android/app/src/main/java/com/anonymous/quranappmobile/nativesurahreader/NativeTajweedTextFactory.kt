package com.anonymous.quranappmobile.nativesurahreader

import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.Color
import android.net.Uri
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.TextPaint
import android.text.style.LineHeightSpan
import android.text.style.ReplacementSpan
import android.text.style.MetricAffectingSpan
import android.text.style.ClickableSpan
import android.view.View
import java.io.File
import kotlin.math.roundToInt

internal object NativeTajweedTextFactory {
  private val typefaceCache = mutableMapOf<String, Typeface?>()

  /**
   * Gap between tajweed words, in em. The glyph fonts have almost no word space of their own (their
   * Mushaf pages are justified), so reflowed text needs one. Keep in sync with TAJWEED_WORD_GAP_EM
   * in TajweedNativeText.tsx.
   */
  const val WORD_GAP_EM = 0.12f

  fun buildSpannable(
      runs: List<NativeTajweedGlyphRun>,
      words: List<NativeWord>,
      lineHeightPx: Int,
      wordGapPx: Int,
      wordPressEnabled: Boolean,
      activeWord: NativeActiveWord?,
      activeColor: Int,
      onWordPress: (NativeWord) -> Unit,
  ): CharSequence? {
    if (runs.isEmpty()) return null

    val builder = SpannableStringBuilder()
    val glyphs = runs.flatMap { it.glyphs }.filter { it.isNotEmpty() }
    val glyphWords =
        words
            .filter { !it.codeV2.isNullOrBlank() }
            .sortedBy { it.position ?: Int.MAX_VALUE }
    if (buildNativeTajweedWordRanges(glyphs, glyphWords.size).isEmpty()) return null

    val wordRanges = mutableListOf<NativeTajweedWordRange>()
    for (run in runs) {
      if (run.glyphs.joinToString(separator = "").isBlank()) continue

      val typeface = resolveTypeface(run) ?: return null
      val runStart = builder.length
      for (glyph in run.glyphs) {
        if (glyph.isEmpty()) continue
        if (wordRanges.isNotEmpty() && wordGapPx > 0) {
          builder.append(' ')
          builder.setSpan(
              WordGapSpan(wordGapPx),
              builder.length - 1,
              builder.length,
              Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
          )
        }
        val wordStart = builder.length
        builder.append(glyph)
        wordRanges.add(NativeTajweedWordRange(wordStart, builder.length, wordRanges.size))
      }
      builder.setSpan(
          TypefaceMetricSpan(typeface),
          runStart,
          builder.length,
          Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
      )
    }

    wordRanges.forEach { range ->
      val word = glyphWords[range.wordIndex]
      if (word.charTypeName == "end") return@forEach
      builder.setSpan(
          NativeTajweedWordSpan(
              word = word,
              enabled = wordPressEnabled,
              active = isActiveWord(word, activeWord),
              activeColor = activeColor,
              onPress = onWordPress,
          ),
          range.start,
          range.end,
          Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
      )
    }

    if (builder.isNotEmpty() && lineHeightPx > 0) {
      builder.setSpan(
          FixedLineHeightSpan(lineHeightPx),
          0,
          builder.length,
          Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
      )
    }

    return builder.takeIf { it.isNotEmpty() }
  }

  /** Makes each word of plain verse text pressable, matching words to the text by position. */
  fun buildPlainSpannable(
      verseKey: String,
      arabicText: String,
      words: List<NativeWord>,
      wordPressEnabled: Boolean,
      activeWord: NativeActiveWord?,
      activeColor: Int,
      onWordPress: (NativeWord) -> Unit,
  ): CharSequence? {
    val textWords =
        words
            .filter { it.charTypeName != "end" }
            .sortedBy { it.position ?: Int.MAX_VALUE }
    val ranges = segmentNativeArabicWords(verseKey, arabicText)
    if (ranges.isEmpty() || ranges.size != textWords.size) return null
    if (textWords.withIndex().any { (index, word) -> word.position != index + 1 }) return null

    val builder = SpannableStringBuilder(arabicText)
    ranges.forEachIndexed { index, range ->
      val word = textWords[index]
      builder.setSpan(
          NativeTajweedWordSpan(
              word = word,
              enabled = wordPressEnabled,
              active = isActiveWord(word, activeWord),
              activeColor = activeColor,
              onPress = onWordPress,
          ),
          range.start,
          range.end,
          Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
      )
    }
    return builder
  }

  /**
   * Appends the end-of-ayah ornament for [verseNumber] to plain verse
   * text, drawn in [markerTypeface] so every reader font shows the same marker.
   */
  fun appendEndOfAyahMarker(
      text: CharSequence,
      verseNumber: Int,
      markerTypeface: Typeface?,
  ): CharSequence {
    if (verseNumber <= 0) return text
    val builder = SpannableStringBuilder(text)
    builder.append(' ')
    val markerStart = builder.length
    builder.append(NativeArabicFontResolver.endOfAyahMarkerText(verseNumber))
    if (markerTypeface != null) {
      builder.setSpan(
          TypefaceMetricSpan(markerTypeface),
          markerStart,
          builder.length,
          Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
      )
    }
    return builder
  }

  fun updateInteraction(
      text: CharSequence,
      enabled: Boolean,
      activeWord: NativeActiveWord?,
      activeColor: Int,
  ) {
    val spanned = text as? Spanned ?: return
    val spans = spanned.getSpans(0, spanned.length, NativeTajweedWordSpan::class.java)
    spans.forEach { span ->
      span.enabled = enabled
      span.active = isActiveWord(span.word, activeWord)
      span.activeColor = activeColor
    }
  }

  private fun isActiveWord(word: NativeWord, activeWord: NativeActiveWord?): Boolean {
    if (activeWord == null) return false
    val position = word.position
    if (position != null && activeWord.wordPosition != null) {
      return position == activeWord.wordPosition
    }
    return activeWord.wordId != null && word.id == activeWord.wordId
  }

  private fun resolveTypeface(run: NativeTajweedGlyphRun): Typeface? {
    val cacheKey = "${run.fontFamily}:${run.fontFileUri}"
    if (typefaceCache.containsKey(cacheKey)) {
      return typefaceCache[cacheKey]
    }

    val typeface =
        try {
          val file = File(resolveFilePath(run.fontFileUri))
          if (file.exists() && file.isFile) {
            Typeface.createFromFile(file)
          } else {
            null
          }
        } catch (_: RuntimeException) {
          null
        }

    if (typeface == null) {
      typefaceCache.remove(cacheKey)
      return null
    }

    typefaceCache[cacheKey] = typeface
    return typeface
  }

  private fun resolveFilePath(uriOrPath: String): String {
    val trimmed = uriOrPath.trim()
    if (trimmed.startsWith("file://")) {
      return Uri.parse(trimmed).path ?: trimmed.removePrefix("file://")
    }
    return trimmed
  }
}

private class NativeTajweedWordSpan(
    val word: NativeWord,
    var enabled: Boolean,
    var active: Boolean,
    var activeColor: Int,
    private val onPress: (NativeWord) -> Unit,
) : ClickableSpan() {
  override fun onClick(widget: View) {
    if (enabled) onPress(word)
  }

  override fun updateDrawState(drawState: TextPaint) {
    drawState.isUnderlineText = false
    drawState.bgColor = if (active) activeColor else Color.TRANSPARENT
  }
}

private class TypefaceMetricSpan(private val typeface: Typeface) : MetricAffectingSpan() {
  override fun updateMeasureState(textPaint: TextPaint) {
    apply(textPaint)
  }

  override fun updateDrawState(textPaint: TextPaint) {
    apply(textPaint)
  }

  private fun apply(textPaint: TextPaint) {
    textPaint.typeface = typeface
  }
}

/** An invisible, fixed-width gap that stands in for a word space. */
private class WordGapSpan(private val widthPx: Int) : ReplacementSpan() {
  override fun getSize(
      paint: Paint,
      text: CharSequence?,
      start: Int,
      end: Int,
      fm: Paint.FontMetricsInt?,
  ): Int = widthPx

  override fun draw(
      canvas: android.graphics.Canvas,
      text: CharSequence?,
      start: Int,
      end: Int,
      x: Float,
      top: Int,
      y: Int,
      bottom: Int,
      paint: Paint,
  ) = Unit
}

private class FixedLineHeightSpan(private val lineHeightPx: Int) : LineHeightSpan {
  override fun chooseHeight(
      text: CharSequence,
      start: Int,
      end: Int,
      spanstartv: Int,
      lineHeight: Int,
      fm: android.graphics.Paint.FontMetricsInt,
  ) {
    if (lineHeightPx <= 0) return

    val descent = (lineHeightPx * 0.25f).roundToInt()
    fm.descent = descent
    fm.ascent = descent - lineHeightPx
    fm.bottom = fm.descent
    fm.top = fm.ascent
  }
}
