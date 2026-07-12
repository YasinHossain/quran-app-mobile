package com.anonymous.quranappmobile.nativesurahreader

import android.graphics.Color
import com.facebook.react.bridge.ReadableMap

internal data class NativeReaderTheme(
    val backgroundColor: Int,
    val activeBackgroundColor: Int,
    val borderColor: Int,
    val mutedColor: Int,
    val textColor: Int,
    val tintColor: Int,
) {
  companion object {
    fun default(): NativeReaderTheme {
      return NativeReaderTheme(
          backgroundColor = Color.rgb(247, 249, 249),
          activeBackgroundColor = Color.argb(13, 13, 148, 136),
          borderColor = Color.argb(102, 229, 231, 235),
          mutedColor = Color.rgb(107, 114, 128),
          textColor = Color.rgb(55, 65, 81),
          tintColor = Color.rgb(13, 148, 136),
      )
    }

    fun fromReadableMap(theme: ReadableMap?): NativeReaderTheme {
      val fallback = default()
      return NativeReaderTheme(
          backgroundColor = theme?.getColorIfPresent("backgroundColor") ?: fallback.backgroundColor,
          activeBackgroundColor =
              theme?.getColorIfPresent("activeBackgroundColor") ?: fallback.activeBackgroundColor,
          borderColor = theme?.getColorIfPresent("borderColor") ?: fallback.borderColor,
          mutedColor = theme?.getColorIfPresent("mutedColor") ?: fallback.mutedColor,
          textColor = theme?.getColorIfPresent("textColor") ?: fallback.textColor,
          tintColor = theme?.getColorIfPresent("tintColor") ?: fallback.tintColor,
      )
    }
  }
}
