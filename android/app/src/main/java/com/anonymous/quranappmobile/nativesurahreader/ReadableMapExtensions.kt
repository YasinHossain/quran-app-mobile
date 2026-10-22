package com.anonymous.quranappmobile.nativesurahreader

import android.graphics.Color
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap

internal fun ReadableMap.getStringIfPresent(key: String): String? {
  return if (hasKey(key) && !isNull(key)) getString(key) else null
}

internal fun ReadableMap.getArrayIfPresent(key: String): ReadableArray? {
  return if (hasKey(key) && !isNull(key)) getArray(key) else null
}

internal fun ReadableMap.getMapIfPresent(key: String): ReadableMap? {
  return if (hasKey(key) && !isNull(key)) getMap(key) else null
}

internal fun ReadableMap.getDoubleIfPresent(key: String): Double? {
  return if (hasKey(key) && !isNull(key)) getDouble(key) else null
}

internal fun ReadableMap.getBooleanIfPresent(key: String): Boolean? {
  return if (hasKey(key) && !isNull(key)) getBoolean(key) else null
}

internal fun ReadableMap.getColorIfPresent(key: String): Int? {
  val rawColor = getStringIfPresent(key)?.trim()?.takeIf { it.isNotBlank() } ?: return null
  val normalizedColor =
      if (rawColor.length == 9 && rawColor.startsWith("#")) {
        "#${rawColor.substring(7, 9)}${rawColor.substring(1, 7)}"
      } else {
        rawColor
      }
  return try {
    Color.parseColor(normalizedColor)
  } catch (_: IllegalArgumentException) {
    null
  }
}
