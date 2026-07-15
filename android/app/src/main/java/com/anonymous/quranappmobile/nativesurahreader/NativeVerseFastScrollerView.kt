package com.anonymous.quranappmobile.nativesurahreader

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.view.MotionEvent
import android.view.View
import kotlin.math.roundToInt

/**
 * Verse-aware fast scroller for the native translation reader.
 *
 * RecyclerView's bundled fast scroller sizes its thumb from estimated pixel range. Quran rows vary
 * heavily with Arabic font, Tajweed, and translation selection, which can shrink that thumb to only
 * a few pixels. This view keeps a stable grab handle and performs verse jumps entirely on the
 * Android UI thread, avoiding the React bridge during a drag. Its drawing matches the shared React
 * Native IndexScrubber so switching reader surfaces does not introduce a visual change.
 */
internal class NativeVerseFastScrollerView(
    context: android.content.Context,
    private val onScrollToVerseIndex: (Int) -> Unit,
) : View(context) {
  private val density = resources.displayMetrics.density
  private val scaledDensity = density * resources.configuration.fontScale
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val thumbBounds = RectF()
  private val labelBounds = RectF()
  private val thumbWidth = 4f * density
  private val thumbHeight = 72f * density
  private val thumbRadius = thumbWidth / 2f
  private val touchSlop = 8f * density
  private val edgeTouchWidth = 24f * density
  private val thumbRightInset = 7f * density
  private val trackSideInset = 8f * density
  private val labelRightInset = 22f * density
  private val labelMinWidth = 64f * density
  private val labelHorizontalPadding = 10f * density
  private val labelVerticalPadding = 7f * density
  private val labelRadius = 8f * density
  private var thumbColor = Color.rgb(13, 148, 136)
  private var labelBackgroundColor = Color.argb(245, 255, 255, 255)
  private var labelBorderColor = Color.argb(36, 15, 23, 42)
  private var labelTextColor = Color.rgb(55, 65, 81)
  private var itemCount = 0
  private var currentIndex = 0
  private var topInset = 0
  private var bottomInset = 0
  private var thumbTop = 0f
  private var dragOffsetY = 0f
  private var dragging = false
  private var hiding = false

  private val hideRunnable = Runnable { hide() }

  init {
    alpha = 0f
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
    labelPaint.textSize = 13f * scaledDensity
    labelPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    labelPaint.textAlign = Paint.Align.CENTER
  }

  fun setInsets(top: Int, bottom: Int) {
    topInset = top.coerceAtLeast(0)
    bottomInset = bottom.coerceAtLeast(0)
    updateThumbTopFromIndex()
    invalidate()
  }

  fun setColors(backgroundColor: Int, textColor: Int, tintColor: Int) {
    val relativeBrightness =
        Color.red(backgroundColor) * 0.299f +
            Color.green(backgroundColor) * 0.587f +
            Color.blue(backgroundColor) * 0.114f
    val isDark = relativeBrightness < 128f
    thumbColor = tintColor
    labelTextColor = textColor
    labelBackgroundColor =
        if (isDark) Color.argb(240, 15, 23, 42) else Color.argb(245, 255, 255, 255)
    labelBorderColor =
        if (isDark) Color.argb(82, 148, 163, 184) else Color.argb(36, 15, 23, 42)
    invalidate()
  }

  fun updatePosition(index: Int, count: Int, reveal: Boolean) {
    itemCount = count.coerceAtLeast(0)
    currentIndex = index.coerceIn(0, (itemCount - 1).coerceAtLeast(0))
    if (!dragging) {
      updateThumbTopFromIndex()
    }
    if (itemCount <= 1) {
      removeCallbacks(hideRunnable)
      animate().cancel()
      alpha = 0f
      invalidate()
      return
    }
    if (reveal) showTemporarily()
    invalidate()
  }

  override fun onSizeChanged(width: Int, height: Int, oldWidth: Int, oldHeight: Int) {
    super.onSizeChanged(width, height, oldWidth, oldHeight)
    updateThumbTopFromIndex()
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    if (itemCount <= 1 || height <= 0) return
    val actualHeight = effectiveThumbHeight()
    val right = width - thumbRightInset
    thumbBounds.set(right - thumbWidth, thumbTop, right, thumbTop + actualHeight)
    if (dragging) drawVerseLabel(canvas, actualHeight)
    paint.style = Paint.Style.FILL
    paint.color = thumbColor
    canvas.drawRoundRect(thumbBounds, thumbRadius, thumbRadius, paint)
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (itemCount <= 1) return false
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        if (alpha < 0.05f || event.x < width - edgeTouchWidth || !isNearThumb(event.y)) {
          return false
        }
        removeCallbacks(hideRunnable)
        animate().cancel()
        alpha = 1f
        hiding = false
        dragging = true
        dragOffsetY = event.y - thumbTop
        parent?.requestDisallowInterceptTouchEvent(true)
        invalidate()
        return true
      }
      MotionEvent.ACTION_MOVE -> {
        if (!dragging) return false
        moveThumbTo(event.y - dragOffsetY)
        return true
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        if (!dragging) return false
        moveThumbTo(event.y - dragOffsetY)
        dragging = false
        parent?.requestDisallowInterceptTouchEvent(false)
        invalidate()
        showTemporarily()
        performClick()
        return true
      }
    }
    return dragging
  }

  override fun performClick(): Boolean {
    super.performClick()
    return true
  }

  private fun moveThumbTo(proposedTop: Float) {
    val trackTop = trackTop()
    val travel = trackTravel()
    thumbTop = proposedTop.coerceIn(trackTop, trackTop + travel)
    val nextIndex =
        if (travel <= 0f) 0
        else (((thumbTop - trackTop) / travel) * (itemCount - 1)).roundToInt()
    if (nextIndex != currentIndex) {
      currentIndex = nextIndex
      onScrollToVerseIndex(nextIndex)
    }
    invalidate()
  }

  private fun updateThumbTopFromIndex() {
    val travel = trackTravel()
    val fraction =
        if (itemCount <= 1) 0f else currentIndex.toFloat() / (itemCount - 1).toFloat()
    thumbTop = trackTop() + travel * fraction
  }

  private fun isNearThumb(y: Float): Boolean {
    return y >= thumbTop - touchSlop && y <= thumbTop + effectiveThumbHeight() + touchSlop
  }

  private fun effectiveThumbHeight(): Float = thumbHeight.coerceAtMost(trackHeight())

  private fun trackTop(): Float = (topInset + trackSideInset).coerceAtLeast(trackSideInset)

  private fun trackHeight(): Float =
      (height - trackTop() - (bottomInset + trackSideInset).coerceAtLeast(trackSideInset))
          .coerceAtLeast(0f)

  private fun trackTravel(): Float = (trackHeight() - effectiveThumbHeight()).coerceAtLeast(0f)

  private fun showTemporarily() {
    removeCallbacks(hideRunnable)
    if (alpha < 1f || hiding) {
      hiding = false
      animate().cancel()
      animate().alpha(1f).setDuration(90L).setListener(null).start()
    }
    if (!dragging) postDelayed(hideRunnable, 650L)
  }

  private fun hide() {
    if (dragging) return
    hiding = true
    animate()
        .alpha(0f)
        .setDuration(160L)
        .setListener(
            object : AnimatorListenerAdapter() {
              override fun onAnimationEnd(animation: Animator) {
                hiding = false
              }
            },
        )
        .start()
  }

  private fun drawVerseLabel(canvas: Canvas, actualThumbHeight: Float) {
    val label = "${currentIndex + 1}/$itemCount"
    val fontMetrics = labelPaint.fontMetrics
    val textHeight = fontMetrics.descent - fontMetrics.ascent
    val measuredWidth = labelPaint.measureText(label) + labelHorizontalPadding * 2f
    val labelWidth = measuredWidth.coerceAtLeast(labelMinWidth)
    val labelHeight = textHeight + labelVerticalPadding * 2f
    val labelRight = width - labelRightInset
    val desiredTop = thumbTop + actualThumbHeight / 2f - labelHeight / 2f
    val maximumLabelTop =
        (trackTop() + trackHeight() - labelHeight).coerceAtLeast(trackTop())
    val labelTop = desiredTop.coerceIn(trackTop(), maximumLabelTop)
    labelBounds.set(labelRight - labelWidth, labelTop, labelRight, labelTop + labelHeight)

    paint.style = Paint.Style.FILL
    paint.color = labelBackgroundColor
    canvas.drawRoundRect(labelBounds, labelRadius, labelRadius, paint)
    paint.style = Paint.Style.STROKE
    paint.strokeWidth = 1f
    paint.color = labelBorderColor
    canvas.drawRoundRect(labelBounds, labelRadius, labelRadius, paint)

    labelPaint.color = labelTextColor
    val textBaseline = labelBounds.centerY() - (fontMetrics.ascent + fontMetrics.descent) / 2f
    canvas.drawText(label, labelBounds.centerX(), textBaseline, labelPaint)
  }
}
