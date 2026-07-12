package com.anonymous.quranappmobile.nativesurahreader

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView

internal class NativeVerseRowView(
    context: Context,
    private val onActionPress: (NativeVerse) -> Unit,
) : LinearLayout(context) {
  private val referenceView =
      TextView(context).apply {
        textSize = 13f
        typeface = Typeface.DEFAULT_BOLD
        includeFontPadding = false
      }

  private val actionButton =
      TextView(context).apply {
        text = "⋯"
        textSize = 18f
        gravity = Gravity.CENTER
        includeFontPadding = false
        minWidth = dp(32)
        minHeight = dp(32)
      }

  private val arabicView =
      TextView(context).apply {
        gravity = Gravity.RIGHT
        textDirection = TEXT_DIRECTION_RTL
        includeFontPadding = true
      }

  private val translationContainer =
      LinearLayout(context).apply {
        orientation = VERTICAL
      }

  private val dividerView = android.view.View(context)

  private var boundVerse: NativeVerse? = null

  init {
    orientation = VERTICAL
    setPadding(0, dp(16), 0, 0)

    val header =
        LinearLayout(context).apply {
          orientation = HORIZONTAL
          gravity = Gravity.CENTER_VERTICAL
        }
    header.addView(referenceView, LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))
    header.addView(actionButton, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT))
    addView(header, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))

    val margin = dp(10)
    addView(
        arabicView,
        LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
          topMargin = margin
        },
    )
    addView(
        translationContainer,
        LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
          topMargin = margin
        },
    )
    addView(
        dividerView,
        LayoutParams(LayoutParams.MATCH_PARENT, 1).apply {
          topMargin = dp(16)
        },
    )

    actionButton.setOnClickListener {
      boundVerse?.let(onActionPress)
    }
  }

  fun bind(
      verse: NativeVerse,
      activeVerseKey: String?,
      arabicFontFace: String?,
      arabicFontSize: Float,
      translationFontSize: Float,
      showTranslationAttribution: Boolean,
      theme: NativeReaderTheme,
  ) {
    boundVerse = verse
    referenceView.text = verse.verseKey
    referenceView.setTextColor(theme.tintColor)
    arabicView.text = verse.arabicText
    arabicView.typeface = NativeArabicFontResolver.resolve(context, arabicFontFace, verse.arabicText)
    arabicView.textSize = arabicFontSize
    arabicView.setTextColor(theme.textColor)
    arabicView.setLineSpacing(lineSpacingExtra(arabicFontSize, arabicLineHeight(arabicFontSize)), 1.0f)
    actionButton.setTextColor(theme.mutedColor)
    actionButton.background = circleDrawable(Color.TRANSPARENT)
    translationContainer.removeAllViews()
    verse.translationItems.forEachIndexed { index, item ->
      val itemLayout =
          LinearLayout(context).apply {
            orientation = VERTICAL
            if (index > 0) {
              setPadding(0, dp(18), 0, 0)
            }
          }

      if (showTranslationAttribution && !item.resourceName.isNullOrBlank()) {
        itemLayout.addView(
            TextView(context).apply {
              text = item.resourceName.uppercase()
              textSize = 12f
              typeface = Typeface.DEFAULT
              ellipsize = TextUtils.TruncateAt.END
              maxLines = 2
              setTextColor(theme.mutedColor)
              includeFontPadding = false
            },
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
              bottomMargin = dp(8)
            },
        )
      }

      itemLayout.addView(
          TextView(context).apply {
            text = item.text
            textSize = translationFontSize
            setTextColor(theme.textColor)
            setLineSpacing(
                lineSpacingExtra(translationFontSize, translationLineHeight(translationFontSize)),
                1.0f,
            )
          },
          LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT),
      )
      translationContainer.addView(itemLayout, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
    }
    dividerView.setBackgroundColor(theme.borderColor)
    setBackgroundColor(if (activeVerseKey == verse.verseKey) theme.activeBackgroundColor else Color.TRANSPARENT)
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
    return maxOf(fontSizeSp + 8f, fontSizeSp * 1.7f)
  }

  private fun circleDrawable(color: Int): GradientDrawable {
    return GradientDrawable().apply {
      shape = GradientDrawable.OVAL
      setColor(color)
    }
  }
}
