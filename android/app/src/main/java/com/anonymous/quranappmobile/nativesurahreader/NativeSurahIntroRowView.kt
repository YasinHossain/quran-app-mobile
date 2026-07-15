package com.anonymous.quranappmobile.nativesurahreader

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView

internal class NativeSurahIntroRowView(context: Context) : LinearLayout(context) {
  private val titleView =
      TextView(context).apply {
        textSize = 24f
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

    val sx = width / 136f
    val sy = height / 78f

    path.reset()
    path.moveTo(x(40f, sx), y(78f, sy))
    path.cubicTo(
        x(40f, sx),
        y(30f, sy),
        x(65f, sx),
        y(15f, sy),
        x(88f, sx),
        y(15f, sy),
    )
    path.cubicTo(
        x(111f, sx),
        y(15f, sy),
        x(136f, sx),
        y(30f, sy),
        x(136f, sx),
        y(78f, sy),
    )
    path.close()
    paint.color = bgColor
    paint.style = Paint.Style.FILL
    canvas.drawPath(path, paint)

    paint.color = mutedShape
    paint.strokeWidth = scaledStroke(1.8f, sx, sy)
    paint.strokeCap = Paint.Cap.ROUND
    canvas.drawLine(x(28f, sx), y(72f, sy), x(126f, sx), y(72f, sy), paint)

    if (isMakkah) {
      drawMinaret(canvas, 54f, 50f, mutedShape, sx, sy)
      drawMinaret(canvas, 68f, 56f, mutedShape, sx, sy)
      drawMinaret(canvas, 122f, 44f, mutedShape, sx, sy)
      drawMosqueArches(canvas, 62f, mutedShape, sx, sy)
      drawKaaba(canvas, primaryShape, secondaryShape, dark, sx, sy)
    } else {
      drawMinaret(canvas, 52f, 54f, mutedShape, sx, sy)
      drawMinaret(canvas, 118f, 50f, mutedShape, sx, sy)
      drawMosqueArches(canvas, 64f, mutedShape, sx, sy)
      drawDome(canvas, primaryShape, dark, sx, sy)
    }
  }

  private fun drawMinaret(canvas: Canvas, baseX: Float, minaretHeight: Float, color: Int, sx: Float, sy: Float) {
    val baseY = 78f
    val topY = baseY - minaretHeight
    val shaftWidth = 3.5f
    val balconyWidth = 6.5f
    val x = x(baseX, sx)
    val top = y(topY, sy)
    val bottom = y(baseY, sy)
    paint.color = color
    paint.alpha = 217
    paint.style = Paint.Style.FILL
    canvas.drawRoundRect(
        RectF(x - w(shaftWidth / 2f, sx), top, x + w(shaftWidth / 2f, sx), bottom),
        w(0.5f, sx),
        h(0.5f, sy),
        paint,
    )
    drawBalcony(canvas, baseX, topY + minaretHeight * 0.45f, balconyWidth, sx, sy)
    drawBalcony(canvas, baseX, topY + minaretHeight * 0.15f, balconyWidth, sx, sy)

    path.reset()
    path.moveTo(x(baseX - 2.2f, sx), y(topY, sy))
    path.quadTo(x(baseX - 2.7f, sx), y(topY - 3.5f, sy), x(baseX, sx), y(topY - 4.5f, sy))
    path.quadTo(x(baseX + 2.7f, sx), y(topY - 3.5f, sy), x(baseX + 2.2f, sx), y(topY, sy))
    path.close()
    canvas.drawPath(path, paint)

    paint.style = Paint.Style.STROKE
    paint.strokeWidth = scaledStroke(0.8f, sx, sy)
    canvas.drawLine(x(baseX, sx), y(topY - 4.5f, sy), x(baseX, sx), y(topY - 7.5f, sy), paint)
    paint.alpha = 255
    paint.style = Paint.Style.FILL
  }

  private fun drawBalcony(canvas: Canvas, baseX: Float, yValue: Float, balconyWidth: Float, sx: Float, sy: Float) {
    val cy = y(yValue, sy)
    canvas.drawRoundRect(
        RectF(x(baseX - balconyWidth / 2f, sx), cy, x(baseX + balconyWidth / 2f, sx), cy + h(2f, sy)),
        w(0.3f, sx),
        h(0.3f, sy),
        paint,
    )
  }

  private fun drawMosqueArches(canvas: Canvas, topY: Float, color: Int, sx: Float, sy: Float) {
    paint.color = color
    paint.alpha = 128
    paint.style = Paint.Style.FILL
    path.reset()
    val archTop = topY - 4f
    for (left in listOf(45f, 61f, 77f, 93f, 109f)) {
      path.moveTo(x(left, sx), y(78f, sy))
      path.lineTo(x(left, sx), y(topY, sy))
      path.lineTo(x(left + 3f, sx), y(topY, sy))
      path.quadTo(x(left + 8f, sx), y(archTop, sy), x(left + 13f, sx), y(topY, sy))
      path.lineTo(x(left + 16f, sx), y(topY, sy))
      path.lineTo(x(left + 16f, sx), y(78f, sy))
    }
    canvas.drawPath(path, paint)
    paint.alpha = 255
  }

