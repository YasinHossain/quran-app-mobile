package com.anonymous.quranappmobile.nativesurahreader

import android.content.Context
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView

internal class NativeWordLayoutView(context: Context) : ViewGroup(context) {
  private var words: List<NativeWord> = emptyList()
  private var arabicFontFace: String? = null
  private var arabicFontSize: Float = 25f
  private var theme: NativeReaderTheme = NativeReaderTheme.default()
  private var showTranslations: Boolean = false

  fun bind(
      words: List<NativeWord>,
      arabicFontFace: String?,
      arabicFontSize: Float,
      showTranslations: Boolean,
      theme: NativeReaderTheme,
  ) {
    val filteredWords =
        words.filter { word ->
          word.charTypeName != "end" && word.uthmani.trim().isNotEmpty()
        }

    this.words = filteredWords
    this.arabicFontFace = arabicFontFace
    this.arabicFontSize = arabicFontSize
    this.showTranslations = showTranslations
    this.theme = theme
    contentDescription = filteredWords.joinToString(" ") { it.uthmani }

    removeAllViews()
    filteredWords.forEach { word ->
      addView(createTokenView(word))
    }
    requestLayout()
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val availableWidth =
        (MeasureSpec.getSize(widthMeasureSpec) - paddingLeft - paddingRight).coerceAtLeast(0)
    val childWidthSpec = MeasureSpec.makeMeasureSpec(availableWidth, MeasureSpec.AT_MOST)
    val childHeightSpec = MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED)

    var lineWidth = 0
    var lineHeight = 0
    var totalHeight = paddingTop + paddingBottom
    var maxLineWidth = 0

    for (index in 0 until childCount) {
      val child = getChildAt(index)
      if (child.visibility == GONE) continue

      measureChild(child, childWidthSpec, childHeightSpec)
      val childWidth = child.measuredWidth
      val childHeight = child.measuredHeight

      if (lineWidth > 0 && lineWidth + childWidth > availableWidth) {
        totalHeight += lineHeight
        maxLineWidth = maxOf(maxLineWidth, lineWidth)
        lineWidth = 0
        lineHeight = 0
      }

      lineWidth += childWidth
      lineHeight = maxOf(lineHeight, childHeight)
    }

    if (childCount > 0) {
      totalHeight += lineHeight
      maxLineWidth = maxOf(maxLineWidth, lineWidth)
    }

    val measuredWidth =
        resolveSize(maxLineWidth + paddingLeft + paddingRight, widthMeasureSpec)
    val measuredHeight = resolveSize(totalHeight, heightMeasureSpec)
    setMeasuredDimension(measuredWidth, measuredHeight)
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    val contentLeft = paddingLeft
    val contentRight = width - paddingRight
    val availableWidth = (contentRight - contentLeft).coerceAtLeast(0)

    var y = paddingTop
    val lineChildren = mutableListOf<View>()
    var lineWidth = 0
    var lineHeight = 0

    for (index in 0 until childCount) {
      val child = getChildAt(index)
      if (child.visibility == GONE) continue

      val childWidth = child.measuredWidth.coerceAtMost(availableWidth)
      val childHeight = child.measuredHeight

      if (lineWidth > 0 && lineWidth + childWidth > availableWidth) {
        layoutLine(lineChildren, contentRight, y, lineHeight)
        y += lineHeight
        lineChildren.clear()
        lineWidth = 0
        lineHeight = 0
      }

      lineChildren.add(child)
      lineWidth += childWidth
      lineHeight = maxOf(lineHeight, childHeight)
    }

    if (lineChildren.isNotEmpty()) {
      layoutLine(lineChildren, contentRight, y, lineHeight)
    }
  }

  private fun layoutLine(lineChildren: List<View>, contentRight: Int, lineTop: Int, lineHeight: Int) {
    var x = contentRight
    lineChildren.forEach { child ->
      val childWidth = child.measuredWidth
      val childHeight = child.measuredHeight
      val childTop = lineTop + (lineHeight - childHeight)
      child.layout(x - childWidth, childTop, x, childTop + childHeight)
      x -= childWidth
    }
  }

  private fun createTokenView(word: NativeWord): View {
    val token =
        LinearLayout(context).apply {
          orientation = LinearLayout.VERTICAL
          gravity = Gravity.CENTER
          importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
          setPadding(
              dp(if (showTranslations) 10 else 2),
              dp(if (showTranslations) 8 else 1),
              dp(if (showTranslations) 10 else 2),
              dp(if (showTranslations) 10 else 1),
          )
        }

    token.addView(
        TextView(context).apply {
          text = word.uthmani
          textSize = arabicFontSize
          gravity = Gravity.CENTER
          textDirection = TEXT_DIRECTION_RTL
          includeFontPadding = true
          typeface = NativeArabicFontResolver.resolve(context, arabicFontFace, word.uthmani)
          setTextColor(theme.textColor)
          setLineSpacing(lineSpacingExtra(arabicFontSize, arabicLineHeight(arabicFontSize)), 1.0f)
        },
        LinearLayout.LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT),
    )

    if (showTranslations) {
      val translationText = word.translationText?.trim().orEmpty()
      if (translationText.isNotBlank()) {
        val translationFontSize = maxOf(10f, Math.round(arabicFontSize * 0.5f).toFloat())
        token.addView(
            TextView(context).apply {
              text = translationText
              textSize = translationFontSize
              gravity = Gravity.CENTER
              maxLines = 3
              ellipsize = TextUtils.TruncateAt.END
              includeFontPadding = false
              setTextColor(theme.mutedColor)
              setLineSpacing(
                  lineSpacingExtra(translationFontSize, translationLineHeight(translationFontSize)),
                  1.0f,
              )
            },
            LinearLayout.LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
              topMargin = dp(2)
            },
        )
      }
    }

    return token
  }

  private fun dp(value: Int): Int {
    return (value * resources.displayMetrics.density).toInt()
  }

  private fun sp(value: Float): Float {
    return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, value, resources.displayMetrics)
  }

  private fun lineSpacingExtra(fontSizeSp: Float, lineHeightSp: Float): Float {
    return (sp(lineHeightSp) - sp(fontSizeSp)).coerceAtLeast(0f)
  }

  private fun arabicLineHeight(fontSizeSp: Float): Float {
    return maxOf(fontSizeSp + 14f, fontSizeSp * 2.2f)
  }

  private fun translationLineHeight(fontSizeSp: Float): Float {
    return maxOf(fontSizeSp + 4f, fontSizeSp * 1.6f)
  }
}
