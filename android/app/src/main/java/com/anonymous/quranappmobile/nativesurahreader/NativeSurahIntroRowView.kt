package com.anonymous.quranappmobile.nativesurahreader

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView

internal class NativeSurahIntroRowView(context: Context) : LinearLayout(context) {
  private val titleView =
      TextView(context).apply {
        textSize = 26f
        typeface = Typeface.DEFAULT_BOLD
        includeFontPadding = true
        maxLines = 2
      }

  private val metadataView =
      TextView(context).apply {
        textSize = 14f
        includeFontPadding = false
      }

  private val illustrationView = RevelationIllustrationView(context)

  private val bismillahView = NativeBismillahView(context)

  private val dividerView = View(context)

  init {
    orientation = VERTICAL
    setPadding(dp(4), 0, dp(4), 0)

    val content =
        LinearLayout(context).apply {
          gravity = Gravity.CENTER_VERTICAL
          orientation = HORIZONTAL
          setPadding(dp(8), dp(12), dp(8), 0)
          minimumHeight = dp(104)
        }

    val textColumn =
        LinearLayout(context).apply {
          gravity = Gravity.CENTER_VERTICAL
          orientation = VERTICAL
        }

    textColumn.addView(titleView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
    textColumn.addView(
        metadataView,
        LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
          topMargin = dp(2)
        },
    )

    content.addView(textColumn, LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))
    content.addView(
        illustrationView,
        LayoutParams(dp(136), dp(78)).apply {
          leftMargin = dp(16)
        },
    )

    addView(content, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
    addView(
        bismillahView,
        LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
          topMargin = dp(18)
          leftMargin = dp(8)
          rightMargin = dp(8)
        },
    )
    addView(
        dividerView,
        LayoutParams(LayoutParams.MATCH_PARENT, 1).apply {
          topMargin = dp(20)
          bottomMargin = dp(16)
        },
    )
  }

  fun bind(intro: NativeSurahIntro, theme: NativeReaderTheme) {
    titleView.text = intro.surahName
    titleView.setTextColor(theme.textColor)
    metadataView.text = intro.infoLabel
    metadataView.setTextColor(theme.mutedColor)
    bismillahView.visibility = if (intro.showBismillah) VISIBLE else GONE
    bismillahView.bind(theme)
    dividerView.setBackgroundColor(theme.borderColor)
    illustrationView.bind(intro.isMakkah, theme)
    setBackgroundColor(Color.TRANSPARENT)
  }

  private fun dp(value: Int): Int {
    return (value * resources.displayMetrics.density).toInt()
  }
}

private class RevelationIllustrationView(context: Context) : View(context) {
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val path = Path()
  private var isMakkah: Boolean = true
  private var theme: NativeReaderTheme = NativeReaderTheme.default()

  fun bind(isMakkah: Boolean, theme: NativeReaderTheme) {
    this.isMakkah = isMakkah
    this.theme = theme
    invalidate()
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val width = width.toFloat()
    val height = height.toFloat()
    val dark = luminance(theme.backgroundColor) < 0.35f

    val bgColor =
        if (isMakkah) {
          if (dark) Color.rgb(39, 33, 27) else Color.rgb(253, 247, 234)
        } else {
          if (dark) Color.rgb(21, 34, 27) else Color.rgb(238, 246, 242)
        }
    val mutedShape =
        if (isMakkah) {
          if (dark) Color.rgb(80, 66, 51) else Color.rgb(222, 207, 162)
        } else {
          if (dark) Color.rgb(46, 71, 59) else Color.rgb(198, 220, 208)
        }
    val primaryShape =
        if (isMakkah) {
          if (dark) Color.rgb(12, 10, 9) else Color.rgb(28, 25, 23)
        } else {
          if (dark) Color.rgb(67, 157, 122) else Color.rgb(40, 120, 92)
        }
    val secondaryShape =
        if (isMakkah) {
          if (dark) Color.rgb(184, 146, 42) else Color.rgb(197, 160, 40)
        } else {
          if (dark) Color.rgb(52, 130, 99) else Color.rgb(30, 94, 69)
        }

    path.reset()
    path.moveTo(width * 0.28f, height)
    path.cubicTo(width * 0.28f, height * 0.38f, width * 0.48f, height * 0.19f, width * 0.65f, height * 0.19f)
    path.cubicTo(width * 0.82f, height * 0.19f, width, height * 0.38f, width, height)
    path.close()
    paint.color = bgColor
    paint.style = Paint.Style.FILL
    canvas.drawPath(path, paint)

    paint.color = mutedShape
    paint.strokeWidth = dp(2f)
    paint.strokeCap = Paint.Cap.ROUND
    canvas.drawLine(width * 0.16f, height * 0.92f, width * 0.92f, height * 0.92f, paint)
    drawMinaret(canvas, width * 0.42f, height * 0.18f, height * 0.88f, mutedShape)
    drawMinaret(canvas, width * 0.82f, height * 0.25f, height * 0.88f, mutedShape)

    if (isMakkah) {
      drawKaaba(canvas, width, height, primaryShape, secondaryShape, dark)
    } else {
      drawDome(canvas, width, height, primaryShape, secondaryShape, dark)
    }
  }