  private fun drawKaaba(canvas: Canvas, body: Int, gold: Int, dark: Boolean, sx: Float, sy: Float) {
    val rightBody = if (dark) Color.rgb(22, 20, 18) else Color.rgb(42, 39, 35)
    val goldLight = if (dark) Color.rgb(211, 171, 59) else Color.rgb(229, 193, 88)

    paint.color = if (dark) Color.argb(110, 0, 0, 0) else Color.argb(38, 139, 115, 85)
    canvas.drawOval(RectF(x(70f, sx), y(65.5f, sy), x(114f, sx), y(74.5f, sy)), paint)

    paint.color = body
    path.reset()
    path.moveTo(x(76f, sx), y(40f, sy))
    path.lineTo(x(92f, sx), y(44f, sy))
    path.lineTo(x(92f, sx), y(70f, sy))
    path.lineTo(x(76f, sx), y(66f, sy))
    path.close()
    canvas.drawPath(path, paint)
    paint.color = rightBody
    path.reset()
    path.moveTo(x(92f, sx), y(44f, sy))
    path.lineTo(x(108f, sx), y(40f, sy))
    path.lineTo(x(108f, sx), y(66f, sy))
    path.lineTo(x(92f, sx), y(70f, sy))
    path.close()
    canvas.drawPath(path, paint)
    paint.color = gold
    path.reset()
    path.moveTo(x(76f, sx), y(45.2f, sy))
    path.lineTo(x(92f, sx), y(49.2f, sy))
    path.lineTo(x(92f, sx), y(51.7f, sy))
    path.lineTo(x(76f, sx), y(47.7f, sy))
    path.close()
    canvas.drawPath(path, paint)
    paint.color = goldLight
    path.reset()
    path.moveTo(x(92f, sx), y(49.2f, sy))
    path.lineTo(x(108f, sx), y(45.2f, sy))
    path.lineTo(x(108f, sx), y(47.7f, sy))
    path.lineTo(x(92f, sx), y(51.7f, sy))
    path.close()
    canvas.drawPath(path, paint)
    path.reset()
    path.moveTo(x(96f, sx), y(68.8f, sy))
    path.lineTo(x(101f, sx), y(67.55f, sy))
    path.lineTo(x(101f, sx), y(54.55f, sy))
    path.lineTo(x(96f, sx), y(55.8f, sy))
    path.close()
    canvas.drawPath(path, paint)
  }

  private fun drawDome(canvas: Canvas, dome: Int, dark: Boolean, sx: Float, sy: Float) {
    val domeBase = if (dark) Color.rgb(46, 71, 59) else Color.rgb(236, 229, 219)

    paint.color = if (dark) Color.argb(115, 0, 0, 0) else Color.argb(46, 78, 104, 91)
    canvas.drawOval(RectF(x(59f, sx), y(66f, sy), x(111f, sx), y(74f, sy)), paint)

    paint.color = domeBase
    canvas.drawRoundRect(RectF(x(68f, sx), y(64f, sy), x(102f, sx), y(71f, sy)), w(0.8f, sx), h(0.8f, sy), paint)
    paint.color = adjustColor(dome, 0.82f)
    canvas.drawRoundRect(RectF(x(72f, sx), y(58f, sy), x(98f, sx), y(64f, sy)), w(0.5f, sx), h(0.5f, sy), paint)
    paint.color = dome
    path.reset()
    path.moveTo(x(70f, sx), y(58f, sy))
    path.cubicTo(x(68f, sx), y(50f, sy), x(74f, sx), y(38f, sy), x(85f, sx), y(36f, sy))
    path.cubicTo(x(96f, sx), y(38f, sy), x(102f, sx), y(50f, sy), x(100f, sx), y(58f, sy))
    path.close()
    canvas.drawPath(path, paint)
    paint.color = Color.rgb(197, 160, 40)
    paint.style = Paint.Style.STROKE
    paint.strokeWidth = scaledStroke(1.2f, sx, sy)
    canvas.drawLine(x(85f, sx), y(36f, sy), x(85f, sx), y(25f, sy), paint)
    paint.style = Paint.Style.FILL
    path.reset()
    path.moveTo(x(85f, sx), y(25f, sy))
    path.cubicTo(x(86.3f, sx), y(25f, sy), x(87.2f, sx), y(25.8f, sy), x(87.2f, sx), y(26.8f, sy))
    path.cubicTo(x(87.2f, sx), y(27.8f, sy), x(86.2f, sx), y(28.6f, sy), x(85f, sx), y(28.6f, sy))
    path.cubicTo(x(85.7f, sx), y(28.6f, sy), x(86.4f, sx), y(28f, sy), x(86.4f, sx), y(26.8f, sy))
    path.cubicTo(x(86.4f, sx), y(25.8f, sy), x(85.7f, sx), y(25.3f, sy), x(85f, sx), y(25f, sy))
    path.close()
    canvas.drawPath(path, paint)
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

  private fun x(value: Float, scale: Float): Float = value * scale

  private fun y(value: Float, scale: Float): Float = value * scale

  private fun w(value: Float, scale: Float): Float = value * scale

  private fun h(value: Float, scale: Float): Float = value * scale

  private fun scaledStroke(value: Float, sx: Float, sy: Float): Float = value * ((sx + sy) / 2f)
}
