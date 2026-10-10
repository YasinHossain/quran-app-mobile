package com.anonymous.quranappmobile.nativehomeindex

import android.graphics.Color
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap

internal data class NativeHomeIndexItem(
    val type: String,
    val number: Int,
    val numberLabel: String,
    val title: String,
    val subtitle: String,
    val trailingText: String,
    val accessibilityLabel: String,
) {
  val stableId: Long
    get() {
      val typeId = when (type) {
        "surah" -> 1L
        "juz" -> 2L
        else -> 3L
      }
      return typeId * 10_000L + number
    }
}

internal data class NativeHomeIndexTheme(
    val backgroundColor: Int,
    val cardColor: Int,
    val numberBadgeColor: Int,
    val primaryTextColor: Int,
    val secondaryTextColor: Int,
    val accentColor: Int,
) {
  companion object {
    fun default() = NativeHomeIndexTheme(
        backgroundColor = Color.rgb(247, 249, 249),
        cardColor = Color.WHITE,
        numberBadgeColor = Color.rgb(243, 244, 246),
        primaryTextColor = Color.rgb(55, 65, 81),
        secondaryTextColor = Color.rgb(107, 114, 128),
        accentColor = Color.rgb(13, 148, 136),
    )

    fun fromReadableMap(map: ReadableMap?): NativeHomeIndexTheme {
      val fallback = default()
      if (map == null) return fallback
      return NativeHomeIndexTheme(
          backgroundColor = map.color("backgroundColor", fallback.backgroundColor),
          cardColor = map.color("cardColor", fallback.cardColor),
          numberBadgeColor = map.color("numberBadgeColor", fallback.numberBadgeColor),
          primaryTextColor = map.color("primaryTextColor", fallback.primaryTextColor),
          secondaryTextColor = map.color("secondaryTextColor", fallback.secondaryTextColor),
          accentColor = map.color("accentColor", fallback.accentColor),
      )
    }
  }
}

internal fun parseNativeHomeIndexItems(array: ReadableArray?): List<NativeHomeIndexItem> {
  if (array == null) return emptyList()
  return buildList(array.size()) {
    for (index in 0 until array.size()) {
      val map = array.getMap(index) ?: continue
      val type = map.string("type") ?: continue
      val number = map.number("number")?.toInt() ?: continue
      add(
          NativeHomeIndexItem(
              type = type,
              number = number,
              numberLabel = map.string("numberLabel").orEmpty(),
              title = map.string("title").orEmpty(),
              subtitle = map.string("subtitle").orEmpty(),
              trailingText = map.string("trailingText").orEmpty(),
              accessibilityLabel = map.string("accessibilityLabel").orEmpty(),
          ),
      )
    }
  }
}

internal fun parseNativeHomeIndexContent(map: ReadableMap?): List<NativeHomeIndexItem> {
  if (map == null) return emptyList()
  if (map.string("kind") != "pages") {
    return parseNativeHomeIndexItems(map.array("items"))
  }

  return createNativePageIndexItems(
      count = map.number("count")?.toInt() ?: 0,
      titleTemplate = map.string("titleTemplate").orEmpty(),
      digits = map.string("digits").orEmpty(),
  )
}

internal fun createNativePageIndexItems(
    count: Int,
    titleTemplate: String,
    digits: String,
): List<NativeHomeIndexItem> {
  val safeCount = count.coerceAtLeast(0)
  val digitChars = digits.toList().takeIf { it.size == 10 } ?: "0123456789".toList()
  return List(safeCount) { index ->
    val number = index + 1
    val numberLabel = buildString {
      number.toString().forEach { digit -> append(digitChars[digit - '0']) }
    }
    val title = titleTemplate.replace(PAGE_NUMBER_TOKEN, numberLabel)
    NativeHomeIndexItem(
        type = "page",
        number = number,
        numberLabel = numberLabel,
        title = title,
        subtitle = "",
        trailingText = "",
        accessibilityLabel = "$numberLabel, $title",
    )
  }
}

private fun ReadableMap.string(key: String): String? =
    if (hasKey(key) && !isNull(key)) getString(key) else null

private fun ReadableMap.number(key: String): Double? =
    if (hasKey(key) && !isNull(key)) getDouble(key) else null

private fun ReadableMap.array(key: String): ReadableArray? =
    if (hasKey(key) && !isNull(key)) getArray(key) else null

private fun ReadableMap.color(key: String, fallback: Int): Int {
  val value = string(key) ?: return fallback
  return try {
    Color.parseColor(value)
  } catch (_: IllegalArgumentException) {
    fallback
  }
}

private const val PAGE_NUMBER_TOKEN = "__PAGE_NUMBER__"
