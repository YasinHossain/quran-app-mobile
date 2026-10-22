package com.anonymous.quranappmobile.nativesurahreader

import android.graphics.Color
import android.view.View
import android.widget.FrameLayout
import androidx.recyclerview.widget.DefaultItemAnimator
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.LinearSmoothScroller
import androidx.recyclerview.widget.RecyclerView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.EventDispatcher
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class NativeSurahReaderView(private val reactContext: ThemedReactContext) : FrameLayout(reactContext) {
  private data class ScrollAnchor(
      val itemId: Long,
      val offsetTop: Int,
  )

  private data class InitialPlacement(
      val adapterPosition: Int,
      val verse: NativeVerse,
  )

  private val verses = mutableListOf<NativeVerse>()
  private val verseModelCache = NativeVerseModelCache()
  private val repository = NativeSurahReaderRepository(reactContext)
  private val layoutManager = LinearLayoutManager(reactContext)
  private var currentWordPressSource: String = "translation"
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
                  putArray(
                      "translationItems",
                      Arguments.createArray().apply {
                        verse.translationItems.forEach { item ->
                          pushMap(
                              Arguments.createMap().apply {
                                item.resourceId?.let { putInt("resourceId", it) }
                                item.resourceName?.let { putString("resourceName", it) }
                                putString("text", item.text)
                              },
                          )
                        }
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
                  putString("surfaceText", word.uthmani)
                  putString(
                      "source",
                      currentWordPressSource,
                  )
                },
            )
          },
      )
  private val fastScroller =
      NativeVerseFastScrollerView(reactContext) { verseIndex ->
        requestFastScrollToVerseIndex(verseIndex)
      }.apply {
        // A Juz or Page spans Surahs, so its scrubber names the verse rather than a position.
        labelForIndex = { index ->
          verses.getOrNull(index)?.takeIf { adapter.scopeBanner != null }?.verseKey
        }
      }
  private val recyclerView =
      RecyclerView(reactContext).apply {
        this.layoutManager = this@NativeSurahReaderView.layoutManager
        this.adapter = this@NativeSurahReaderView.adapter
        itemAnimator = null
        clipToPadding = false
        isVerticalScrollBarEnabled = false
        overScrollMode = View.OVER_SCROLL_NEVER
        // No background here or on the reader view: the React screen behind already paints the
        // same theme color, and each extra full-screen fill costs GPU time on every frame.
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
  private var lastTopFullyVisibleVerseKey: String? = null
  private var pendingTargetVerseKey: String? = null
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
  private var isActiveAudioRedrawScheduled = false
  private var pendingActiveAudioFollowVerseKey: String? = null
  private var isActiveAudioFollowScheduled = false
  private var nativeLoadGeneration = 0
  private var nativeLoadKey: String? = null
  private var isDisposed = false
  private var translationRecovery: ReadableMap? = null
  private var latestOfflineSettings: NativeReaderSettings? = null
  private var latestOfflineTheme: NativeReaderTheme? = null
  private var latestOfflineSurahIntros: Map<Int, NativeSurahIntro> = emptyMap()
  private var latestOfflineScopeBanner: NativeScopeBanner? = null

  init {
    recyclerView.alpha = 0f
    addView(recyclerView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    addView(fastScroller, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  fun setSurahId(surahId: Int) {
    if (this.surahId == surahId) return
    this.surahId = surahId
  }

  fun setTargetVerse(targetVerse: Int) {
    if (targetVerse <= 0) {
      return
    }

    if (targetVerse == 1) {
      pendingTargetVerseKey = null
      post {
        layoutManager.scrollToPositionWithOffset(0, 0)
        dispatchVisibleVerseEvent(force = true)
      }
      return
    }

    val targetVerseKey = "$surahId:$targetVerse"
    pendingTargetVerseKey = targetVerseKey
    post { scrollToVerseKey(targetVerseKey, false) }
  }

  fun setReaderState(readerState: ReadableMap?) {
    if (readerState == null) return

    if (!readerState.hasKey("verses")) {
      setOfflineReaderState(readerState)
      return
    }

    val nextSurahId = readerState.getDoubleIfPresent("surahId")?.toInt()?.takeIf { it > 0 } ?: surahId
    val nextTargetVerseKey = parseTargetVerseKey(readerState, nextSurahId)
    val nextSettings = parseSettings(readerState.getMapIfPresent("settings"))
    val nextTheme = NativeReaderTheme.fromReadableMap(readerState.getMapIfPresent("theme"))
    val nextTopInsetPx =
        readerState.getDoubleIfPresent("topInsetPx")?.toInt()?.coerceAtLeast(0) ?: topInsetPx
    val nextBottomInsetPx =
        readerState.getDoubleIfPresent("bottomInsetPx")?.toInt()?.coerceAtLeast(0) ?: bottomInsetPx
    // Insets and audio may arrive as independent props, in either order within a React update.
    // An omitted field must preserve those values; explicit null still clears the highlight.
    val nextActiveVerseKey =
        if (readerState.hasKey("activeVerseKey")) {
          readerState.getStringIfPresent("activeVerseKey")?.takeIf { it.isNotBlank() }
        } else {
          adapter.activeVerseKey
        }
    val nextActiveWord =
        if (readerState.hasKey("activeWord")) {
          readerState.getMapIfPresent("activeWord")?.toNativeActiveWord()
        } else {
          adapter.activeWord
        }
    val nextSurahIntros = readerState.toNativeSurahIntros()
    val nextScopeBanner = readerState.getMapIfPresent("scopeBanner")?.toNativeScopeBanner()
    val nextVerseRevision = readerState.getStringIfPresent("versesRevision")?.takeIf { it.isNotBlank() }
    val nextVerseModel = verseModelCache.resolve(
        nextVerseRevision?.let {
          NativeVerseModelKey(nextSurahId, it, nextSettings, nextTheme)
        },
    ) { parseVerses(readerState.getArrayIfPresent("verses")) }
    val nextVerses = nextVerseModel.verses
    val nextSessionKey =
        listOf(
                nextSurahId,
                nextTargetVerseKey,
                nextVerses.size,
                nextVerses.firstOrNull()?.verseKey.orEmpty(),
                nextVerses.lastOrNull()?.verseKey.orEmpty(),
                nextSurahIntros.keys.joinToString(","),
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
                nextSettings.translationNames,
                nextSettings.showByWords,
                nextSettings.tajweed,
                nextSettings.audioWordSyncEnabled,
                nextSettings.showTranslationAttribution,
                nextSettings.wordLang.orEmpty(),
                nextTheme.hashCode(),
                nextVerseRevision.orEmpty(),
                nextVerseModel.contentHash,
                nextSurahIntros,
                nextScopeBanner,
            )
            .joinToString(":")

    val previousActiveVerseKey = adapter.activeVerseKey
    val previousActiveWord = adapter.activeWord
    val hasRenderChange = lastReaderStateRenderKey != nextRenderKey
    val shouldApplyInitialState = lastReaderStateSessionKey != nextSessionKey
    val hasActiveAudioChange =
        previousActiveVerseKey != nextActiveVerseKey || previousActiveWord != nextActiveWord
    val hasInsetChange = topInsetPx != nextTopInsetPx || bottomInsetPx != nextBottomInsetPx

    adapter.activeVerseKey = nextActiveVerseKey
    adapter.activeWord = nextActiveWord
    if (!shouldApplyInitialState && !hasRenderChange) {
      if (hasActiveAudioChange) {
        notifyActiveAudioChanged(
            previousActiveVerseKey,
            nextActiveVerseKey,
            previousActiveWord,
            nextActiveWord,
        )
      }
      if (hasInsetChange) {
        applyReaderInsets(nextTopInsetPx, nextBottomInsetPx)
      }
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
          nextTargetVerseKey,
          nextSettings,
          nextTheme,
          nextSurahIntros,
          nextScopeBanner,
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
        nextSurahIntros,
        nextScopeBanner,
        nextVerses,
        nextTopInsetPx,
        nextBottomInsetPx,
    )
  }

  /** Range readers name their target by verse key; Surah readers may still pass a verse number. */
  private fun parseTargetVerseKey(readerState: ReadableMap, readerSurahId: Int): String? {
    readerState.getStringIfPresent("targetVerseKey")?.trim()?.takeIf { it.isNotBlank() }?.let {
      return it
    }
    val targetVerse = readerState.getDoubleIfPresent("targetVerse")?.toInt()?.takeIf { it > 1 }
    return targetVerse?.let { "$readerSurahId:$it" }
  }

  private fun setOfflineReaderState(readerState: ReadableMap) {
    val nextVerseRange =
        readerState.getMapIfPresent("verseRange")?.toNativeVerseRange()
            ?: readerState.getDoubleIfPresent("surahId")?.toInt()?.takeIf { it > 0 }?.let {
              NativeVerseRange.forSurah(it)
            }
            ?: return
    val nextSurahId =
        readerState.getDoubleIfPresent("surahId")?.toInt()?.takeIf { it > 0 }
            ?: nextVerseRange.startSurah
    val nextTargetVerseKey = parseTargetVerseKey(readerState, nextSurahId)
    val expectedVerseCount =
        readerState.getDoubleIfPresent("expectedVerseCount")?.toInt()?.coerceAtLeast(0) ?: 0
    val nextSettings = parseSettings(readerState.getMapIfPresent("settings"))
    val nextTheme = NativeReaderTheme.fromReadableMap(readerState.getMapIfPresent("theme"))
    val nextSurahIntros = readerState.toNativeSurahIntros()
    val nextScopeBanner = readerState.getMapIfPresent("scopeBanner")?.toNativeScopeBanner()
    latestOfflineSettings = nextSettings
    latestOfflineTheme = nextTheme
    latestOfflineSurahIntros = nextSurahIntros
    latestOfflineScopeBanner = nextScopeBanner
    val nextLoadKey =
        listOf(
                nextVerseRange.cacheKey,
                expectedVerseCount,
                nextSettings.translationIds.joinToString(","),
                nextSettings.translationNames.toSortedMap(),
                nextSettings.wordLang.orEmpty(),
                nextSettings.showByWords,
            )
            .joinToString(":")

    hasReceivedSettings = true
    hasReceivedTheme = true
    val existingLoadKey = nativeLoadKey
    if (existingLoadKey == nextLoadKey) {
      if (verses.isNotEmpty()) {
        applyMountedReaderState(
            nextSurahId,
            nextSettings,
            nextTheme,
            nextSurahIntros,
            nextScopeBanner,
            verses.toList(),
            topInsetPx,
            bottomInsetPx,
        )
      } else {
        applySettings(nextSettings)
        adapter.surahIntros = nextSurahIntros
        adapter.scopeBanner = nextScopeBanner
        adapter.rebuildRows()
        adapter.theme = nextTheme
      }
      return
    }

    nativeLoadKey = nextLoadKey
    val generation = ++nativeLoadGeneration
    // Reloads for a new translation selection keep the reader's place; first loads use the target.
    val visibleVerseKey =
        layoutManager.findFirstVisibleItemPosition().let { position ->
          val index = adapter.verseIndexForAdapterPosition(position)
          verses.getOrNull(index)?.verseKey
        }
    val placementTarget = visibleVerseKey ?: nextTargetVerseKey

    hasReceivedVerses = false
    hasDispatchedInitialReady = false
    hasDispatchedInitialPositioned = false
    isInitialContentVisible = false
    lastVisibleVerseKey = null
    lastTopFullyVisibleVerseKey = null
    recyclerView.alpha = 0f
    applyReaderModel(
        nextSurahId,
        nextSettings,
        nextTheme,
        nextSurahIntros,
        nextScopeBanner,
        emptyList(),
        topInsetPx,
        bottomInsetPx,
    )
    adapter.notifyDataSetChanged()

    val request =
        NativeSurahLoadRequest(
            verseRange = nextVerseRange,
            expectedVerseCount = expectedVerseCount,
            translationIds = nextSettings.translationIds,
            translationNames = nextSettings.translationNames,
            wordLang = nextSettings.wordLang ?: "en",
            requireWordTranslations = nextSettings.showByWords,
        )
    databaseExecutor.execute {
      val result = repository.load(request)
      post {
        if (isDisposed || generation != nativeLoadGeneration || nativeLoadKey != nextLoadKey) {
          return@post
        }
        when (result) {
          is NativeSurahLoadResult.Success -> {
            val currentSettings = latestOfflineSettings ?: nextSettings
            val currentTheme = latestOfflineTheme ?: nextTheme
            hasReceivedVerses = true
            applyInitialReaderState(
                nextSurahId,
                placementTarget,
                currentSettings,
                currentTheme,
                latestOfflineSurahIntros,
                latestOfflineScopeBanner,
                result.verses,
                topInsetPx,
                bottomInsetPx,
            )
            applyTranslationRecovery()
            dispatchEvent(
                EVENT_TRANSLATION_AVAILABILITY,
                Arguments.createMap().apply {
                  putInt("surahId", nextSurahId)
                  putString("selectionKey", request.translationIds.joinToString(","))
                  putArray("missingTranslationIds", Arguments.createArray().apply {
                    result.missingTranslationIds.forEach { pushInt(it) }
                  })
                },
            )
          }
          is NativeSurahLoadResult.Failure -> {
            dispatchEvent(
                EVENT_LOAD_ERROR,
                Arguments.createMap().apply {
                  putString("code", result.code)
                  putString("message", result.message)
                },
            )
          }
        }
      }
    }
  }

  fun setTranslationRecovery(recovery: ReadableMap?) {
    translationRecovery = recovery
    applyTranslationRecovery()
  }

  private fun applyTranslationRecovery() {
    val recovery = translationRecovery ?: return
    val settings = latestOfflineSettings ?: return
    if (!hasReceivedVerses || verses.isEmpty()) return
    if (recovery.getDoubleIfPresent("surahId")?.toInt() != surahId ||
        recovery.getStringIfPresent("selectionKey") != settings.translationIds.joinToString(",")) return
    val rows = recovery.getArrayIfPresent("verses") ?: return
    val recovered = mutableMapOf<String, List<NativeTranslationItem>>()
    for (index in 0 until rows.size()) {
      val row = rows.getMap(index) ?: continue
      val key = row.getStringIfPresent("verseKey") ?: continue
      val items = row.getArrayIfPresent("translationItems") ?: continue
      recovered[key] = (0 until items.size()).mapNotNull { itemIndex ->
        val item = items.getMap(itemIndex) ?: return@mapNotNull null
        val id = item.getDoubleIfPresent("resourceId")?.toInt() ?: return@mapNotNull null
        val text = item.getStringIfPresent("text")?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
        NativeTranslationItem(id, settings.translationNames[id], text)
      }
    }
    val next = mergeRecoveredTranslations(verses, settings.translationIds, recovered)
    val changedVerseKeys =
        next.indices.filter { next[it] !== verses[it] }.mapTo(HashSet()) { next[it].verseKey }
    if (changedVerseKeys.isEmpty()) return
    if (!isInitialContentVisible || recyclerView.scrollState != RecyclerView.SCROLL_STATE_IDLE) {
      verses.clear()
      verses.addAll(next)
      adapter.notifyItemRangeChanged(0, adapter.itemCount)
      requestImmediateRecyclerRefresh()
      return
    }
    val recoveredIds = recovered.values.flatten().mapNotNullTo(HashSet()) { it.resourceId }
    revealRecoveredTranslations(next, changedVerseKeys, recoveredIds)
  }

  /**
   * Online translations land after the reader is already visible. Apply them in one layout pass
   * pinned to the row being read, then let rows glide to their taller positions while the new text
   * fades in. The item animator exists only for this update, so scrolling keeps its no-animator path.
   */
  private fun revealRecoveredTranslations(
      next: List<NativeVerse>,
      changedVerseKeys: Set<String>,
      recoveredIds: Set<Int>,
  ) {
    val anchor = captureScrollAnchor()
    val animator =
        DefaultItemAnimator().apply {
          supportsChangeAnimations = false
          moveDuration = TRANSLATION_REVEAL_DURATION_MS
        }
    recyclerView.itemAnimator = animator
    verses.clear()
    verses.addAll(next)
    adapter.notifyItemRangeChanged(0, adapter.itemCount)
    anchor?.let {
      val position = findAdapterPositionByItemId(it.itemId)
      if (position >= 0) {
        layoutManager.scrollToPositionWithOffset(position, it.offsetTop - recyclerView.paddingTop)
      }
    }
    layoutRecyclerViewNow()
    for (childIndex in 0 until recyclerView.childCount) {
      val holder = recyclerView.getChildViewHolder(recyclerView.getChildAt(childIndex))
      (holder as? NativeVerseViewHolder)?.fadeInTranslations(
          changedVerseKeys,
          recoveredIds,
          TRANSLATION_REVEAL_DURATION_MS,
      )
    }
    // Detach on the next frame: clearing the animator from its own finished callback re-enters it.
    animator.isRunning {
      recyclerView.post { if (recyclerView.itemAnimator === animator) recyclerView.itemAnimator = null }
    }
    post { dispatchVisibleVerseEvent(force = true) }
  }

  fun dispose() {
    isDisposed = true
    nativeLoadGeneration += 1
  }

  fun setSurahIntro(incomingSurahIntro: ReadableMap?) {
    adapter.surahIntros =
        incomingSurahIntro?.toNativeSurahIntro()?.let { mapOf(it.chapterId to it) } ?: emptyMap()
    adapter.rebuildRows()
    adapter.notifyDataSetChanged()
    completeInitialPlacementIfReady()
  }

  fun setVerses(incomingVerses: ReadableArray?) {
    verseModelCache.clear()
    lastReaderStateRenderKey = null
    verses.clear()
    hasReceivedVerses = true
    lastVisibleVerseKey = null
    lastTopFullyVisibleVerseKey = null
    verses.addAll(parseVerses(incomingVerses))
    adapter.rebuildRows()
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
        adapter.translationNames == nextSettings.translationNames &&
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

  fun setWordPressEnabled(enabled: Boolean) {
    if (adapter.wordPressEnabled == enabled) return
    adapter.wordPressEnabled = enabled
    for (childIndex in 0 until recyclerView.childCount) {
      val holder = recyclerView.getChildViewHolder(recyclerView.getChildAt(childIndex))
      adapter.updateAttachedWordPress(holder)
    }
  }

  fun setTopInsetPx(topInsetPx: Float) {
    applyReaderInsets(topInsetPx.toInt().coerceAtLeast(0), bottomInsetPx)
  }

  fun setBottomInsetPx(bottomInsetPx: Float) {
    applyReaderInsets(topInsetPx, bottomInsetPx.toInt().coerceAtLeast(0))
  }

  fun setTheme(theme: ReadableMap?) {
    hasReceivedTheme = true
    val readerTheme = NativeReaderTheme.fromReadableMap(theme)
    if (adapter.theme == readerTheme) {
      completeInitialPlacementIfReady()
      return
    }
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
    scrollToVerseKey("$surahId:$verseNumber", animated)
  }

  fun scrollToVerseKey(verseKey: String, animated: Boolean) {
    val index = verses.indexOfFirst { it.verseKey == verseKey }
    if (index < 0) {
      return
    }
    if (pendingTargetVerseKey == verseKey) {
      pendingTargetVerseKey = null
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
      nextTargetVerseKey: String?,
      nextSettings: NativeReaderSettings,
      nextTheme: NativeReaderTheme,
      nextSurahIntros: Map<Int, NativeSurahIntro>,
      nextScopeBanner: NativeScopeBanner?,
      nextVerses: List<NativeVerse>,
      nextTopInsetPx: Int,
      nextBottomInsetPx: Int,
  ) {
    hasDispatchedInitialReady = false
    hasDispatchedInitialPositioned = false
    isInitialContentVisible = false
    lastVisibleVerseKey = null
    lastTopFullyVisibleVerseKey = null
    recyclerView.alpha = 0f

    applyReaderModel(
        nextSurahId,
        nextSettings,
        nextTheme,
        nextSurahIntros,
        nextScopeBanner,
        nextVerses,
        nextTopInsetPx,
        nextBottomInsetPx,
    )

    pendingTargetVerseKey = nextTargetVerseKey?.takeIf { it != verses.firstOrNull()?.verseKey }
    adapter.notifyDataSetChanged()
    completeInitialPlacement(nextTargetVerseKey)
  }

  private fun applyMountedReaderState(
      nextSurahId: Int,
      nextSettings: NativeReaderSettings,
      nextTheme: NativeReaderTheme,
      nextSurahIntros: Map<Int, NativeSurahIntro>,
      nextScopeBanner: NativeScopeBanner?,
      nextVerses: List<NativeVerse>,
      nextTopInsetPx: Int,
      nextBottomInsetPx: Int,
  ) {
    val anchor = captureScrollAnchor()
    val previousItemIds = adapterItemIds()

    applyReaderModel(
        nextSurahId,
        nextSettings,
        nextTheme,
        nextSurahIntros,
        nextScopeBanner,
        nextVerses,
        nextTopInsetPx,
        nextBottomInsetPx,
    )

    val nextItemCount = adapter.itemCount
    if (nextItemCount > 0 && previousItemIds.contentEquals(adapterItemIds())) {
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
      nextSurahIntros: Map<Int, NativeSurahIntro>,
      nextScopeBanner: NativeScopeBanner?,
      nextVerses: List<NativeVerse>,
      nextTopInsetPx: Int,
      nextBottomInsetPx: Int,
  ) {
    surahId = nextSurahId
    applySettings(nextSettings)
    fastScroller.setColors(
        nextTheme.backgroundColor,
        nextTheme.textColor,
        nextTheme.tintColor,
    )
    adapter.theme = nextTheme
    adapter.surahIntros = nextSurahIntros
    adapter.scopeBanner = nextScopeBanner
    verses.clear()
    verses.addAll(nextVerses)
    adapter.rebuildRows()
    topInsetPx = nextTopInsetPx
    bottomInsetPx = nextBottomInsetPx
    applyRecyclerPadding()
  }

  private fun adapterItemIds(): LongArray =
      LongArray(adapter.itemCount) { position -> adapter.getItemId(position) }

  /**
   * Anchors the first row below the header inset. Rows scrolled behind the translucent header can
   * change height without moving the verse the reader is actually looking at.
   */
  private fun captureScrollAnchor(): ScrollAnchor? {
    for (childIndex in 0 until recyclerView.childCount) {
      val child = recyclerView.getChildAt(childIndex)
      if (child.bottom <= recyclerView.paddingTop) continue
      val position = recyclerView.getChildAdapterPosition(child)
      if (position == RecyclerView.NO_POSITION || position >= adapter.itemCount) continue
      return ScrollAnchor(itemId = adapter.getItemId(position), offsetTop = child.top)
    }
    return null
  }

  private fun restoreScrollAnchor(anchor: ScrollAnchor?) {
    if (anchor == null) return

    post {
      val position = findAdapterPositionByItemId(anchor.itemId)
      if (position < 0) return@post
      layoutManager.scrollToPositionWithOffset(position, anchor.offsetTop - recyclerView.paddingTop)
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
    // The JS top inset adds a content gap below the translucent header; the scroller starts at
    // the header edge instead so its track lines up with the shared IndexScrubber.
    fastScroller.setInsets((topInsetPx - dp(16)).coerceAtLeast(0), bottomInsetPx)
  }

  private fun applyReaderInsets(nextTopInsetPx: Int, nextBottomInsetPx: Int) {
    topInsetPx = nextTopInsetPx
    bottomInsetPx = nextBottomInsetPx
    applyRecyclerPadding()
    recyclerView.postInvalidateOnAnimation()
    fastScroller.postInvalidateOnAnimation()
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
    requestActiveAudioRedraw()
    if (previousActiveVerseKey != nextActiveVerseKey) {
      requestActiveAudioFollow(nextActiveVerseKey)
    }
  }

  private fun notifyVerseActiveAudioChanged(verseKey: String?) {
    if (verseKey.isNullOrBlank()) return
    val index = verses.indexOfFirst { it.verseKey == verseKey }
    if (index >= 0) {
      val adapterPosition = adapter.adapterPositionForVerseIndex(index)
      val holder = recyclerView.findViewHolderForAdapterPosition(adapterPosition) ?: return
      adapter.updateAttachedActiveAudio(holder)
    }
  }

  private fun requestActiveAudioRedraw() {
    recyclerView.postInvalidateOnAnimation()
    postInvalidateOnAnimation()
    if (isActiveAudioRedrawScheduled) return

    isActiveAudioRedrawScheduled = true
    recyclerView.postOnAnimation {
      isActiveAudioRedrawScheduled = false
      for (childIndex in 0 until recyclerView.childCount) {
        val holder = recyclerView.getChildViewHolder(recyclerView.getChildAt(childIndex))
        adapter.updateAttachedActiveAudio(holder)
      }
      recyclerView.invalidate()
      this@NativeSurahReaderView.invalidate()
    }
  }

  private fun requestActiveAudioFollow(verseKey: String?) {
    if (verseKey.isNullOrBlank()) return
    pendingActiveAudioFollowVerseKey = verseKey
    if (isActiveAudioFollowScheduled) return

    isActiveAudioFollowScheduled = true
    recyclerView.postOnAnimation {
      isActiveAudioFollowScheduled = false
      val targetVerseKey = pendingActiveAudioFollowVerseKey ?: return@postOnAnimation
      pendingActiveAudioFollowVerseKey = null
      val verseIndex = verses.indexOfFirst { it.verseKey == targetVerseKey }
      if (verseIndex < 0) return@postOnAnimation

      recyclerView.stopScroll()
      val smoothScroller =
          object : LinearSmoothScroller(reactContext) {
            override fun getVerticalSnapPreference(): Int = SNAP_TO_ANY

            override fun calculateDtToFit(
                viewStart: Int,
                viewEnd: Int,
                boxStart: Int,
                boxEnd: Int,
                snapPreference: Int,
            ): Int {
              val viewHeight = viewEnd - viewStart
              val viewportHeight = boxEnd - boxStart
              if (viewHeight >= viewportHeight) {
                return boxStart + dp(48) - viewStart
              }

              val centeredTop = boxStart + (viewportHeight - viewHeight) / 2
              return centeredTop - viewStart
            }
          }
      smoothScroller.targetPosition = adapter.adapterPositionForVerseIndex(verseIndex)
      layoutManager.startSmoothScroll(smoothScroller)
    }
  }

  private fun completeInitialPlacementIfReady() {
    if (!hasReceivedVerses || !hasReceivedSettings || !hasReceivedTheme) return

    completeInitialPlacement(pendingTargetVerseKey)
  }

  private fun completeInitialPlacement(targetVerseKey: String?) {
    val placementGeneration = ++initialPlacementGeneration
    // Queue the requested adapter position before returning from the prop/state update. This makes
    // the target, rather than the intro row, RecyclerView's very first native layout anchor.
    val placement = positionInitialTarget(targetVerseKey) ?: return
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

  private fun positionInitialTarget(targetVerseKey: String?): InitialPlacement? {
    if (verses.isEmpty()) return null
    val targetIndex =
        targetVerseKey?.let { key -> verses.indexOfFirst { it.verseKey == key } }?.takeIf { it >= 0 }
            ?: 0
    // Opening at the first verse shows whatever leads it (banner, Surah intro).
    val adapterPosition = if (targetIndex == 0) 0 else adapter.adapterPositionForVerseIndex(targetIndex)
    layoutManager.scrollToPositionWithOffset(adapterPosition, 0)
    if (pendingTargetVerseKey == targetVerseKey) {
      pendingTargetVerseKey = null
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
    val nextTranslationNames = parseTranslationNames(settings?.getArrayIfPresent("translationNames"))
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
        translationNames = nextTranslationNames,
        displayMode = nextDisplayMode,
        showByWords = nextShowByWords,
        tajweed = nextTajweed,
        audioWordSyncEnabled = nextAudioWordSyncEnabled,
        showTranslationAttribution = nextShowTranslationAttribution,
        wordLang = nextWordLang,
    )
  }

  private fun applySettings(settings: NativeReaderSettings) {
    currentWordPressSource =
        if (settings.displayMode == DISPLAY_MODE_TAJWEED) "tajweed" else "translation"
    adapter.arabicFontFace = settings.arabicFontFace
    adapter.arabicFontSize = settings.arabicFontSize
    adapter.contentLanguage = settings.contentLanguage
    adapter.translationFontSize = settings.translationFontSize
    adapter.translationIds = settings.translationIds
    adapter.translationNames = settings.translationNames
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

  private fun parseTranslationNames(incoming: ReadableArray?): Map<Int, String> {
    if (incoming == null) return emptyMap()
    val names = linkedMapOf<Int, String>()
    for (index in 0 until incoming.size()) {
      val item = incoming.getMap(index) ?: continue
      val id = item.getDoubleIfPresent("id")?.toInt()?.takeIf { it > 0 } ?: continue
      val name = item.getStringIfPresent("name")?.trim()?.takeIf { it.isNotBlank() } ?: continue
      names[id] = name
    }
    return names
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
    val topVerse = findTopFullyVisibleVerse(firstPosition, lastPosition) ?: verse
    if (
        !force &&
            lastVisibleVerseKey == verse.verseKey &&
            lastTopFullyVisibleVerseKey == topVerse.verseKey
    ) {
      return
    }
    lastVisibleVerseKey = verse.verseKey
    lastTopFullyVisibleVerseKey = topVerse.verseKey
    dispatchEvent(
        EVENT_VISIBLE_VERSE_CHANGE,
        Arguments.createMap().apply {
          putInt("verseNumber", verse.verseNumber)
          putString("verseKey", verse.verseKey)
          verse.verseApiId?.let { putInt("verseApiId", it) }
          putString("topFullyVisibleVerseKey", topVerse.verseKey)
        },
    )
  }

  /**
   * Rows scroll under the translucent header (`clipToPadding = false`), so RecyclerView's first
   * visible item is often a verse the reader can no longer see. Mode switches anchor on the first
   * verse whose top edge sits below the header instead; a verse taller than the viewport falls back
   * to the one crossing the header line.
   */
  private fun findTopFullyVisibleVerse(firstPosition: Int, lastPosition: Int): NativeVerse? {
    val visibleTop = recyclerView.paddingTop - dp(2)
    var crossingVerse: NativeVerse? = null
    for (position in firstPosition..lastPosition) {
      val verseIndex = adapter.verseIndexForAdapterPosition(position)
      if (verseIndex !in verses.indices) continue
      if (adapter.adapterPositionForVerseIndex(verseIndex) != position) continue
      val view = layoutManager.findViewByPosition(position) ?: continue
      if (view.top >= visibleTop) return verses[verseIndex]
      if (crossingVerse == null && view.bottom > recyclerView.paddingTop) {
        crossingVerse = verses[verseIndex]
      }
    }
    return crossingVerse
  }

  private fun dispatchEvent(eventName: String, data: WritableMap) {
    val surfaceId = UIManagerHelper.getSurfaceId(this)
    val dispatcher: EventDispatcher? = UIManagerHelper.getEventDispatcher(reactContext)
    dispatcher?.dispatchEvent(NativeSurahReaderEvent(surfaceId, id, eventName, data))
  }

  companion object {
    const val EVENT_TRANSLATION_AVAILABILITY = "topTranslationAvailability"
    const val EVENT_READY = "topReady"
    const val EVENT_INITIAL_POSITIONED = "topInitialPositioned"
    const val EVENT_VISIBLE_VERSE_CHANGE = "topVisibleVerseChange"
    const val EVENT_VERSE_ACTION_PRESS = "topVerseActionPress"
    const val EVENT_WORD_PRESS = "topWordPress"
    const val EVENT_SCROLL = "topScroll"
    const val EVENT_LOAD_ERROR = "topLoadError"
    private const val TRANSLATION_REVEAL_DURATION_MS = 220L
    private val databaseExecutor: ExecutorService = Executors.newFixedThreadPool(2)
  }
}
