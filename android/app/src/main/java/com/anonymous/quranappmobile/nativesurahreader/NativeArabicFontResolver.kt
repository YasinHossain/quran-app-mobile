package com.anonymous.quranappmobile.nativesurahreader

import android.content.Context
import android.graphics.Typeface

private const val QPC_UNSUPPORTED_GLYPH = '\u06DF'

internal object NativeArabicFontResolver {
  private val fontAssetPaths =
      mapOf(
          "UthmanicHafs1Ver18" to "fonts/UthmanicHafs1Ver18.ttf",
          "KFGQ V2" to "fonts/KFGQPC-Uthman-Taha.ttf",
          "Me Quran" to "fonts/me_quran.ttf",
          "Amiri Quran" to "fonts/AmiriQuran.ttf",
          "Scheherazade New" to "fonts/Scheherazade-New.ttf",
          "Noto Naskh Arabic" to "fonts/Noto-Naskh-Arabic.ttf",
          "IndoPak" to "fonts/indopak-nastaleeq-waqf-lazim-v4.2.1.ttf",
          "Noor-e-Huda" to "fonts/Noor-e-Huda.ttf",
          "Noor-e-Hidayat" to "fonts/Noor-e-Hidayat.ttf",
          "Noor-e-Hira" to "fonts/Noor-e-Hira.ttf",
          "Lateef" to "fonts/Lateef.ttf",
      )
  private val typefaceCache = mutableMapOf<String, Typeface?>()

  // The end-of-ayah ornament is always drawn in this font so every reader font shows the same
  // marker. Keep in sync with END_OF_AYAH_MARKER_FONT_FAMILY in arabicFonts.ts.
  private const val END_OF_AYAH_MARKER_FAMILY = "UthmanicHafs1Ver18"

  fun resolveEndOfAyahMarker(context: Context): Typeface? =
      loadTypeface(context, END_OF_AYAH_MARKER_FAMILY)

  /**
   * Arabic-Indic digits, which the marker font shapes into one ornament with the number inside.
   * U+06DD is left out: that font draws it as a second, empty ornament.
   */
  fun endOfAyahMarkerText(verseNumber: Int): String =
      verseNumber.toString().map { '\u0660' + (it - '0') }.joinToString("")

  fun resolve(context: Context, fontFace: String?, arabicText: String): Typeface? {
    val requestedFamily = getFirstFontFamily(fontFace) ?: "UthmanicHafs1Ver18"
    val effectiveFamily =
        if (requestedFamily.contains("UthmanicHafs1Ver18") &&
            arabicText.contains(QPC_UNSUPPORTED_GLYPH)) {
          "Scheherazade New"
        } else {
          requestedFamily
        }

    return loadTypeface(context, effectiveFamily)
  }

  private fun getFirstFontFamily(fontFace: String?): String? {
    val first = fontFace?.split(",")?.firstOrNull()?.trim().orEmpty()
    if (first.isBlank()) return null
    return first.trim('"', '\'').takeIf { it.isNotBlank() }
  }

  private fun loadTypeface(context: Context, fontFamily: String): Typeface? {
    if (typefaceCache.containsKey(fontFamily)) {
      return typefaceCache[fontFamily]
    }

    val assetPath = fontAssetPaths[fontFamily]
    val typeface =
        if (assetPath != null) {
          try {
            Typeface.createFromAsset(context.assets, assetPath)
          } catch (_: RuntimeException) {
            Typeface.create(fontFamily, Typeface.NORMAL)
          }
        } else {
          Typeface.create(fontFamily, Typeface.NORMAL)
        }

    typefaceCache[fontFamily] = typeface
    return typeface
  }
}
