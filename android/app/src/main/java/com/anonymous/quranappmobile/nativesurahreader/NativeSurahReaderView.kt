package com.anonymous.quranappmobile.nativesurahreader

import android.graphics.Color
import android.view.View
import android.widget.FrameLayout
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.EventDispatcher

class NativeSurahReaderView(private val reactContext: ThemedReactContext) : FrameLayout(reactContext) {
  private data class NativeReaderSettings(
      val arabicFontFace: String?,
      val arabicFontSize: Float,
      val contentLanguage: String?,
      val translationFontSize: Float,
      val translationIds: List<Int>,
      val displayMode: String,
      val showByWords: Boolean,
      val tajweed: Boolean,
      val audioWordSyncEnabled: Boolean,
      val showTranslationAttribution: Boolean,
      val wordLang: String?,
  )

  private data class ScrollAnchor(
      val itemId: Long,
      val offsetTop: Int,
  )

  private data class InitialPlacement(
      val adapterPosition: Int,
      val verse: NativeVerse,
  )

  private val verses = mutableListOf<NativeVerse>()
  private val layoutManager = LinearLayoutManager(reactContext)
  private val adapter =
      NativeVerseAdapter(
          verses,
          { verse ->
            dispatchEvent(
                EVENT_VERSE_ACTION_PRESS,
                Arguments.createMap().apply {
                  putInt("verseNumber", verse.verseNumber)
                  putString("verseKey", verse.verseKey)
                  verse.verseApiId?.let { putInt("verseApiId", it) }
                  putString("arabicText", verse.arabicText)
                  putArray(
                      "translationTexts",
                      Arguments.createArray().apply {
                        verse.translationItems.forEach { pushString(it.text) }
                      },
                  )
                },
            )
          },
          { verse, word ->
            dispatchEvent(
                EVENT_WORD_PRESS,
                Arguments.createMap().apply {
                  putInt("verseNumber", verse.verseNumber)
                  putString("verseKey", verse.verseKey)
                  verse.verseApiId?.let { putInt("verseApiId", it) }
                  putInt("wordId", word.id)
                  word.position?.let { putInt("wordPosition", it) }
                },
            )
          },
      )
  private val fastScroller =
      NativeVerseFastScrollerView(reactContext) { verseIndex ->
        requestFastScrollToVerseIndex(verseIndex)
      }
  private val recyclerView =
      RecyclerView(reactContext).apply {
        this.layoutManager = this@NativeSurahReaderView.layoutManager
        this.adapter = this@NativeSurahReaderView.adapter
        clipToPadding = false
        isVerticalScrollBarEnabled = false
        overScrollMode = View.OVER_SCROLL_NEVER
        setBackgroundColor(Color.rgb(248, 250, 252))
        addOnScrollListener(
            object : RecyclerView.OnScrollListener() {
              override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
                dispatchScrollEvent()
                dispatchVisibleVerseEvent()
                updateFastScroller(reveal = isInitialContentVisible)
              }
            },
        )
      }

  private var surahId: Int = 1
  private var topInsetPx: Int = 0
  private var bottomInsetPx: Int = 0
  private var lastVisibleVerseKey: String? = null
  private var pendingTargetVerse: Int? = null
  private var hasReceivedSettings = false
  private var hasReceivedTheme = false
  private var hasReceivedVerses = false
  private var hasDispatchedInitialReady = false
  private var hasDispatchedInitialPositioned = false
  private var isInitialContentVisible = false
  private var initialPlacementGeneration = 0
  private var isMountedRefreshScheduled = false
  private var lastReaderStateSessionKey: String? = null
  private var lastReaderStateRenderKey: String? = null
  private var pendingFastScrollVerseIndex: Int? = null
  private var isFastScrollFrameScheduled = false

  init {
    recyclerView.alpha = 0f
    addView(recyclerView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    addView(fastScroller, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  fun setSurahId(surahId: Int) {
    if (this.surahId == surahId) return
    this.surahId = surahId
    adapter.surahId = surahId
    adapter.notifyDataSetChanged()
  }

  fun setTargetVerse(targetVerse: Int) {
    if (targetVerse <= 0) {
      return
    }

    if (targetVerse == 1) {
      pendingTargetVerse = null
      post {
        layoutManager.scrollToPositionWithOffset(0, 0)
        dispatchVisibleVerseEvent(force = true)
      }
      return
    }

    pendingTargetVerse = targetVerse
    post { scrollToVerse(targetVerse, false) }
  }

  fun setReaderState(readerState: ReadableMap?) {
    if (readerState == null) return

    val nextSurahId = readerState.getDoubleIfPresent("surahId")?.toInt()?.takeIf { it > 0 } ?: surahId
    val nextTargetVerse =
        readerState.getDoubleIfPresent("targetVerse")?.toInt()?.takeIf { it > 0 } ?: 1
    val nextSettings = parseSettings(readerState.getMapIfPresent("settings"))
    val nextTheme = NativeReaderTheme.fromReadableMap(readerState.getMapIfPresent("theme"))
    val nextTopInsetPx =
        readerState.getDoubleIfPresent("topInsetPx")?.toInt()?.coerceAtLeast(0) ?: 0
    val nextBottomInsetPx =
        readerState.getDoubleIfPresent("bottomInsetPx")?.toInt()?.coerceAtLeast(0) ?: 0
    val nextActiveVerseKey =
        readerState.getStringIfPresent("activeVerseKey")?.takeIf { it.isNotBlank() }
    val nextActiveWord =
        if (readerState.hasKey("activeWord")) {
          readerState.getMapIfPresent("activeWord")?.toNativeActiveWord()
        } else {
          adapter.activeWord
        }
    val nextSurahIntro = readerState.getMapIfPresent("surahIntro")?.toNativeSurahIntro()
    val nextVerses = parseVerses(readerState.getArrayIfPresent("verses"))
    val nextSessionKey =
        listOf(
                nextSurahId,
                nextTargetVerse,
                nextVerses.size,
                nextVerses.firstOrNull()?.verseKey.orEmpty(),
                nextVerses.lastOrNull()?.verseKey.orEmpty(),
                nextSurahIntro?.chapterId ?: 0,
            )
            .joinToString(":")
    val nextRenderKey =
        listOf(
                nextSessionKey,
                nextSettings.displayMode,
                nextSettings.arabicFontFace.orEmpty(),
                nextSettings.arabicFontSize,
                nextSettings.contentLanguage.orEmpty(),
                nextSettings.translationFontSize,
                nextSettings.translationIds.joinToString(","),
                nextSettings.showByWords,
                nextSettings.tajweed,
                nextSettings.audioWordSyncEnabled,
                nextSettings.showTranslationAttribution,
                nextSettings.wordLang.orEmpty(),
                nextTopInsetPx,
                nextBottomInsetPx,
                nextTheme.hashCode(),
                nextVerses.hashCode(),
            )
            .joinToString(":")

    val previousActiveVerseKey = adapter.activeVerseKey
    val previousActiveWord = adapter.activeWord
    val hasRenderChange = lastReaderStateRenderKey != nextRenderKey
    val shouldApplyInitialState = lastReaderStateSessionKey != nextSessionKey
    if (!shouldApplyInitialState &&
        !hasRenderChange &&
        previousActiveVerseKey == nextActiveVerseKey &&
        previousActiveWord == nextActiveWord) {
      return
    }
    val activeOnlyChange =
        !shouldApplyInitialState &&
            !hasRenderChange &&
            (previousActiveVerseKey != nextActiveVerseKey || previousActiveWord != nextActiveWord)

    adapter.activeVerseKey = nextActiveVerseKey
    adapter.activeWord = nextActiveWord
    if (activeOnlyChange) {
      notifyActiveAudioChanged(
          previousActiveVerseKey,
          nextActiveVerseKey,
          previousActiveWord,
          nextActiveWord,
      )
      return
    }

    lastReaderStateSessionKey = nextSessionKey
    lastReaderStateRenderKey = nextRenderKey
    hasReceivedSettings = true
    hasReceivedTheme = true
    hasReceivedVerses = true

    if (shouldApplyInitialState) {
      applyInitialReaderState(
          nextSurahId,
          nextTargetVerse,
          nextSettings,
          nextTheme,
          nextSurahIntro,
          nextVerses,
          nextTopInsetPx,
          nextBottomInsetPx,
      )
      return
    }

    applyMountedReaderState(
        nextSurahId,
        nextSettings,
        nextTheme,
        nextSurahIntro,
        nextVerses,
        nextTopInsetPx,
        nextBottomInsetPx,
    )
  }

  fun setSurahIntro(incomingSurahIntro: ReadableMap?) {
    adapter.surahIntro = incomingSurahIntro?.toNativeSurahIntro()
    adapter.notifyDataSetChanged()
    completeInitialPlacementIfReady()
  }

  fun setVerses(incomingVerses: ReadableArray?) {
    verses.clear()
    hasReceivedVerses = true
    lastVisibleVerseKey = null
    verses.addAll(parseVerses(incomingVerses))
    adapter.notifyDataSetChanged()
    completeInitialPlacementIfReady()
  }

  fun setSettings(settings: ReadableMap?) {
    hasReceivedSettings = true
    val nextSettings = parseSettings(settings)

    if (adapter.arabicFontFace == nextSettings.arabicFontFace &&
        adapter.arabicFontSize == nextSettings.arabicFontSize &&
        adapter.contentLanguage == nextSettings.contentLanguage &&
        adapter.translationFontSize == nextSettings.translationFontSize &&
        adapter.translationIds == nextSettings.translationIds &&
        adapter.displayMode == nextSettings.displayMode &&
        adapter.showByWords == nextSettings.showByWords &&
        adapter.tajweed == nextSettings.tajweed &&
        adapter.audioWordSyncEnabled == nextSettings.audioWordSyncEnabled &&
        adapter.showTranslationAttribution == nextSettings.showTranslationAttribution &&
        adapter.wordLang == nextSettings.wordLang) {
      completeInitialPlacementIfReady()
      return
    }

    applySettings(nextSettings)
    notifyAllRowsChanged()
    requestImmediateRecyclerRefresh()
    completeInitialPlacementIfReady()
  }

  fun setActiveVerseKey(activeVerseKey: String?) {
    val nextActiveVerseKey = activeVerseKey?.takeIf { it.isNotBlank() }
    val previousActiveVerseKey = adapter.activeVerseKey
    if (previousActiveVerseKey == nextActiveVerseKey) return

    adapter.activeVerseKey = nextActiveVerseKey
    notifyActiveAudioChanged(previousActiveVerseKey, nextActiveVerseKey, null, adapter.activeWord)
  }

  fun setActiveWord(activeWord: ReadableMap?) {
    val nextActiveWord = activeWord?.toNativeActiveWord()
    val previousActiveWord = adapter.activeWord
    if (previousActiveWord == nextActiveWord) return

    adapter.activeWord = nextActiveWord
    notifyActiveAudioChanged(
        adapter.activeVerseKey,
        adapter.activeVerseKey,
        previousActiveWord,
        nextActiveWord,
    )
  }

  fun setWordAudioSeekEnabled(enabled: Boolean) {
    if (adapter.wordAudioSeekEnabled == enabled) return
    adapter.wordAudioSeekEnabled = enabled
    adapter.notifyItemRangeChanged(0, adapter.itemCount)
    requestImmediateRecyclerRefresh()
  }

  fun setTopInsetPx(topInsetPx: Float) {
    this.topInsetPx = topInsetPx.toInt().coerceAtLeast(0)
    applyRecyclerPadding()
  }

  fun setBottomInsetPx(bottomInsetPx: Float) {
    this.bottomInsetPx = bottomInsetPx.toInt().coerceAtLeast(0)
    applyRecyclerPadding()
  }

  fun setTheme(theme: ReadableMap?) {
    hasReceivedTheme = true
    val readerTheme = NativeReaderTheme.fromReadableMap(theme)
    if (adapter.theme == readerTheme) {
      completeInitialPlacementIfReady()
      return
    }
    setBackgroundColor(readerTheme.backgroundColor)
    recyclerView.setBackgroundColor(readerTheme.backgroundColor)
    fastScroller.setColors(
        readerTheme.backgroundColor,
        readerTheme.textColor,
        readerTheme.tintColor,
    )
    adapter.theme = readerTheme
    notifyAllRowsChanged()
    requestImmediateRecyclerRefresh()
    completeInitialPlacementIfReady()
  }

  fun scrollToVerse(verseNumber: Int, animated: Boolean) {
    val index = verses.indexOfFirst { it.verseNumber == verseNumber }
    if (index < 0) {
      return
    }
    if (pendingTargetVerse == verseNumber) {
      pendingTargetVerse = null
    }

    if (animated) {
      recyclerView.smoothScrollToPosition(adapter.adapterPositionForVerseIndex(index))
      return
    }

    layoutManager.scrollToPositionWithOffset(adapter.adapterPositionForVerseIndex(index), 0)
    post { dispatchVisibleVerseEvent(force = true) }
  }

  private fun applyInitialReaderState(
      nextSurahId: Int,
      nextTargetVerse: Int,
      nextSettings: NativeReaderSettings,
      nextTheme: NativeReaderTheme,
      nextSurahIntro: NativeSurahIntro?,
      nextVerses: List<NativeVerse>,
      nextTopInsetPx: Int,
      nextBottomInsetPx: Int,
  ) {
    hasDispatchedInitialReady = false
    hasDispatchedInitialPositioned = false
    isInitialContentVisible = false
    lastVisibleVerseKey = null
    recyclerView.alpha = 0f

    applyReaderModel(
        nextSurahId,
        nextSettings,
        nextTheme,
        nextSurahIntro,
        nextVerses,
        nextTopInsetPx,
        nextBottomInsetPx,
    )

    pendingTargetVerse = nextTargetVerse.takeIf { it > 1 }
    adapter.notifyDataSetChanged()
    completeInitialPlacement(nextTargetVerse)
  }

  private fun applyMountedReaderState(
      nextSurahId: Int,
      nextSettings: NativeReaderSettings,
      nextTheme: NativeReaderTheme,
      nextSurahIntro: NativeSurahIntro?,
      nextVerses: List<NativeVerse>,
      nextTopInsetPx: Int,
      nextBottomInsetPx: Int,
  ) {
    val anchor = captureScrollAnchor()
    val hasSameItemSet = hasSameAdapterItemSet(nextSurahId, nextSurahIntro, nextVerses)

    applyReaderModel(
        nextSurahId,
        nextSettings,
        nextTheme,
        nextSurahIntro,
        nextVerses,
        nextTopInsetPx,
        nextBottomInsetPx,
    )

    val nextItemCount = adapter.itemCount
    if (hasSameItemSet && nextItemCount > 0) {
      adapter.notifyItemRangeChanged(0, nextItemCount)
    } else {
      adapter.notifyDataSetChanged()
    }

    requestImmediateRecyclerRefresh()
    restoreScrollAnchor(anchor)
  }

  private fun applyReaderModel(
      nextSurahId: Int,
      nextSettings: NativeReaderSettings,
      nextTheme: NativeReaderTheme,
      nextSurahIntro: NativeSurahIntro?,
      nextVerses: List<NativeVerse>,
      nextTopInsetPx: Int,
      nextBottomInsetPx: Int,
  ) {
    surahId = nextSurahId
    adapter.surahId = nextSurahId
    applySettings(nextSettings)
    setBackgroundColor(nextTheme.backgroundColor)
    recyclerView.setBackgroundColor(nextTheme.backgroundColor)
    fastScroller.setColors(
        nextTheme.backgroundColor,
        nextTheme.textColor,
        nextTheme.tintColor,
    )
    adapter.theme = nextTheme
    adapter.surahIntro = nextSurahIntro
    verses.clear()
    verses.addAll(nextVerses)
    topInsetPx = nextTopInsetPx
    bottomInsetPx = nextBottomInsetPx
    applyRecyclerPadding()
  }

  private fun hasSameAdapterItemSet(
      nextSurahId: Int,
      nextSurahIntro: NativeSurahIntro?,
      nextVerses: List<NativeVerse>,
  ): Boolean {
    val currentIntroCount = if (adapter.surahIntro != null) 1 else 0
    val nextIntroCount = if (nextSurahIntro != null) 1 else 0
    if (currentIntroCount != nextIntroCount) return false
    if (verses.size != nextVerses.size) return false
    if (adapter.surahIntro != null && nextSurahIntro != null) {
      val currentIntroId = Long.MIN_VALUE + surahId
      val nextIntroId = Long.MIN_VALUE + nextSurahId
      if (currentIntroId != nextIntroId) return false
    }

    return verses.indices.all { index ->
      verses[index].stableId(surahId) == nextVerses[index].stableId(nextSurahId)
    }
  }

  private fun captureScrollAnchor(): ScrollAnchor? {
    val firstPosition = layoutManager.findFirstVisibleItemPosition()
    if (firstPosition < 0 || firstPosition >= adapter.itemCount) return null
    val child = layoutManager.findViewByPosition(firstPosition)
    return ScrollAnchor(
        itemId = adapter.getItemId(firstPosition),
        offsetTop = child?.top ?: recyclerView.paddingTop,
    )
  }

  private fun restoreScrollAnchor(anchor: ScrollAnchor?) {
    if (anchor == null) return

    post {
      val position = findAdapterPositionByItemId(anchor.itemId)
      if (position < 0) return@post
      layoutManager.scrollToPositionWithOffset(position, anchor.offsetTop)
      post { dispatchVisibleVerseEvent(force = true) }
    }
  }

  private fun findAdapterPositionByItemId(itemId: Long): Int {
    for (position in 0 until adapter.itemCount) {
      if (adapter.getItemId(position) == itemId) return position
    }
    return -1
  }

  private fun applyRecyclerPadding() {
    recyclerView.setPadding(
        dp(16),
        topInsetPx,
        dp(16),
        bottomInsetPx,
    )
    fastScroller.setInsets(topInsetPx, bottomInsetPx)
  }

  private fun updateFastScroller(reveal: Boolean) {
    if (verses.size <= 1) {
      fastScroller.updatePosition(0, verses.size, reveal = false)
      return
    }

    val firstPosition = layoutManager.findFirstVisibleItemPosition()
    if (firstPosition == RecyclerView.NO_POSITION) return
    val firstVerseIndex = adapter.verseIndexForAdapterPosition(firstPosition).coerceAtLeast(0)
    fastScroller.updatePosition(firstVerseIndex, verses.size, reveal)
  }

  private fun requestFastScrollToVerseIndex(verseIndex: Int) {
    pendingFastScrollVerseIndex = verseIndex.coerceIn(0, (verses.size - 1).coerceAtLeast(0))
    if (isFastScrollFrameScheduled) return
    isFastScrollFrameScheduled = true
    recyclerView.postOnAnimation {
      isFastScrollFrameScheduled = false
      val targetIndex = pendingFastScrollVerseIndex ?: return@postOnAnimation
      pendingFastScrollVerseIndex = null
      recyclerView.stopScroll()
      val adapterPosition =
          if (targetIndex == 0) 0 else adapter.adapterPositionForVerseIndex(targetIndex)
      layoutManager.scrollToPositionWithOffset(adapterPosition, 0)
      recyclerView.requestLayout()
      layoutRecyclerViewNow()
      recyclerView.post {
        dispatchVisibleVerseEvent(force = true)
      }
    }
  }

  /**
   * RecyclerView adapter notifications are asynchronous. When a React prop update arrives without
   * any subsequent RecyclerView motion, attached holders can remain visually stale until scrolling
   * starts another layout pass. Rebinding the attached holders applies the new settings immediately;
   * the normal adapter notification still updates cached and off-screen holders.
   */
  private fun requestImmediateRecyclerRefresh() {
    rebindAttachedRows()
    recyclerView.requestLayout()
    recyclerView.invalidate()

    if (isMountedRefreshScheduled) return
    isMountedRefreshScheduled = true
    recyclerView.postOnAnimation {
      isMountedRefreshScheduled = false
      rebindAttachedRows()
      recyclerView.requestLayout()
      recyclerView.invalidate()
      layoutRecyclerViewNow()
    }
  }

  private fun notifyAllRowsChanged() {
    if (adapter.itemCount > 0) {
      adapter.notifyItemRangeChanged(0, adapter.itemCount)
    }
  }

  private fun rebindAttachedRows() {
    for (childIndex in 0 until recyclerView.childCount) {
      val child = recyclerView.getChildAt(childIndex)
      val holder = recyclerView.getChildViewHolder(child)
      val adapterPosition =
          recyclerView.getChildAdapterPosition(child).takeIf { it != RecyclerView.NO_POSITION }
              ?: holder.layoutPosition
      if (adapterPosition !in 0 until adapter.itemCount) continue
      if (holder.itemViewType != adapter.getItemViewType(adapterPosition)) continue

      adapter.onBindViewHolder(holder, adapterPosition)
      child.requestLayout()
      child.invalidate()
    }
  }

  /**
   * Fabric owns the outer native component's bounds and can consume a descendant requestLayout()
   * without running another Android layout traversal. Laying out RecyclerView at its existing bounds
   * consumes pending adapter updates and remeasures rows whose structure changed.
   */
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

  private fun dp(value: Int): Int {
    return (value * resources.displayMetrics.density).toInt()
  }

  private fun notifyActiveAudioChanged(
      previousActiveVerseKey: String?,
      nextActiveVerseKey: String?,
      previousActiveWord: NativeActiveWord?,
      nextActiveWord: NativeActiveWord?,
  ) {
    val verseKeys =
        linkedSetOf(
            previousActiveVerseKey,
            nextActiveVerseKey,
            previousActiveWord?.verseKey,
            nextActiveWord?.verseKey,
        )
    verseKeys.forEach { notifyVerseActiveAudioChanged(it) }
  }

  private fun notifyVerseActiveAudioChanged(verseKey: String?) {
    if (verseKey.isNullOrBlank()) return
    val index = verses.indexOfFirst { it.verseKey == verseKey }
    if (index >= 0) {
      adapter.notifyItemChanged(
          adapter.adapterPositionForVerseIndex(index),
          NativeVerseAdapter.PAYLOAD_ACTIVE_AUDIO,
      )
    }
  }

  private fun completeInitialPlacementIfReady() {
    if (!hasReceivedVerses || !hasReceivedSettings || !hasReceivedTheme) return

    completeInitialPlacement(pendingTargetVerse ?: 1)
  }

  private fun completeInitialPlacement(targetVerse: Int) {
    val placementGeneration = ++initialPlacementGeneration
    // Queue the requested adapter position before returning from the prop/state update. This makes
    // the target, rather than the intro row, RecyclerView's very first native layout anchor.
    val placement = positionInitialTarget(targetVerse) ?: return
    recyclerView.requestLayout()

    post {
      if (placementGeneration != initialPlacementGeneration) return@post

      // Force the first native layout while the list is still transparent so a heavy row (notably
      // Tajweed) cannot briefly expose the start of the Surah before Android consumes that target.
      layoutRecyclerViewNow()
      revealInitialPlacementWhenReady(placement, placementGeneration)
    }
  }

  private fun revealInitialPlacementWhenReady(
      placement: InitialPlacement,
      placementGeneration: Int,
  ) {
    if (placementGeneration != initialPlacementGeneration) return

    val firstVisiblePosition = layoutManager.findFirstVisibleItemPosition()
    val targetView = layoutManager.findViewByPosition(placement.adapterPosition)
    val isTargetVisible =
        targetView != null &&
            targetView.bottom > recyclerView.paddingTop &&
            targetView.top < recyclerView.height - recyclerView.paddingBottom
    val isTargetAtStart = firstVisiblePosition == placement.adapterPosition
    val isTargetAlignedAtStart =
        isTargetAtStart &&
            targetView != null &&
            targetView.top == recyclerView.paddingTop
    val isStableEndBoundary =
        placement.adapterPosition > 0 &&
            isTargetVisible &&
            layoutManager.findLastVisibleItemPosition() == adapter.itemCount - 1

    if (!isTargetAlignedAtStart && !isStableEndBoundary) {
      layoutManager.scrollToPositionWithOffset(placement.adapterPosition, 0)
      recyclerView.requestLayout()
      recyclerView.postOnAnimation {
        if (placementGeneration != initialPlacementGeneration) return@postOnAnimation
        layoutRecyclerViewNow()
        revealInitialPlacementWhenReady(placement, placementGeneration)
      }
      return
    }

    dispatchInitialReadyIfNeeded()
    dispatchVisibleVerseEvent(force = true)
    dispatchInitialPositionedIfNeeded(placement.verse)
    if (!isInitialContentVisible) {
      isInitialContentVisible = true
      recyclerView.alpha = 1f
    }
  }

  private fun positionInitialTarget(targetVerse: Int): InitialPlacement? {
    if (verses.isEmpty()) return null
    val targetIndex = verses.indexOfFirst { it.verseNumber == targetVerse }.takeIf { it >= 0 } ?: 0
    val adapterPosition =
        if (targetVerse <= 1 && adapter.surahIntro != null) {
          0
        } else {
          adapter.adapterPositionForVerseIndex(targetIndex)
        }
    layoutManager.scrollToPositionWithOffset(adapterPosition, 0)
    if (pendingTargetVerse == targetVerse) {
      pendingTargetVerse = null
    }
    return InitialPlacement(
        adapterPosition = adapterPosition,
        verse = verses[targetIndex],
    )
  }

  private fun dispatchInitialReadyIfNeeded() {
    if (hasDispatchedInitialReady) return
    hasDispatchedInitialReady = true
    dispatchEvent(EVENT_READY, Arguments.createMap())
  }

  private fun dispatchInitialPositionedIfNeeded(verse: NativeVerse?) {
    if (hasDispatchedInitialPositioned || verse == null) return
    hasDispatchedInitialPositioned = true
    dispatchEvent(
        EVENT_INITIAL_POSITIONED,
        Arguments.createMap().apply {
          putInt("verseNumber", verse.verseNumber)
          putString("verseKey", verse.verseKey)
          verse.verseApiId?.let { putInt("verseApiId", it) }
        },
    )
  }

  private fun parseSettings(settings: ReadableMap?): NativeReaderSettings {
    val nextArabicFontFace = settings?.getStringIfPresent("arabicFontFace")
    val nextArabicFontSize = settings?.getDoubleIfPresent("arabicFontSize")?.toFloat() ?: 25f
    val nextContentLanguage =
        settings?.getStringIfPresent("contentLanguage")?.trim()?.lowercase()?.takeIf { it.isNotBlank() }
    val nextTranslationFontSize =
        settings?.getDoubleIfPresent("translationFontSize")?.toFloat() ?: 16f
    val nextTranslationIds = parsePositiveIntList(settings?.getArrayIfPresent("translationIds"))
    val nextShowByWords = settings?.getBooleanIfPresent("showByWords") ?: false
    val nextAudioWordSyncEnabled =
        settings?.getBooleanIfPresent("audioWordSyncEnabled") ?: false
    val nextTajweed = settings?.getBooleanIfPresent("tajweed") ?: false
    val nextDisplayMode =
        settings?.getStringIfPresent("displayMode")?.takeIf {
          it == DISPLAY_MODE_WORD_BY_WORD || it == DISPLAY_MODE_TAJWEED
        } ?: if (nextShowByWords) {
          DISPLAY_MODE_WORD_BY_WORD
        } else if (nextTajweed) {
          DISPLAY_MODE_TAJWEED
        } else {
          DISPLAY_MODE_PLAIN
        }
    val nextShowTranslationAttribution =
        settings?.getBooleanIfPresent("showTranslationAttribution") ?: false
    val nextWordLang =
        settings?.getStringIfPresent("wordLang")?.trim()?.lowercase()?.takeIf { it.isNotBlank() }

    return NativeReaderSettings(
        arabicFontFace = nextArabicFontFace,
        arabicFontSize = nextArabicFontSize,
        contentLanguage = nextContentLanguage,
        translationFontSize = nextTranslationFontSize,
        translationIds = nextTranslationIds,
        displayMode = nextDisplayMode,
        showByWords = nextShowByWords,
        tajweed = nextTajweed,
        audioWordSyncEnabled = nextAudioWordSyncEnabled,
        showTranslationAttribution = nextShowTranslationAttribution,
        wordLang = nextWordLang,
    )
  }

  private fun applySettings(settings: NativeReaderSettings) {
    adapter.arabicFontFace = settings.arabicFontFace
    adapter.arabicFontSize = settings.arabicFontSize
    adapter.contentLanguage = settings.contentLanguage
    adapter.translationFontSize = settings.translationFontSize
    adapter.translationIds = settings.translationIds
    adapter.displayMode = settings.displayMode
    adapter.showByWords = settings.showByWords
    adapter.tajweed = settings.tajweed
    adapter.audioWordSyncEnabled = settings.audioWordSyncEnabled
    adapter.showTranslationAttribution = settings.showTranslationAttribution
    adapter.wordLang = settings.wordLang
  }

  private fun parsePositiveIntList(incoming: ReadableArray?): List<Int> {
    if (incoming == null) return emptyList()

    val ids = mutableListOf<Int>()
    for (index in 0 until incoming.size()) {
      val id =
          try {
            incoming.getDouble(index).toInt()
          } catch (_: RuntimeException) {
            continue
          }
      if (id > 0 && !ids.contains(id)) {
        ids.add(id)
      }
    }
    return ids
  }

  private fun parseVerses(incomingVerses: ReadableArray?): List<NativeVerse> {
    if (incomingVerses == null) return emptyList()

    val nextVerses = mutableListOf<NativeVerse>()
    for (index in 0 until incomingVerses.size()) {
      val map = incomingVerses.getMap(index) ?: continue
      val verse = map.toNativeVerse() ?: continue
      nextVerses.add(verse)
    }
    return nextVerses
  }

  private fun dispatchScrollEvent() {
    dispatchEvent(
        EVENT_SCROLL,
        Arguments.createMap().apply {
          putDouble("contentOffsetY", recyclerView.computeVerticalScrollOffset().toDouble())
        },
    )
  }

  private fun dispatchVisibleVerseEvent(force: Boolean = false) {
    val firstPosition = layoutManager.findFirstVisibleItemPosition()
    if (firstPosition < 0) return

    val lastPosition = layoutManager.findLastVisibleItemPosition().takeIf { it >= firstPosition } ?: firstPosition
    var verse: NativeVerse? = null
    for (position in firstPosition..lastPosition) {
      val verseIndex = adapter.verseIndexForAdapterPosition(position)
      if (verseIndex >= 0 && verseIndex < verses.size) {
        verse = verses[verseIndex]
        break
      }
    }
    if (verse == null) return
    if (!force && lastVisibleVerseKey == verse.verseKey) return
    lastVisibleVerseKey = verse.verseKey
    dispatchEvent(
        EVENT_VISIBLE_VERSE_CHANGE,
        Arguments.createMap().apply {
          putInt("verseNumber", verse.verseNumber)
          putString("verseKey", verse.verseKey)
          verse.verseApiId?.let { putInt("verseApiId", it) }
        },
    )
  }

  private fun dispatchEvent(eventName: String, data: WritableMap) {
    val surfaceId = UIManagerHelper.getSurfaceId(this)
    val dispatcher: EventDispatcher? = UIManagerHelper.getEventDispatcher(reactContext)
    dispatcher?.dispatchEvent(NativeSurahReaderEvent(surfaceId, id, eventName, data))
  }

  companion object {
    const val EVENT_READY = "topReady"
    const val EVENT_INITIAL_POSITIONED = "topInitialPositioned"
    const val EVENT_VISIBLE_VERSE_CHANGE = "topVisibleVerseChange"
    const val EVENT_VERSE_ACTION_PRESS = "topVerseActionPress"
    const val EVENT_WORD_PRESS = "topWordPress"
    const val EVENT_SCROLL = "topScroll"
  }
}