  private fun drawMinaret(canvas: Canvas, x: Float, top: Float, bottom: Float, color: Int) {
    paint.color = color
    paint.style = Paint.Style.FILL
    val shaftWidth = dp(4f)
    canvas.drawRoundRect(RectF(x - shaftWidth / 2, top, x + shaftWidth / 2, bottom), dp(0.6f), dp(0.6f), paint)
    canvas.drawRoundRect(RectF(x - dp(4f), top + dp(12f), x + dp(4f), top + dp(14f)), dp(1f), dp(1f), paint)
    path.reset()
    path.moveTo(x - dp(3f), top)
    path.quadTo(x, top - dp(6f), x + dp(3f), top)
    path.close()
    canvas.drawPath(path, paint)
  }

  private fun drawKaaba(canvas: Canvas, width: Float, height: Float, body: Int, gold: Int, dark: Boolean) {
    paint.color = if (dark) Color.argb(110, 0, 0, 0) else Color.argb(38, 139, 115, 85)
    canvas.drawOval(RectF(width * 0.52f, height * 0.84f, width * 0.84f, height * 0.96f), paint)

    paint.color = body
    canvas.drawRect(RectF(width * 0.56f, height * 0.52f, width * 0.79f, height * 0.86f), paint)
    paint.color = adjustColor(body, 1.35f)
    canvas.drawRect(RectF(width * 0.68f, height * 0.55f, width * 0.79f, height * 0.86f), paint)
    paint.color = gold
    canvas.drawRect(RectF(width * 0.56f, height * 0.60f, width * 0.79f, height * 0.64f), paint)
    canvas.drawRect(RectF(width * 0.70f, height * 0.70f, width * 0.75f, height * 0.86f), paint)
  }

  private fun drawDome(canvas: Canvas, width: Float, height: Float, dome: Int, base: Int, dark: Boolean) {
    paint.color = if (dark) Color.argb(115, 0, 0, 0) else Color.argb(46, 78, 104, 91)
    canvas.drawOval(RectF(width * 0.49f, height * 0.84f, width * 0.88f, height * 0.95f), paint)

    paint.color = base
    canvas.drawRoundRect(RectF(width * 0.50f, height * 0.80f, width * 0.76f, height * 0.91f), dp(1f), dp(1f), paint)
    paint.color = adjustColor(dome, 0.82f)
    canvas.drawRoundRect(RectF(width * 0.53f, height * 0.72f, width * 0.73f, height * 0.81f), dp(1f), dp(1f), paint)
    paint.color = dome
    path.reset()
    path.moveTo(width * 0.52f, height * 0.73f)
    path.cubicTo(width * 0.50f, height * 0.58f, width * 0.56f, height * 0.46f, width * 0.63f, height * 0.45f)
    path.cubicTo(width * 0.71f, height * 0.46f, width * 0.77f, height * 0.58f, width * 0.75f, height * 0.73f)
    path.close()
    canvas.drawPath(path, paint)
    paint.color = Color.rgb(197, 160, 40)
    paint.strokeWidth = dp(1.2f)
    canvas.drawLine(width * 0.63f, height * 0.45f, width * 0.63f, height * 0.31f, paint)
  }

  private fun adjustColor(color: Int, factor: Float): Int {
    return Color.rgb(
        (Color.red(color) * factor).toInt().coerceIn(0, 255),
        (Color.green(color) * factor).toInt().coerceIn(0, 255),
        (Color.blue(color) * factor).toInt().coerceIn(0, 255),
    )
  }

  private fun luminance(color: Int): Float {
    return (0.2126f * Color.red(color) + 0.7152f * Color.green(color) + 0.0722f * Color.blue(color)) / 255f
  }

  private fun dp(value: Float): Float {
    return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, resources.displayMetrics)
  }
}
