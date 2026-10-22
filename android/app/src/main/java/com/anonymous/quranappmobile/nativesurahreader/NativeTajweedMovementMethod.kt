package com.anonymous.quranappmobile.nativesurahreader

import android.text.Layout
import android.text.Selection
import android.text.Spannable
import android.text.method.LinkMovementMethod
import android.text.style.ClickableSpan
import android.view.MotionEvent
import android.view.ViewConfiguration
import android.widget.TextView
import kotlin.math.abs

/**
 * LinkMovementMethod that permits long-press detection on ClickableSpans without
 * firing span onClick on release, preserving Word Study taps and smooth RecyclerView scrolling.
 */
internal class NativeTajweedMovementMethod : LinkMovementMethod() {
  private var downX = 0f
  private var downY = 0f
  private var hasPerformedLongPress = false
  private var pendingLongPressRunnable: Runnable? = null
  private var touchSlop = 0

  override fun onTouchEvent(widget: TextView, buffer: Spannable, event: MotionEvent): Boolean {
    val action = event.actionMasked

    if (touchSlop == 0) {
      touchSlop = ViewConfiguration.get(widget.context).scaledTouchSlop
    }

    when (action) {
      MotionEvent.ACTION_DOWN -> {
        downX = event.x
        downY = event.y
        hasPerformedLongPress = false
        cancelPendingLongPress(widget)

        val link = findClickableSpan(widget, buffer, event)
        if (link != null) {
          Selection.setSelection(buffer, buffer.getSpanStart(link), buffer.getSpanEnd(link))
          val longPressTimeout = ViewConfiguration.getLongPressTimeout().toLong()
          val runnable = Runnable {
            hasPerformedLongPress = true
            Selection.removeSelection(buffer)
            widget.performLongClick()
          }
          pendingLongPressRunnable = runnable
          widget.postDelayed(runnable, longPressTimeout)
          return true
        } else {
          Selection.removeSelection(buffer)
        }
      }

      MotionEvent.ACTION_MOVE -> {
        if (!hasPerformedLongPress && pendingLongPressRunnable != null) {
          if (abs(event.x - downX) > touchSlop || abs(event.y - downY) > touchSlop) {
            cancelPendingLongPress(widget)
          }
        }
      }

      MotionEvent.ACTION_UP -> {
        val wasLongPress = hasPerformedLongPress
        cancelPendingLongPress(widget)
        hasPerformedLongPress = false

        if (wasLongPress) {
          Selection.removeSelection(buffer)
          return true
        }

        val link = findClickableSpan(widget, buffer, event)
        if (link != null) {
          link.onClick(widget)
          Selection.removeSelection(buffer)
          return true
        } else {
          Selection.removeSelection(buffer)
        }
      }

      MotionEvent.ACTION_CANCEL -> {
        cancelPendingLongPress(widget)
        hasPerformedLongPress = false
        Selection.removeSelection(buffer)
      }
    }

    return super.onTouchEvent(widget, buffer, event)
  }

  fun cancel(widget: TextView) {
    cancelPendingLongPress(widget)
    hasPerformedLongPress = false
  }

  private fun cancelPendingLongPress(widget: TextView) {
    pendingLongPressRunnable?.let {
      widget.removeCallbacks(it)
      pendingLongPressRunnable = null
    }
  }

  private fun findClickableSpan(widget: TextView, buffer: Spannable, event: MotionEvent): ClickableSpan? {
    val x = event.x.toInt() - widget.totalPaddingLeft + widget.scrollX
    val y = event.y.toInt() - widget.totalPaddingTop + widget.scrollY

    val layout: Layout = widget.layout ?: return null
    val line = layout.getLineForVertical(y)
    val off = layout.getOffsetForHorizontal(line, x.toFloat())

    val links = buffer.getSpans(off, off, ClickableSpan::class.java)
    return links.firstOrNull()
  }
}
