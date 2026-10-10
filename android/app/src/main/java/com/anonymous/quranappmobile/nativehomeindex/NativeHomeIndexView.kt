package com.anonymous.quranappmobile.nativehomeindex

import android.graphics.Color
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.View
import android.view.ViewConfiguration
import android.widget.FrameLayout
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.EventDispatcher

class NativeHomeIndexView(private val reactContext: ThemedReactContext) : FrameLayout(reactContext) {
  private val density = resources.displayMetrics.density
  private val touchSlop = ViewConfiguration.get(reactContext).scaledTouchSlop
  private val layoutManager = LinearLayoutManager(reactContext)
  private val adapter = NativeHomeIndexAdapter(::dispatchItemPress)
  private val reactHeaderChildren = mutableListOf<View>()
  private var items: List<NativeHomeIndexItem> = emptyList()
  private var theme = NativeHomeIndexTheme.default()
  private var pendingFastScrollIndex: Int? = null
  private var fastScrollScheduled = false
  private var headerVisible = true
  private var headerIntroHeightPx = 0
  private var tabsHeightPx = 0
  private var tabTapCandidate = false
  private var tabTapDownX = 0f
  private var tabTapDownY = 0f
  private var interceptingHeaderDrag = false
  private var downX = 0f
  private var downY = 0f
  private var lastTouchY = 0f
  private var velocityTracker: VelocityTracker? = null

  private val fastScroller = NativeHomeFastScrollerView(
      reactContext,
      labelForIndex = { index -> items.getOrNull(index)?.title.orEmpty() },
      onScrollToIndex = ::requestFastScroll,
  )

