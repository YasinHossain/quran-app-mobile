package com.anonymous.quranappmobile.nativesurahreader

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.widget.ImageView
import android.view.View
import android.widget.FrameLayout
import com.anonymous.quranappmobile.R

internal class NativeBismillahView(context: Context) : FrameLayout(context) {
  private val ornamentView = NativeBismillahOrnamentView(context)
  private val calligraphyView =
      ImageView(context).apply {
        setImageResource(R.drawable.native_bismillah_calligraphy)
        scaleType = ImageView.ScaleType.FIT_CENTER
        adjustViewBounds = false
      }

  init {
    addView(ornamentView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    addView(calligraphyView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  fun bind(theme: NativeReaderTheme) {
    val artworkColor =
        if (luminance(theme.backgroundColor) < 0.35f) {
          Color.rgb(213, 222, 217)
        } else {
          Color.rgb(63, 115, 91)
    }
    ornamentView.bind(artworkColor)
    calligraphyView.setColorFilter(artworkColor)
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val width = MeasureSpec.getSize(widthMeasureSpec)
    val desiredHeight = (width * BISMILLAH_FRAME_HEIGHT / BISMILLAH_FRAME_WIDTH).toInt().coerceAtLeast(dp(58))
    val resolvedHeight = resolveSize(desiredHeight, heightMeasureSpec)
    super.onMeasure(widthMeasureSpec, MeasureSpec.makeMeasureSpec(resolvedHeight, MeasureSpec.EXACTLY))
  }

  override fun onSizeChanged(width: Int, height: Int, oldWidth: Int, oldHeight: Int) {
    super.onSizeChanged(width, height, oldWidth, oldHeight)
    val params = calligraphyView.layoutParams as LayoutParams
    params.leftMargin = (width * 0.20f).toInt()
    params.rightMargin = (width * 0.20f).toInt()
    params.topMargin = (height * 0.23f).toInt()
    params.bottomMargin = (height * 0.23f).toInt()
    calligraphyView.layoutParams = params
  }

  private fun luminance(color: Int): Float {
    return (0.2126f * Color.red(color) + 0.7152f * Color.green(color) + 0.0722f * Color.blue(color)) / 255f
  }

  private fun dp(value: Int): Int {
    return (value * resources.displayMetrics.density).toInt()
  }
}

private class NativeBismillahOrnamentView(context: Context) : View(context) {
  private val paint =
      Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
      }
  private val path = Path()
  private var artworkColor: Int = Color.rgb(63, 115, 91)

  fun bind(color: Int) {
    artworkColor = color
    invalidate()
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    if (width <= 0 || height <= 0) return

    val saveCount = canvas.save()
    canvas.scale(width / BISMILLAH_FRAME_WIDTH, height / BISMILLAH_FRAME_HEIGHT)
    paint.color = artworkColor
    paint.strokeWidth = 1.15f

    canvas.drawRoundRect(RectF(2f, 2f, 558f, 74f), 3f, 3f, paint)
    canvas.drawRoundRect(RectF(6f, 6f, 554f, 70f), 2f, 2f, paint)
    drawOrnamentEnd(canvas, false)
    drawOrnamentEnd(canvas, true)
    drawCartouche(canvas)
    canvas.restoreToCount(saveCount)
  }

  private fun drawCartouche(canvas: Canvas) {
    drawCartouchePath(canvas, 80f, 105f, 455f, 480f, 24f)
    drawCartouchePath(canvas, 84f, 108f, 452f, 476f, 21f)

    drawDiamond(canvas, 112f, 21f, 4f)
    drawDiamond(canvas, 456f, 21f, 4f)
    drawDiamond(canvas, 112f, 55f, 4f)
    drawDiamond(canvas, 456f, 55f, 4f)
    drawLeafAccent(canvas, 97f, false)
    drawLeafAccent(canvas, 463f, true)
  }

  private fun drawCartouchePath(
      canvas: Canvas,
      leftTip: Float,
      leftShoulder: Float,
      rightShoulder: Float,
      rightTip: Float,
      bulge: Float,
  ) {
    path.reset()
    path.moveTo(leftTip, 38f)
    path.cubicTo(leftTip + 8f, 38f - bulge, leftShoulder, 38f - bulge, leftShoulder, 38f - bulge)
    path.lineTo(rightShoulder, 38f - bulge)
    path.cubicTo(rightShoulder, 38f - bulge, rightTip - 8f, 38f - bulge, rightTip, 38f)
    path.cubicTo(rightTip - 8f, 38f + bulge, rightShoulder, 38f + bulge, rightShoulder, 38f + bulge)
    path.lineTo(leftShoulder, 38f + bulge)
    path.cubicTo(leftShoulder, 38f + bulge, leftTip + 8f, 38f + bulge, leftTip, 38f)
    path.close()
    canvas.drawPath(path, paint)
  }

  private fun drawOrnamentEnd(canvas: Canvas, mirrored: Boolean) {
    val saveCount = canvas.save()
    if (mirrored) {
      canvas.translate(BISMILLAH_FRAME_WIDTH, 0f)
      canvas.scale(-1f, 1f)
    }

    drawCubicPath(canvas, 6f, 20f, 25f, 20f, 36f, 10f, 43f, 10f, 50f, 10f, 50f, 20f, 80f, 20f)
    drawCubicPath(canvas, 6f, 56f, 25f, 56f, 36f, 66f, 43f, 66f, 50f, 66f, 50f, 56f, 80f, 56f)
    drawCubicPath(canvas, 6f, 23f, 24f, 23f, 36f, 15f, 43f, 15f, 50f, 15f, 50f, 23f, 80f, 23f)
    drawCubicPath(canvas, 6f, 53f, 24f, 53f, 36f, 61f, 43f, 61f, 50f, 61f, 50f, 53f, 80f, 53f)

    canvas.drawCircle(43f, 38f, 20f, paint)
    canvas.drawCircle(43f, 38f, 17f, paint)
    canvas.drawCircle(43f, 38f, 13.5f, paint)
    canvas.drawRoundRect(RectF(34f, 29f, 52f, 47f), 1.5f, 1.5f, paint)
    val starSave = canvas.save()
    canvas.rotate(45f, 43f, 38f)
    canvas.drawRoundRect(RectF(34f, 29f, 52f, 47f), 1.5f, 1.5f, paint)
    canvas.restoreToCount(starSave)
    canvas.drawCircle(43f, 38f, 3.5f, paint)

    drawDiamond(canvas, 43f, 10f, 2.6f)
    drawDiamond(canvas, 43f, 66f, 2.6f)
    drawSideCircle(canvas, 14f)
    drawSideCircle(canvas, 72f)
    drawDiamond(canvas, 80f, 38f, 3.8f)
    canvas.restoreToCount(saveCount)
  }

  private fun drawSideCircle(canvas: Canvas, x: Float) {
    canvas.drawCircle(x, 38f, 5f, paint)
    canvas.drawCircle(x, 38f, 2f, paint)
    canvas.drawLine(x - 8f, 38f, x - 5f, 38f, paint)
    canvas.drawLine(x + 5f, 38f, x + 9f, 38f, paint)
    canvas.drawLine(x, 33f, x, 35f, paint)
    canvas.drawLine(x, 41f, x, 43f, paint)
  }

  private fun drawLeafAccent(canvas: Canvas, centerX: Float, mirrored: Boolean) {
    val direction = if (mirrored) -1f else 1f
    path.reset()
    path.moveTo(centerX - 6f * direction, 38f)
    path.cubicTo(centerX - 2f * direction, 33f, centerX + 2f * direction, 33f, centerX + 6f * direction, 38f)
    path.cubicTo(centerX + 2f * direction, 43f, centerX - 2f * direction, 43f, centerX - 6f * direction, 38f)
    path.close()
    canvas.drawPath(path, paint)
    canvas.drawCircle(centerX, 38f, 1.35f, paint)
    canvas.drawLine(centerX + 6f * direction, 38f, centerX + 11f * direction, 38f, paint)
  }

  private fun drawDiamond(canvas: Canvas, centerX: Float, centerY: Float, radius: Float) {
    path.reset()
    path.moveTo(centerX, centerY - radius)
    path.lineTo(centerX + radius, centerY)
    path.lineTo(centerX, centerY + radius)
    path.lineTo(centerX - radius, centerY)
    path.close()
    canvas.drawPath(path, paint)
  }

  private fun drawCubicPath(
      canvas: Canvas,
      startX: Float,
      startY: Float,
      c1x: Float,
      c1y: Float,
      c2x: Float,
      c2y: Float,
      endX: Float,
      endY: Float,
      c3x: Float,
      c3y: Float,
      c4x: Float,
      c4y: Float,
      end2X: Float,
      end2Y: Float,
  ) {
    path.reset()
    path.moveTo(startX, startY)
    path.cubicTo(c1x, c1y, c2x, c2y, endX, endY)
    path.cubicTo(c3x, c3y, c4x, c4y, end2X, end2Y)
    canvas.drawPath(path, paint)
  }
}

private const val BISMILLAH_FRAME_WIDTH = 560f
private const val BISMILLAH_FRAME_HEIGHT = 76f
