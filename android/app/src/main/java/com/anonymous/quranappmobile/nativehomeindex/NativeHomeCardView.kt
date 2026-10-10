package com.anonymous.quranappmobile.nativehomeindex

import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

internal class NativeHomeCardView(
    context: android.content.Context,
    private val onPress: (NativeHomeIndexItem) -> Unit,
) : LinearLayout(context) {
  private val density = resources.displayMetrics.density
  private val badge = TextView(context)
  private val title = TextView(context)
  private val subtitle = TextView(context)
  private val trailing = TextView(context)
  private var boundItem: NativeHomeIndexItem? = null
  private var theme = NativeHomeIndexTheme.default()

  init {
    orientation = HORIZONTAL
    gravity = Gravity.CENTER_VERTICAL
    setPadding(dp(16), 0, dp(16), 0)
    isClickable = true
    isFocusable = true

    badge.gravity = Gravity.CENTER
    badge.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 18f)
    badge.setTypeface(Typeface.DEFAULT, Typeface.BOLD)
    addView(badge, LayoutParams(dp(48), dp(48)))

    val textColumn = LinearLayout(context).apply {
      orientation = VERTICAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(12), 0, dp(8), 0)
    }
    title.maxLines = 1
    title.ellipsize = android.text.TextUtils.TruncateAt.END
    title.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 16f)
    title.setTypeface(Typeface.DEFAULT, Typeface.BOLD)
    textColumn.addView(title, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
    subtitle.maxLines = 1
    subtitle.ellipsize = android.text.TextUtils.TruncateAt.END
    subtitle.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 12f)
    textColumn.addView(subtitle, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
      topMargin = dp(2)
    })
    addView(textColumn, LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))

    trailing.maxLines = 1
    trailing.ellipsize = android.text.TextUtils.TruncateAt.END
    trailing.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 18f)
    trailing.setTypeface(Typeface.DEFAULT, Typeface.BOLD)
    trailing.gravity = Gravity.CENTER_VERTICAL or Gravity.END
    addView(trailing, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT))

    setOnClickListener {
      boundItem?.let(onPress)
    }
    setOnTouchListener { _, event ->
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> alpha = 0.92f
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> alpha = 1f
      }
      false
    }
  }

  fun bind(item: NativeHomeIndexItem, nextTheme: NativeHomeIndexTheme) {
    boundItem = item
    theme = nextTheme
    contentDescription = item.accessibilityLabel
    badge.text = item.numberLabel
    title.text = item.title
    subtitle.text = item.subtitle
    subtitle.visibility = if (item.subtitle.isBlank()) View.GONE else View.VISIBLE
    trailing.text = item.trailingText
    trailing.visibility = if (item.trailingText.isBlank()) View.GONE else View.VISIBLE
    title.setTypeface(Typeface.DEFAULT, if (item.type == "surah") Typeface.BOLD else Typeface.NORMAL)
    badge.setTextSize(
        android.util.TypedValue.COMPLEX_UNIT_SP,
        if (item.type == "page") 16f else 18f,
    )
    applyTheme()
  }

  private fun applyTheme() {
    background = roundedDrawable(theme.cardColor, 12f)
    badge.background = roundedDrawable(theme.numberBadgeColor, 12f)
    badge.setTextColor(theme.accentColor)
    title.setTextColor(theme.primaryTextColor)
    subtitle.setTextColor(theme.secondaryTextColor)
    trailing.setTextColor(theme.primaryTextColor)
  }

  private fun roundedDrawable(color: Int, radiusDp: Float) = GradientDrawable().apply {
    shape = GradientDrawable.RECTANGLE
    cornerRadius = radiusDp * density
    setColor(color)
  }

  private fun dp(value: Int): Int = (value * density + 0.5f).toInt()
}

internal class NativeHomeGridRowView(
    context: android.content.Context,
    private val onPress: (NativeHomeIndexItem) -> Unit,
) : LinearLayout(context) {
  private val density = resources.displayMetrics.density
  private val cards = mutableListOf<NativeHomeCardView>()

  init {
    orientation = HORIZONTAL
    gravity = Gravity.TOP
    layoutParams = androidx.recyclerview.widget.RecyclerView.LayoutParams(
        LayoutParams.MATCH_PARENT,
        dp(82),
    )
  }

  fun bind(
      items: List<NativeHomeIndexItem>,
      startIndex: Int,
      columns: Int,
      theme: NativeHomeIndexTheme,
  ) {
    ensureCardCount(columns)
    setBackgroundColor(theme.backgroundColor)
    for (column in 0 until columns) {
      val card = cards[column]
      val item = items.getOrNull(startIndex + column)
      if (item == null) {
        card.visibility = View.INVISIBLE
        card.isClickable = false
      } else {
        card.visibility = View.VISIBLE
        card.isClickable = true
        card.bind(item, theme)
      }
    }
  }

  private fun ensureCardCount(columns: Int) {
    if (cards.size == columns) return
    removeAllViews()
    cards.clear()
    repeat(columns) {
      val card = NativeHomeCardView(context, onPress)
      cards.add(card)
      addView(card, LayoutParams(0, dp(72), 1f).apply {
        leftMargin = dp(12)
        rightMargin = dp(12)
      })
    }
  }

  private fun dp(value: Int): Int = (value * density + 0.5f).toInt()
}
