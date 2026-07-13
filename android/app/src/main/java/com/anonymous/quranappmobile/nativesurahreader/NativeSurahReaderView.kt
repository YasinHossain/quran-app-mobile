package com.anonymous.quranappmobile.nativesurahreader

import android.graphics.Color
import android.widget.LinearLayout
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.EventDispatcher

class NativeSurahReaderView(private val reactContext: ThemedReactContext) : LinearLayout(reactContext) {
  private val verses = mutableListOf<NativeVerse>()
  private val layoutManager = LinearLayoutManager(reactContext)
  private val adapter =
      NativeVerseAdapter(verses) { verse ->
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
      }
  private val recyclerView =
      RecyclerView(reactContext).apply {
        this.layoutManager = this@NativeSurahReaderView.layoutManager
        this.adapter = this@NativeSurahReaderView.adapter
        clipToPadding = false
        setBackgroundColor(Color.rgb(248, 250, 252))
        addOnScrollListener(
            object : RecyclerView.OnScrollListener() {
              override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
                dispatchScrollEvent()
                dispatchVisibleVerseEvent()
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
  private var isInitialContentVisible = false

  init {
    orientation = VERTICAL
    recyclerView.alpha = 0f
    addView(recyclerView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
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

  fun setSurahIntro(incomingSurahIntro: ReadableMap?) {
    adapter.surahIntro = incomingSurahIntro?.toNativeSurahIntro()
    adapter.notifyDataSetChanged()
    completeInitialPlacementIfReady()
  }

  fun setVerses(incomingVerses: ReadableArray?) {
    verses.clear()
    hasReceivedVerses = true
    lastVisibleVerseKey = null
    if (incomingVerses != null) {
      for (index in 0 until incomingVerses.size()) {
        val map = incomingVerses.getMap(index) ?: continue
        val verse = map.toNativeVerse() ?: continue
        verses.add(verse)
      }
    }
    adapter.notifyDataSetChanged()
    completeInitialPlacementIfReady()
  }

  fun setSettings(settings: ReadableMap?) {
    hasReceivedSettings = true
    val nextArabicFontFace = settings?.getStringIfPresent("arabicFontFace")
    val nextArabicFontSize = settings?.getDoubleIfPresent("arabicFontSize")?.toFloat() ?: 25f
    val nextTranslationFontSize =
        settings?.getDoubleIfPresent("translationFontSize")?.toFloat() ?: 16f
    val nextShowByWords = settings?.getBooleanIfPresent("showByWords") ?: false
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

    if (adapter.arabicFontFace == nextArabicFontFace &&
        adapter.arabicFontSize == nextArabicFontSize &&
        adapter.translationFontSize == nextTranslationFontSize &&
        adapter.displayMode == nextDisplayMode &&
        adapter.showByWords == nextShowByWords &&
        adapter.showTranslationAttribution == nextShowTranslationAttribution) {
      completeInitialPlacementIfReady()
      return
    }

    adapter.arabicFontFace = nextArabicFontFace
    adapter.arabicFontSize = nextArabicFontSize
    adapter.translationFontSize = nextTranslationFontSize
    adapter.displayMode = nextDisplayMode
    adapter.showByWords = nextShowByWords
    adapter.showTranslationAttribution = nextShowTranslationAttribution
    adapter.notifyDataSetChanged()
    completeInitialPlacementIfReady()
  }

  fun setActiveVerseKey(activeVerseKey: String?) {
    val nextActiveVerseKey = activeVerseKey?.takeIf { it.isNotBlank() }
    val previousActiveVerseKey = adapter.activeVerseKey
    if (previousActiveVerseKey == nextActiveVerseKey) return

    adapter.activeVerseKey = nextActiveVerseKey
    notifyVerseChanged(previousActiveVerseKey)
    notifyVerseChanged(nextActiveVerseKey)
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
    adapter.theme = readerTheme
    adapter.notifyDataSetChanged()
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

  private fun applyRecyclerPadding() {
    recyclerView.setPadding(
        dp(16),
        topInsetPx,
        dp(16),
        bottomInsetPx,
    )
  }

  private fun dp(value: Int): Int {
    return (value * resources.displayMetrics.density).toInt()
  }

  private fun notifyVerseChanged(verseKey: String?) {
    if (verseKey.isNullOrBlank()) return
    val index = verses.indexOfFirst { it.verseKey == verseKey }
    if (index >= 0) {
      adapter.notifyItemChanged(adapter.adapterPositionForVerseIndex(index))
    }
  }

  private fun completeInitialPlacementIfReady() {
    if (!hasReceivedVerses || !hasReceivedSettings || !hasReceivedTheme) return

    post {
      pendingTargetVerse?.let { targetVerse ->
        scrollToVerse(targetVerse, false)
      }
      if (!hasDispatchedInitialReady) {
        hasDispatchedInitialReady = true
        dispatchEvent(EVENT_READY, Arguments.createMap())
      }
      dispatchVisibleVerseEvent(force = true)
      if (!isInitialContentVisible) {
        isInitialContentVisible = true
        recyclerView.alpha = 1f
      }
    }
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
    const val EVENT_VISIBLE_VERSE_CHANGE = "topVisibleVerseChange"
    const val EVENT_VERSE_ACTION_PRESS = "topVerseActionPress"
    const val EVENT_SCROLL = "topScroll"
  }
}