  private val recyclerView = RecyclerView(reactContext).apply {
    layoutManager = this@NativeHomeIndexView.layoutManager
    adapter = this@NativeHomeIndexView.adapter
    itemAnimator = null
    isVerticalScrollBarEnabled = false
    overScrollMode = View.OVER_SCROLL_NEVER
    clipToPadding = false
    isNestedScrollingEnabled = true
    setHasFixedSize(false)
    setItemViewCacheSize(8)
    setBackgroundColor(theme.backgroundColor)
    addOnScrollListener(object : RecyclerView.OnScrollListener() {
      override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
        updateHeaderOverlay()
        updateFastScroller(reveal = true)
      }
    })
  }

  init {
    addView(recyclerView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    addView(fastScroller, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  fun addReactHeaderChild(child: View, index: Int) {
    val targetIndex = index.coerceIn(0, reactHeaderChildren.size)
    reactHeaderChildren.add(targetIndex, child)
    addView(child, childCount - 1)
    updateHeaderOverlay()
  }

  fun reactHeaderChildCount(): Int = reactHeaderChildren.size
  fun reactHeaderChildAt(index: Int): View = reactHeaderChildren[index]

  fun removeReactHeaderChildAt(index: Int) {
    val child = reactHeaderChildren.removeAt(index)
    removeView(child)
  }

  fun setContent(content: ReadableMap?) {
    val anchorPosition = layoutManager.findFirstVisibleItemPosition()
    val anchorOffset = layoutManager.findViewByPosition(anchorPosition)?.top ?: 0
    items = parseNativeHomeIndexContent(content)
    adapter.items = items
    adapter.notifyDataSetChanged()
    post {
      if (anchorPosition >= 0 && adapter.itemCount > 0) {
        layoutManager.scrollToPositionWithOffset(anchorPosition.coerceAtMost(adapter.itemCount - 1), anchorOffset)
      }
      layoutRecyclerViewNow()
      updateHeaderOverlay()
      updateFastScroller(reveal = false)
    }
  }

  fun setNumColumns(value: Int) {
    val next = value.coerceAtLeast(1)
    if (adapter.columns == next) return
    val itemIndex = currentItemIndex()
    adapter.columns = next
    adapter.notifyDataSetChanged()
    post {
      layoutManager.scrollToPositionWithOffset(adapter.adapterPositionForItemIndex(itemIndex), 0)
      layoutRecyclerViewNow()
      updateHeaderOverlay()
    }
  }

  fun setHeaderHeight(valueDp: Float) {
    val px = (valueDp * density + 0.5f).toInt().coerceAtLeast(0)
    if (adapter.headerHeightPx == px) return
    adapter.headerHeightPx = px
    adapter.notifyItemChanged(0)
    updateHeaderOverlay()
  }

  fun setHeaderIntroHeight(valueDp: Float) {
    headerIntroHeightPx = (valueDp * density + 0.5f).toInt().coerceAtLeast(0)
  }

  fun setTabsHeight(valueDp: Float) {
    tabsHeightPx = (valueDp * density + 0.5f).toInt().coerceAtLeast(0)
  }

  fun setBottomInset(valueDp: Float) {
    val px = (valueDp * density + 0.5f).toInt().coerceAtLeast(0)
    recyclerView.setPadding(0, 0, 0, px + dp(24))
    fastScroller.setBottomInset(px)
  }

  fun setTheme(map: ReadableMap?) {
    val next = NativeHomeIndexTheme.fromReadableMap(map)
    if (theme == next) return
    theme = next
    adapter.theme = next
    recyclerView.setBackgroundColor(next.backgroundColor)
    fastScroller.setTheme(next)
    adapter.notifyItemRangeChanged(0, adapter.itemCount)
    layoutRecyclerViewNow()
    recyclerView.postInvalidateOnAnimation()
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    super.onLayout(changed, left, top, right, bottom)
    updateHeaderOverlay()
  }

  override fun dispatchTouchEvent(event: MotionEvent): Boolean {
    var tabToDispatch: String? = null
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        tabTapCandidate = isInsideTabs(event.x, event.y)
        if (tabTapCandidate) {
          tabTapDownX = event.x
          tabTapDownY = event.y
        }
      }
      MotionEvent.ACTION_MOVE -> {
        if (tabTapCandidate &&
            (kotlin.math.abs(event.x - tabTapDownX) > touchSlop ||
                kotlin.math.abs(event.y - tabTapDownY) > touchSlop)) {
          tabTapCandidate = false
        }
      }
      MotionEvent.ACTION_UP -> {
        if (tabTapCandidate && isInsideTabs(event.x, event.y)) {
          tabToDispatch = when {
            event.x < width / 3f -> "surah"
            event.x < width * 2f / 3f -> "juz"
            else -> "page"
          }
        }
        tabTapCandidate = false
      }
      MotionEvent.ACTION_CANCEL -> tabTapCandidate = false
    }

    val retainTouchTarget = tabTapCandidate
    val handled = super.dispatchTouchEvent(event)
    tabToDispatch?.let(::dispatchTabPress)
    return handled || retainTouchTarget || tabToDispatch != null
  }

  fun scrollToTop(animated: Boolean) {
    if (animated) recyclerView.smoothScrollToPosition(0)
    else layoutManager.scrollToPositionWithOffset(0, 0)
  }

  override fun onInterceptTouchEvent(event: MotionEvent): Boolean {
    if (event.x >= width - dp(40)) return false
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        interceptingHeaderDrag = false
        downX = event.x
        downY = event.y
        lastTouchY = event.y
        velocityTracker?.recycle()
        velocityTracker = VelocityTracker.obtain().also { it.addMovement(event) }
        return false
      }
      MotionEvent.ACTION_MOVE -> {
        velocityTracker?.addMovement(event)
        if (!isHeaderOnScreen()) return false
        val verticalDistance = kotlin.math.abs(event.y - downY)
        val horizontalDistance = kotlin.math.abs(event.x - downX)
        if (verticalDistance > touchSlop && verticalDistance > horizontalDistance) {
          interceptingHeaderDrag = true
          lastTouchY = event.y
          parent?.requestDisallowInterceptTouchEvent(true)
          return true
        }
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> finishHeaderDrag()
    }
    return false
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (!interceptingHeaderDrag) return super.onTouchEvent(event)
    velocityTracker?.addMovement(event)
    when (event.actionMasked) {
      MotionEvent.ACTION_MOVE -> {
        val deltaY = (lastTouchY - event.y).toInt()
        lastTouchY = event.y
        recyclerView.scrollBy(0, deltaY)
        return true
      }
      MotionEvent.ACTION_UP -> {
        velocityTracker?.computeCurrentVelocity(1000)
        val velocityY = velocityTracker?.yVelocity?.toInt() ?: 0
        if (kotlin.math.abs(velocityY) >= ViewConfiguration.get(context).scaledMinimumFlingVelocity) {
          recyclerView.fling(0, -velocityY)
        }
        finishHeaderDrag()
        performClick()
        return true
      }
      MotionEvent.ACTION_CANCEL -> {
        finishHeaderDrag()
        return true
      }
    }
    return true
  }

  override fun performClick(): Boolean {
    super.performClick()
    return true
  }

  private fun finishHeaderDrag() {
    interceptingHeaderDrag = false
    velocityTracker?.recycle()
    velocityTracker = null
    parent?.requestDisallowInterceptTouchEvent(false)
  }

  private fun requestFastScroll(index: Int) {
    if (items.isEmpty()) return
    pendingFastScrollIndex = index.coerceIn(0, items.lastIndex)
    if (fastScrollScheduled) return
    fastScrollScheduled = true
    recyclerView.postOnAnimation {
      fastScrollScheduled = false
      val target = pendingFastScrollIndex ?: return@postOnAnimation
      pendingFastScrollIndex = null
      recyclerView.stopScroll()
      layoutManager.scrollToPositionWithOffset(adapter.adapterPositionForItemIndex(target), 0)
      recyclerView.requestLayout()
      layoutRecyclerViewNow()
      fastScroller.updatePosition(target, items.size, reveal = true)
    }
  }

  /** Fabric can consume a descendant requestLayout at the native-component boundary. */
  private fun layoutRecyclerViewNow() {
    if (!recyclerView.isAttachedToWindow) return
    val layoutWidth = recyclerView.width.takeIf { it > 0 } ?: width
    val layoutHeight = recyclerView.height.takeIf { it > 0 } ?: height
    if (layoutWidth <= 0 || layoutHeight <= 0) return
    recyclerView.measure(
        View.MeasureSpec.makeMeasureSpec(layoutWidth, View.MeasureSpec.EXACTLY),
        View.MeasureSpec.makeMeasureSpec(layoutHeight, View.MeasureSpec.EXACTLY),
    )
    recyclerView.layout(
        recyclerView.left,
        recyclerView.top,
        recyclerView.left + layoutWidth,
        recyclerView.top + layoutHeight,
    )
  }

  private fun currentItemIndex(): Int {
    val position = layoutManager.findFirstVisibleItemPosition()
    if (position < 0) return 0
    return adapter.itemIndexForAdapterPosition(position)
  }

  private fun updateFastScroller(reveal: Boolean) {
    fastScroller.updatePosition(currentItemIndex(), items.size, reveal)
  }

  private fun isHeaderOnScreen(): Boolean {
    val spacer = layoutManager.findViewByPosition(0)
    return spacer != null && spacer.bottom > recyclerView.paddingTop
  }

  private fun updateHeaderOverlay() {
    val spacer = layoutManager.findViewByPosition(0)
    val headerTop = spacer?.top ?: -adapter.headerHeightPx
    reactHeaderChildren.forEach { child ->
      child.translationY = 0f
      val headerWidth = width.coerceAtLeast(0)
      val headerHeight = adapter.headerHeightPx.coerceAtLeast(0)
      if (child.measuredWidth != headerWidth || child.measuredHeight != headerHeight) {
        child.measure(
            View.MeasureSpec.makeMeasureSpec(headerWidth, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(headerHeight, View.MeasureSpec.EXACTLY),
        )
      }
      if (child.left != 0 || child.top != headerTop ||
          child.right != headerWidth || child.bottom != headerTop + headerHeight) {
        child.layout(0, headerTop, headerWidth, headerTop + headerHeight)
      }
    }
    val nextVisible = spacer != null && spacer.bottom > recyclerView.paddingTop
    if (nextVisible == headerVisible) return
    headerVisible = nextVisible
    dispatchEvent(EVENT_HEADER_VISIBILITY_CHANGE, Arguments.createMap().apply {
      putBoolean("visible", nextVisible)
    })
  }

  private fun isInsideTabs(x: Float, y: Float): Boolean {
    val header = reactHeaderChildren.firstOrNull() ?: return false
    if (tabsHeightPx <= 0 || x < 0f || x > width.toFloat()) return false
    val tabsTop = header.top + headerIntroHeightPx
    return y >= tabsTop && y < tabsTop + tabsHeightPx
  }

  private fun dispatchTabPress(tab: String) {
    dispatchEvent(EVENT_TAB_PRESS, Arguments.createMap().apply {
      putString("tab", tab)
    })
  }

  private fun dispatchItemPress(item: NativeHomeIndexItem) {
    dispatchEvent(EVENT_ITEM_PRESS, Arguments.createMap().apply {
      putString("type", item.type)
      putInt("number", item.number)
    })
  }

  private fun dispatchEvent(eventName: String, payload: com.facebook.react.bridge.WritableMap) {
    val surfaceId = UIManagerHelper.getSurfaceId(this)
    val dispatcher: EventDispatcher? = UIManagerHelper.getEventDispatcher(reactContext)
    dispatcher?.dispatchEvent(NativeHomeIndexEvent(surfaceId, id, eventName, payload))
  }

  private fun dp(value: Int): Int = (value * density + 0.5f).toInt()

  companion object {
    const val EVENT_ITEM_PRESS = "topItemPress"
    const val EVENT_TAB_PRESS = "topTabPress"
    const val EVENT_HEADER_VISIBILITY_CHANGE = "topHeaderVisibilityChange"
  }
}
