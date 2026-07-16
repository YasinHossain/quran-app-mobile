package com.anonymous.quranappmobile.nativesurahreader

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView

internal class NativeVerseRowView(
    context: Context,
    private val onActionPress: (NativeVerse) -> Unit,
    private val onWordPress: (NativeVerse, NativeWord) -> Unit,
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

  private val wordLayoutView = NativeWordLayoutView(context)

  private val translationContainer =
      LinearLayout(context).apply {
        orientation = VERTICAL
      }

  private val dividerView = android.view.View(context)

  private var boundVerse: NativeVerse? = null
  private var boundTheme: NativeReaderTheme = NativeReaderTheme.default()

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
        wordLayoutView,
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
      activeWord: NativeActiveWord?,
      arabicFontFace: String?,
      arabicFontSize: Float,
      translationFontSize: Float,
      displayMode: String,
      showByWords: Boolean,
      audioWordSyncEnabled: Boolean,
      wordPressEnabled: Boolean,
      showTranslationAttribution: Boolean,
      theme: NativeReaderTheme,
  ) {
    boundVerse = verse
    boundTheme = theme
    referenceView.text = verse.verseKey
    referenceView.setTextColor(theme.tintColor)
    val shouldShowWordLayout =
        (displayMode == DISPLAY_MODE_WORD_BY_WORD || showByWords || audioWordSyncEnabled) &&
            verse.words.isNotEmpty()
    if (shouldShowWordLayout) {
      arabicView.visibility = View.GONE
      wordLayoutView.visibility = View.VISIBLE
      wordLayoutView.bind(
          verse.words,
          verse,
          arabicFontFace,
          arabicFontSize,
          showByWords,
          wordPressEnabled,
          activeWord,
          theme,
          onWordPress,
      )
    } else {
      val tajweedText =
          if (displayMode == DISPLAY_MODE_TAJWEED && !showByWords) {
            NativeTajweedTextFactory.buildSpannable(
                verse.tajweedGlyphRuns,
                sp(tajweedLineHeight(arabicFontSize)).toInt(),
            )
          } else {
            null
      }
      wordLayoutView.visibility = View.GONE
      wordLayoutView.bind(
          emptyList(),
          verse,
          arabicFontFace,
          arabicFontSize,
          false,
          false,
          null,
          theme,
          onWordPress,
      )
      arabicView.visibility = View.VISIBLE
      arabicView.text = tajweedText ?: verse.arabicText
      arabicView.contentDescription = verse.arabicText
      arabicView.typeface =
          if (tajweedText == null) {
            NativeArabicFontResolver.resolve(context, arabicFontFace, verse.arabicText)
          } else {
            Typeface.DEFAULT
          }
      arabicView.includeFontPadding = tajweedText == null
      arabicView.textSize = arabicFontSize
      arabicView.setTextColor(theme.textColor)
      val lineHeight =
          if (tajweedText == null) {
            arabicLineHeight(arabicFontSize)
          } else {
            tajweedLineHeight(arabicFontSize)
          }
      arabicView.setLineSpacing(lineSpacingExtra(arabicFontSize, lineHeight), 1.0f)
      arabicView.minHeight = sp(lineHeight).toInt()
    }
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
    bindActiveAudio(activeVerseKey, activeWord)
  }

  fun bindActiveAudio(activeVerseKey: String?, activeWord: NativeActiveWord?) {
    val verse = boundVerse ?: return
    setBackgroundColor(if (activeVerseKey == verse.verseKey) boundTheme.activeBackgroundColor else Color.TRANSPARENT)
    wordLayoutView.updateActiveWord(activeWord)
    invalidate()
  }

  fun updateWordPressEnabled(enabled: Boolean) {
    wordLayoutView.updateWordPressEnabled(enabled)
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
    return maxOf(fontSizeSp + 3f, fontSizeSp * 1.18f)
  }

  private fun tajweedLineHeight(fontSizeSp: Float): Float {
    return maxOf(fontSizeSp + 7f, fontSizeSp * 1.42f)
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
