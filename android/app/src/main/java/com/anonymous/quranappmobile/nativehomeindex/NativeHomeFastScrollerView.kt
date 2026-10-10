package com.anonymous.quranappmobile.nativehomeindex

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.view.MotionEvent
import android.view.View
import com.facebook.react.uimanager.PointerEvents
import com.facebook.react.uimanager.ReactPointerEventsView
import kotlin.math.roundToInt

internal class NativeHomeFastScrollerView(
    context: android.content.Context,
    private val labelForIndex: (Int) -> String,
    private val onScrollToIndex: (Int) -> Unit,
) : View(context), ReactPointerEventsView {
  // The scroller spans the screen so its drag label can extend beside the track.
  // Keep it out of React Native hit testing; native onTouchEvent still receives
  // drags on the right edge, while the React header beneath receives presses.
  override val pointerEvents: PointerEvents = PointerEvents.NONE
  private val density = resources.displayMetrics.density
  private val scaledDensity = density * resources.configuration.fontScale
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val thumbBounds = RectF()
  private val labelBounds = RectF()
  private val thumbWidth = 4f * density
  private val thumbHeight = 72f * density
  private val edgeTouchWidth = 32f * density
  private val thumbRightInset = 7f * density
  private val trackInset = 8f * density
  private val labelRightInset = 22f * density
  private val labelMinWidth = 72f * density
  private val labelMaxWidth = 220f * density
  private val labelHorizontalPadding = 10f * density
  private val labelVerticalPadding = 7f * density
  private val labelRadius = 8f * density
  private var thumbColor = Color.rgb(13, 148, 136)
  private var labelBackgroundColor = Color.argb(245, 255, 255, 255)
  private var labelBorderColor = Color.argb(36, 15, 23, 42)
  private var labelTextColor = Color.rgb(55, 65, 81)
  private var itemCount = 0
  private var currentIndex = 0
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

  fun setBottomInset(value: Int) {
    bottomInset = value.coerceAtLeast(0)
    updateThumbTopFromIndex()
  }

  fun setTheme(theme: NativeHomeIndexTheme) {
    thumbColor = theme.accentColor
    labelTextColor = theme.primaryTextColor
    val dark = brightness(theme.backgroundColor) < 128f
    labelBackgroundColor = if (dark) Color.argb(244, 15, 23, 42) else Color.argb(248, 255, 255, 255)
    labelBorderColor = if (dark) Color.argb(82, 148, 163, 184) else Color.argb(36, 15, 23, 42)
    invalidate()
  }

  fun updatePosition(index: Int, count: Int, reveal: Boolean) {
    itemCount = count.coerceAtLeast(0)
    currentIndex = index.coerceIn(0, (itemCount - 1).coerceAtLeast(0))
    if (!dragging) updateThumbTopFromIndex()
    if (itemCount <= 1) {
      removeCallbacks(hideRunnable)
      animate().cancel()
      alpha = 0f
    } else if (reveal) {
      showTemporarily()
    }
    invalidate()
  }

  override fun onSizeChanged(width: Int, height: Int, oldWidth: Int, oldHeight: Int) {
    updateThumbTopFromIndex()
  }

  override fun onDraw(canvas: Canvas) {
    if (itemCount <= 1 || height <= 0) return
    val actualHeight = effectiveThumbHeight()
    val right = width - thumbRightInset
    thumbBounds.set(right - thumbWidth, thumbTop, right, thumbTop + actualHeight)
    if (dragging) drawLabel(canvas, actualHeight)
    paint.style = Paint.Style.FILL
    paint.color = thumbColor
    canvas.drawRoundRect(thumbBounds, thumbWidth / 2f, thumbWidth / 2f, paint)
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (itemCount <= 1 || event.x < width - edgeTouchWidth) return false
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        removeCallbacks(hideRunnable)
        animate().cancel()
        alpha = 1f
        hiding = false
        dragging = true
        val nearThumb = event.y >= thumbTop - 12f * density && event.y <= thumbTop + effectiveThumbHeight() + 12f * density
        dragOffsetY = if (nearThumb) event.y - thumbTop else effectiveThumbHeight() / 2f
        parent?.requestDisallowInterceptTouchEvent(true)
        moveThumbTo(event.y - dragOffsetY)
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

  private fun moveThumbTo(top: Float) {
    val travel = trackTravel()
    thumbTop = top.coerceIn(trackInset, trackInset + travel)
    val next = if (travel <= 0f) 0 else (((thumbTop - trackInset) / travel) * (itemCount - 1)).roundToInt()
    if (next != currentIndex) {
      currentIndex = next
      onScrollToIndex(next)
    }
    invalidate()
  }

  private fun updateThumbTopFromIndex() {
    val fraction = if (itemCount <= 1) 0f else currentIndex.toFloat() / (itemCount - 1)
    thumbTop = trackInset + trackTravel() * fraction
  }

  private fun effectiveThumbHeight() = thumbHeight.coerceAtMost(trackHeight())
  private fun trackHeight() = (height - trackInset * 2f - bottomInset).coerceAtLeast(0f)
  private fun trackTravel() = (trackHeight() - effectiveThumbHeight()).coerceAtLeast(0f)

  private fun showTemporarily() {
    removeCallbacks(hideRunnable)
    if (alpha < 1f || hiding) {
      hiding = false
      animate().cancel()
      animate().alpha(1f).setDuration(90L).setListener(null).start()
    }
    if (!dragging) postDelayed(hideRunnable, 750L)
  }

  private fun hide() {
    if (dragging) return
    hiding = true
    animate().alpha(0f).setDuration(160L).setListener(object : AnimatorListenerAdapter() {
      override fun onAnimationEnd(animation: Animator) { hiding = false }
    }).start()
  }

  private fun drawLabel(canvas: Canvas, thumbActualHeight: Float) {
    val label = labelForIndex(currentIndex)
    val metrics = labelPaint.fontMetrics
    val textHeight = metrics.descent - metrics.ascent
    val labelWidth = (labelPaint.measureText(label) + labelHorizontalPadding * 2f)
        .coerceIn(labelMinWidth, labelMaxWidth)
    val labelHeight = textHeight + labelVerticalPadding * 2f
    val right = width - labelRightInset
    val desiredTop = thumbTop + thumbActualHeight / 2f - labelHeight / 2f
    val maxTop = (trackInset + trackHeight() - labelHeight).coerceAtLeast(trackInset)
    val top = desiredTop.coerceIn(trackInset, maxTop)
    labelBounds.set(right - labelWidth, top, right, top + labelHeight)
    paint.style = Paint.Style.FILL
    paint.color = labelBackgroundColor
    canvas.drawRoundRect(labelBounds, labelRadius, labelRadius, paint)
    paint.style = Paint.Style.STROKE
    paint.strokeWidth = density
    paint.color = labelBorderColor
    canvas.drawRoundRect(labelBounds, labelRadius, labelRadius, paint)
    paint.style = Paint.Style.FILL
    labelPaint.color = labelTextColor
    val ellipsized = android.text.TextUtils.ellipsize(
        label,
        android.text.TextPaint(labelPaint),
        labelWidth - labelHorizontalPadding * 2f,
        android.text.TextUtils.TruncateAt.END,
    ).toString()
    val baseline = labelBounds.centerY() - (metrics.ascent + metrics.descent) / 2f
    canvas.drawText(ellipsized, labelBounds.centerX(), baseline, labelPaint)
  }

  private fun brightness(color: Int): Float =
      Color.red(color) * 0.299f + Color.green(color) * 0.587f + Color.blue(color) * 0.114f
}
