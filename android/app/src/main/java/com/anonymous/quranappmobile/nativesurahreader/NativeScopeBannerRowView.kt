package com.anonymous.quranappmobile.nativesurahreader

import android.content.Context
import android.graphics.Typeface
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.view.ViewCompat

/** Quiet "Juz 5 · An-Nisa 24 – 147" label with a hairline, above a Juz or Page passage. */
internal class NativeScopeBannerRowView(context: Context) : LinearLayout(context) {
  private val titleView =
      TextView(context).apply {
        textSize = 13f
        typeface = Typeface.DEFAULT_BOLD
        includeFontPadding = false
        letterSpacing = 0.04f
        maxLines = 1
      }

  private val subtitleView =
      TextView(context).apply {
        textSize = 13f
        includeFontPadding = false
        maxLines = 1
        ellipsize = TextUtils.TruncateAt.END
        textAlignment = View.TEXT_ALIGNMENT_VIEW_END
      }

  private val dividerView = View(context)

  init {
    orientation = VERTICAL
    ViewCompat.setAccessibilityHeading(this, true)
    isFocusable = true
    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES

    val content =
        LinearLayout(context).apply {
          orientation = HORIZONTAL
          gravity = Gravity.CENTER_VERTICAL
          minimumHeight = dp(36)
          importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
        }
    content.addView(titleView, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT))
    content.addView(
        subtitleView,
        LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(12) },
    )

    addView(content, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
    addView(
        dividerView,
        LayoutParams(LayoutParams.MATCH_PARENT, 1).apply {
          topMargin = dp(4)
          bottomMargin = dp(12)
        },
    )
  }

  fun bind(banner: NativeScopeBanner, theme: NativeReaderTheme) {
    titleView.text = banner.title
    titleView.setTextColor(theme.tintColor)
    subtitleView.text = banner.subtitle.orEmpty()
    subtitleView.setTextColor(theme.mutedColor)
    subtitleView.visibility = if (banner.subtitle.isNullOrBlank()) GONE else VISIBLE
    dividerView.setBackgroundColor(theme.borderColor)
    contentDescription = listOfNotNull(banner.title, banner.subtitle).joinToString(", ")
  }

  private fun dp(value: Int): Int {
    return (value * resources.displayMetrics.density).toInt()
  }
}
