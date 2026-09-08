package com.anonymous.quranappmobile.nativesurahreader

import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Color
import android.os.Build
import android.view.ContextThemeWrapper
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast

/** Selection is allocated on demand, outside recycled rows and audio highlight updates. */
internal class NativeVerseTextSelection(private val context: Context) {
  private var dialog: AlertDialog? = null

  fun show(
      verseKey: String,
      text: String,
      theme: NativeReaderTheme,
      fontSize: Float,
      fontFace: String? = null,
      arabic: Boolean = false,
      attribution: String? = null,
      fullVerseText: String? = null,
  ): Boolean {
    if (text.isBlank()) return false
    if (dialog?.isShowing == true) return true
    val background = theme.backgroundColor
    val dark = Color.red(background) + Color.green(background) + Color.blue(background) < 384
    val themedContext = ContextThemeWrapper(
        context,
        if (dark) android.R.style.Theme_Material_Dialog_Alert
        else android.R.style.Theme_Material_Light_Dialog_Alert,
    )
    val padding = (24 * context.resources.displayMetrics.density).toInt()
    val content = LinearLayout(themedContext).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(padding, padding / 2, padding, padding / 2)
      setBackgroundColor(background)
    }
    if (!attribution.isNullOrBlank()) {
      content.addView(TextView(themedContext).apply {
        this.text = attribution
        setTextColor(theme.mutedColor)
        textSize = 13f
        setPadding(0, 0, 0, padding / 3)
      })
    }
    content.addView(TextView(themedContext).apply {
      // Always use the source Unicode text, never Tajweed's font-specific glyph codes.
      this.text = text
      textSize = fontSize
      setTextColor(theme.textColor)
      setTextIsSelectable(true)
      if (arabic) {
        textDirection = View.TEXT_DIRECTION_RTL
        gravity = Gravity.RIGHT
        typeface = NativeArabicFontResolver.resolve(context, fontFace, text)
      } else {
        textDirection = View.TEXT_DIRECTION_FIRST_STRONG
      }
    })
    val resolvedFullVerse = fullVerseText?.takeIf { it.isNotBlank() } ?: text
    val selectionDialog = AlertDialog.Builder(themedContext)
        .setTitle("Hold text to select · $verseKey")
        .setView(ScrollView(themedContext).apply { addView(content) })
        .setPositiveButton(if (arabic) "Copy Arabic" else "Copy translation") { _, _ ->
          val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
          clipboard.setPrimaryClip(ClipData.newPlainText(verseKey, text))
          if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            Toast.makeText(
                context,
                if (arabic) "Copied Arabic text" else "Copied translation",
                Toast.LENGTH_SHORT,
            ).show()
          }
        }
        .setNeutralButton("Copy full verse") { _, _ ->
          val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
          clipboard.setPrimaryClip(ClipData.newPlainText(verseKey, resolvedFullVerse))
          if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            Toast.makeText(
                context,
                "Copied full verse $verseKey",
                Toast.LENGTH_SHORT,
            ).show()
          }
        }
        .setNegativeButton("Close", null)
        .create()
    dialog = selectionDialog
    selectionDialog.setOnDismissListener { if (dialog === selectionDialog) dialog = null }
    selectionDialog.show()
    selectionDialog.window?.setBackgroundDrawable(android.graphics.drawable.GradientDrawable().apply {
      setColor(background)
      cornerRadius = padding.toFloat()
    })
    selectionDialog.getButton(AlertDialog.BUTTON_POSITIVE)?.setTextColor(theme.tintColor)
    selectionDialog.getButton(AlertDialog.BUTTON_NEUTRAL)?.setTextColor(theme.tintColor)
    selectionDialog.getButton(AlertDialog.BUTTON_NEGATIVE)?.setTextColor(theme.tintColor)
    return true
  }

  fun dismiss() {
    dialog?.dismiss()
    dialog = null
  }
}
