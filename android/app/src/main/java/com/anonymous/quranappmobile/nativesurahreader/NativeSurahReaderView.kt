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

  init {
    orientation = VERTICAL
    addView(recyclerView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  fun setSurahId(surahId: Int) {
    this.surahId = surahId
    adapter.surahId = surahId
    adapter.notifyDataSetChanged()
  }

  fun setTargetVerse(targetVerse: Int) {
    if (targetVerse > 0) {
      pendingTargetVerse = targetVerse
      post { scrollToVerse(targetVerse, false) }
    }
  }

  fun setVerses(incomingVerses: ReadableArray?) {
    verses.clear()
    if (incomingVerses != null) {
      for (index in 0 until incomingVerses.size()) {
        val map = incomingVerses.getMap(index) ?: continue
        val verse = map.toNativeVerse() ?: continue
        verses.add(verse)
      }
    }
    adapter.notifyDataSetChanged()
    post {
      pendingTargetVerse?.let { targetVerse ->
        scrollToVerse(targetVerse, false)
      }
      dispatchEvent(EVENT_READY, Arguments.createMap())
      dispatchVisibleVerseEvent(force = true)
    }
  }

  fun setSettings(settings: ReadableMap?) {
    adapter.arabicFontFace = settings?.getStringIfPresent("arabicFontFace")
    adapter.arabicFontSize = settings?.getDoubleIfPresent("arabicFontSize")?.toFloat() ?: 25f
    adapter.translationFontSize =
        settings?.getDoubleIfPresent("translationFontSize")?.toFloat() ?: 16f
    adapter.showTranslationAttribution =
        settings?.getBooleanIfPresent("showTranslationAttribution") ?: false
    adapter.notifyDataSetChanged()
  }

  fun setActiveVerseKey(activeVerseKey: String?) {
    adapter.activeVerseKey = activeVerseKey?.takeIf { it.isNotBlank() }
    adapter.notifyDataSetChanged()
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
    val readerTheme = NativeReaderTheme.fromReadableMap(theme)
    setBackgroundColor(readerTheme.backgroundColor)
    recyclerView.setBackgroundColor(readerTheme.backgroundColor)
    adapter.theme = readerTheme
    adapter.notifyDataSetChanged()
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
      recyclerView.smoothScrollToPosition(index)
      return
    }

    layoutManager.scrollToPositionWithOffset(index, topInsetPx)
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

  private fun dispatchScrollEvent() {
    dispatchEvent(
        EVENT_SCROLL,
        Arguments.createMap().apply {
          putDouble("contentOffsetY", recyclerView.computeVerticalScrollOffset().toDouble())
        },
    )
  }

  private fun dispatchVisibleVerseEvent(force: Boolean = false) {
    val index = layoutManager.findFirstVisibleItemPosition()
    if (index < 0 || index >= verses.size) return
    val verse = verses[index]
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
