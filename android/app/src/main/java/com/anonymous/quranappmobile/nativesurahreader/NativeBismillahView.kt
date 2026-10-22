package com.anonymous.quranappmobile.nativesurahreader

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.drawable.Drawable
import android.view.View
import android.widget.FrameLayout
import androidx.core.content.ContextCompat
import com.anonymous.quranappmobile.R

internal class NativeBismillahView(context: Context) : FrameLayout(context) {
  private val ornamentView = NativeBismillahOrnamentView(context)
  private val calligraphyView = NativeBismillahCalligraphyView(context)

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
    calligraphyView.bind(artworkColor)
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val width = MeasureSpec.getSize(widthMeasureSpec)
    // Wide layouts (landscape, tablets) stretch the frame horizontally instead of scaling it up.
    val desiredHeight =
        minOf(Math.round(width * BISMILLAH_FRAME_HEIGHT / BISMILLAH_FRAME_WIDTH), dp(MAX_HEIGHT_DP))
    val resolvedHeight = resolveSize(desiredHeight, heightMeasureSpec)
    updateCalligraphyInsets(width, resolvedHeight)
    super.onMeasure(
        MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
        MeasureSpec.makeMeasureSpec(resolvedHeight, MeasureSpec.EXACTLY),
    )
  }

  private fun updateCalligraphyInsets(width: Int, height: Int) {
    val params = calligraphyView.layoutParams as LayoutParams
    // Clears the cartouche tips and leaf accents, kept at the frame's uniform scale.
    val horizontalInset = Math.round(height * CALLIGRAPHY_SIDE_INSET / BISMILLAH_FRAME_HEIGHT)
    params.leftMargin = horizontalInset
    params.rightMargin = horizontalInset
    params.topMargin = Math.round(height * 0.23f)
    params.bottomMargin = Math.round(height * 0.23f)
  }

  private fun luminance(color: Int): Float {
    return (0.2126f * Color.red(color) + 0.7152f * Color.green(color) + 0.0722f * Color.blue(color)) / 255f
  }

  private fun dp(value: Int): Int {
    return (value * resources.displayMetrics.density).toInt()
  }
}

/**
 * Draws the calligraphy at its true proportions and lengthens only the kashida (the long stroke
 * between "بسـ" and "ـم") to fill wide frames, the way a calligrapher would.
 */
private class NativeBismillahCalligraphyView(context: Context) : View(context) {
  private val drawable: Drawable? =
      ContextCompat.getDrawable(context, R.drawable.native_bismillah_calligraphy)?.mutate()

  fun bind(color: Int) {
    drawable?.setTint(color)
    invalidate()
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val artwork = drawable ?: return
    if (width <= 0 || height <= 0) return

    val scale = minOf(height / CALLIGRAPHY_VIEWPORT_HEIGHT, width / CALLIGRAPHY_VIEWPORT_WIDTH)
    val naturalWidth = CALLIGRAPHY_VIEWPORT_WIDTH * scale
    val naturalHeight = CALLIGRAPHY_VIEWPORT_HEIGHT * scale
    val extra = width - naturalWidth
    val top = (height - naturalHeight) / 2f
    artwork.setBounds(0, 0, Math.round(naturalWidth), Math.round(naturalHeight))

    val kashidaStart = KASHIDA_START * scale
    val kashidaWidth = (KASHIDA_END - KASHIDA_START) * scale
    val stretchedEnd = kashidaStart + kashidaWidth + extra

    // Letters before the kashida, drawn as-is.
    var saveCount = canvas.save()
    canvas.clipRect(0f, 0f, kashidaStart, height.toFloat())
    canvas.translate(0f, top)
    artwork.draw(canvas)
    canvas.restoreToCount(saveCount)

    // The kashida, stretched horizontally only.
    saveCount = canvas.save()
    canvas.clipRect(kashidaStart, 0f, stretchedEnd, height.toFloat())
    canvas.translate(kashidaStart, top)
    canvas.scale((kashidaWidth + extra) / kashidaWidth, 1f)
    canvas.translate(-kashidaStart, 0f)
    artwork.draw(canvas)
    canvas.restoreToCount(saveCount)

    // Letters after the kashida, shifted by the added length.
    saveCount = canvas.save()
    canvas.clipRect(stretchedEnd, 0f, width.toFloat(), height.toFloat())
    canvas.translate(extra, top)
    artwork.draw(canvas)
    canvas.restoreToCount(saveCount)
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

    // Uniform scale keeps the end medallions round; extra width only lengthens the straight runs.
    val scale = height / BISMILLAH_FRAME_HEIGHT
    val frameWidth = width / scale
    val saveCount = canvas.save()
    canvas.scale(scale, scale)
    paint.color = artworkColor
    paint.strokeWidth = 1.15f

    canvas.drawRoundRect(RectF(2f, 2f, frameWidth - 2f, 74f), 3f, 3f, paint)
    canvas.drawRoundRect(RectF(6f, 6f, frameWidth - 6f, 70f), 2f, 2f, paint)
    drawOrnamentEnd(canvas, frameWidth, false)
    drawOrnamentEnd(canvas, frameWidth, true)
    drawCartouche(canvas, frameWidth)
    canvas.restoreToCount(saveCount)
  }

  private fun drawCartouche(canvas: Canvas, frameWidth: Float) {
    drawCartouchePath(canvas, 80f, 105f, frameWidth - 105f, frameWidth - 80f, 24f)
    drawCartouchePath(canvas, 84f, 108f, frameWidth - 108f, frameWidth - 84f, 21f)

    drawDiamond(canvas, 112f, 21f, 4f)
    drawDiamond(canvas, frameWidth - 104f, 21f, 4f)
    drawDiamond(canvas, 112f, 55f, 4f)
    drawDiamond(canvas, frameWidth - 104f, 55f, 4f)
    drawLeafAccent(canvas, 97f, false)
    drawLeafAccent(canvas, frameWidth - 97f, true)
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

  private fun drawOrnamentEnd(canvas: Canvas, frameWidth: Float, mirrored: Boolean) {
    val saveCount = canvas.save()
    if (mirrored) {
      canvas.translate(frameWidth, 0f)
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
private const val CALLIGRAPHY_SIDE_INSET = 132f
private const val MAX_HEIGHT_DP = 52
private const val CALLIGRAPHY_VIEWPORT_WIDTH = 11523f
private const val CALLIGRAPHY_VIEWPORT_HEIGHT = 1583f
// Viewport x-range of native_bismillah_calligraphy that contains only the kashida stroke.
private const val KASHIDA_START = 4960f
private const val KASHIDA_END = 10700f
