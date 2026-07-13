package com.anonymous.quranappmobile.nativesurahreader

import android.graphics.Typeface
import android.net.Uri
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.TextPaint
import android.text.style.LineHeightSpan
import android.text.style.MetricAffectingSpan
import java.io.File
import kotlin.math.roundToInt

internal object NativeTajweedTextFactory {
  private val typefaceCache = mutableMapOf<String, Typeface?>()

  fun buildSpannable(runs: List<NativeTajweedGlyphRun>, lineHeightPx: Int): CharSequence? {
    if (runs.isEmpty()) return null

    val builder = SpannableStringBuilder()
    for (run in runs) {
      val text = run.glyphs.joinToString(separator = "")
      if (text.isBlank()) continue

      val typeface = resolveTypeface(run) ?: return null
      val start = builder.length
      builder.append(text)
      builder.setSpan(
          TypefaceMetricSpan(typeface),
          start,
          builder.length,
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
