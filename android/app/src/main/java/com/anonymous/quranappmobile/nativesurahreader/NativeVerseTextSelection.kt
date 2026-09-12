package com.anonymous.quranappmobile.nativesurahreader

import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.os.Build
import android.view.ContextThemeWrapper
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
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
    val density = context.resources.displayMetrics.density
    val dp = { v: Int -> (v * density).toInt() }
    val padding = (24 * density).toInt()

    val rootView = LinearLayout(themedContext).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(22), dp(20), dp(22), dp(18))
    }

    // Header with title and close X button
    val header = LinearLayout(themedContext).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(0, 0, 0, dp(12))
    }

    val titleView = TextView(themedContext).apply {
      this.text = "Hold text to select · $verseKey"
      setTextColor(theme.textColor)
      textSize = 16f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER_VERTICAL
      includeFontPadding = false
    }

    header.addView(
        titleView,
        LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
          rightMargin = dp(8)
        },
    )

    var selectionDialog: AlertDialog? = null

    val closeButton = CloseIconView(themedContext, theme.mutedColor).apply {
      layoutParams = LinearLayout.LayoutParams(dp(36), dp(36))
      isClickable = true
      isFocusable = true
      contentDescription = "Close"
      setOnClickListener {
        selectionDialog?.dismiss()
      }
    }
    header.addView(closeButton)
    rootView.addView(header)

    // Selectable content inside scroll view
    val content = LinearLayout(themedContext).apply {
      orientation = LinearLayout.VERTICAL
    }
    if (!attribution.isNullOrBlank()) {
      content.addView(TextView(themedContext).apply {
        this.text = attribution
        setTextColor(theme.mutedColor)
        textSize = 13f
        setPadding(0, 0, 0, dp(8))
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

    val maxScrollHeight = (context.resources.displayMetrics.heightPixels * 0.45).toInt()
    val scrollView = object : ScrollView(themedContext) {
      override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val heightSize = MeasureSpec.getSize(heightMeasureSpec)
        val mode = MeasureSpec.getMode(heightMeasureSpec)
        val constrainedHeight = if (mode == MeasureSpec.UNSPECIFIED) {
          maxScrollHeight
        } else {
          minOf(heightSize, maxScrollHeight)
        }
        super.onMeasure(
            widthMeasureSpec,
            MeasureSpec.makeMeasureSpec(constrainedHeight, MeasureSpec.AT_MOST),
        )
      }
    }.apply {
      overScrollMode = View.OVER_SCROLL_IF_CONTENT_SCROLLS
      addView(content)
    }
    rootView.addView(
        scrollView,
        LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ),
    )

    // Action buttons at the bottom:
    // Left: Copy (Copy Arabic / Copy translation)
    // Beside it on the right side: Copy full verse
    val resolvedFullVerse = fullVerseText?.takeIf { it.isNotBlank() } ?: text

    val handleCopy = { copyText: String, toastMessage: String ->
      val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      clipboard.setPrimaryClip(ClipData.newPlainText(verseKey, copyText))
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
        Toast.makeText(context, toastMessage, Toast.LENGTH_SHORT).show()
      }
      selectionDialog?.dismiss()
    }

    val actionsRow = LinearLayout(themedContext).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.END or Gravity.CENTER_VERTICAL
    }

    val copyButton = createActionButton(
        themedContext,
        if (arabic) "Copy Arabic" else "Copy translation",
        theme,
    ) {
      handleCopy(text, if (arabic) "Copied Arabic text" else "Copied translation")
    }

    val copyFullVerseButton = createActionButton(
        themedContext,
        "Copy full verse",
        theme,
    ) {
      handleCopy(resolvedFullVerse, "Copied full verse $verseKey")
    }

    actionsRow.addView(
        copyButton,
        LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply {
          rightMargin = dp(10)
        },
    )

    actionsRow.addView(
        copyFullVerseButton,
        LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ),
    )

    val actionsContainer = HorizontalScrollView(themedContext).apply {
      isHorizontalScrollBarEnabled = false
      overScrollMode = View.OVER_SCROLL_NEVER
      isFillViewport = true
      setPadding(0, dp(16), 0, 0)
      clipToPadding = false
      addView(
          actionsRow,
          FrameLayout.LayoutParams(
              FrameLayout.LayoutParams.MATCH_PARENT,
              FrameLayout.LayoutParams.WRAP_CONTENT,
          ),
      )
    }
    rootView.addView(
        actionsContainer,
        LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ),
    )

    selectionDialog = AlertDialog.Builder(themedContext)
        .setView(rootView)
        .create()

    dialog = selectionDialog
    selectionDialog.setOnDismissListener { if (dialog === selectionDialog) dialog = null }
    selectionDialog.show()
    selectionDialog.window?.setBackgroundDrawable(GradientDrawable().apply {
      setColor(background)
      cornerRadius = padding.toFloat()
    })

    return true
  }

  fun dismiss() {
    dialog?.dismiss()
    dialog = null
  }

  private fun createActionButton(
      context: Context,
      text: String,
      theme: NativeReaderTheme,
      onClick: () -> Unit,
  ): TextView {
    val density = context.resources.displayMetrics.density
    val dp = { v: Int -> (v * density).toInt() }
    val tintColor = theme.tintColor
    val rippleColor = Color.argb(60, 255, 255, 255)
    val cornerRadius = 8f * density
    val backgroundDrawable = RippleDrawable(
        ColorStateList.valueOf(rippleColor),
        GradientDrawable().apply {
          setColor(tintColor)
          this.cornerRadius = cornerRadius
        },
        GradientDrawable().apply {
          setColor(Color.WHITE)
          this.cornerRadius = cornerRadius
        },
    )

    return TextView(context).apply {
      this.text = text
      setTextColor(Color.WHITE)
      textSize = 14f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      includeFontPadding = false
      setPadding(dp(14), dp(10), dp(14), dp(10))
      background = backgroundDrawable
      isClickable = true
      isFocusable = true
      setOnClickListener { onClick() }
    }
  }

  private class CloseIconView(context: Context, strokeColor: Int) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = strokeColor
      style = Paint.Style.STROKE
      strokeCap = Paint.Cap.ROUND
      strokeJoin = Paint.Join.ROUND
      strokeWidth = 2.25f * resources.displayMetrics.density
    }

    init {
      val rippleColor = Color.argb(
          38,
          Color.red(strokeColor),
          Color.green(strokeColor),
          Color.blue(strokeColor),
      )
      val mask = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.WHITE)
      }
      background = RippleDrawable(ColorStateList.valueOf(rippleColor), null, mask)
    }

    override fun onDraw(canvas: Canvas) {
      super.onDraw(canvas)
      val padding = 10f * resources.displayMetrics.density
      val left = padding
      val top = padding
      val right = width - padding
      val bottom = height - padding
      if (right > left && bottom > top) {
        canvas.drawLine(left, top, right, bottom, paint)
        canvas.drawLine(left, bottom, right, top, paint)
      }
    }
  }
}
