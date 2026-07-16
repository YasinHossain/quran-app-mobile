package com.anonymous.quranappmobile.nativesurahreader

import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class NativeSurahReaderViewManager : SimpleViewManager<NativeSurahReaderView>() {
  override fun getName(): String = REACT_CLASS

  override fun createViewInstance(reactContext: ThemedReactContext): NativeSurahReaderView {
    return NativeSurahReaderView(reactContext)
  }

  override fun getCommandsMap(): MutableMap<String, Int> {
    return mutableMapOf(COMMAND_SCROLL_TO_VERSE to COMMAND_SCROLL_TO_VERSE_ID)
  }

  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> {
    return mutableMapOf(
        NativeSurahReaderView.EVENT_READY to mutableMapOf("registrationName" to "onReady"),
        NativeSurahReaderView.EVENT_INITIAL_POSITIONED to
            mutableMapOf("registrationName" to "onInitialPositioned"),
        NativeSurahReaderView.EVENT_VISIBLE_VERSE_CHANGE to
            mutableMapOf("registrationName" to "onVisibleVerseChange"),
        NativeSurahReaderView.EVENT_VERSE_ACTION_PRESS to
            mutableMapOf("registrationName" to "onVerseActionPress"),
        NativeSurahReaderView.EVENT_WORD_PRESS to mutableMapOf("registrationName" to "onWordPress"),
        NativeSurahReaderView.EVENT_SCROLL to mutableMapOf("registrationName" to "onScroll"),
    )
  }

  override fun receiveCommand(
      view: NativeSurahReaderView,
      commandId: String,
      args: ReadableArray?
  ) {
    when (commandId) {
      COMMAND_SCROLL_TO_VERSE -> {
        val verseNumber = args?.getInt(0) ?: return
        val animated = if (args.size() > 1) args.getBoolean(1) else false
        view.scrollToVerse(verseNumber, animated)
      }
    }
  }

  @ReactProp(name = "surahId")
  fun setSurahId(view: NativeSurahReaderView, surahId: Int) {
    view.setSurahId(surahId)
  }

  @ReactProp(name = "readerState")
  fun setReaderState(view: NativeSurahReaderView, readerState: ReadableMap?) {
    view.setReaderState(readerState)
  }

  @ReactProp(name = "targetVerse")
  fun setTargetVerse(view: NativeSurahReaderView, targetVerse: Int) {
    view.setTargetVerse(targetVerse)
  }

  @ReactProp(name = "surahIntro")
  fun setSurahIntro(view: NativeSurahReaderView, surahIntro: ReadableMap?) {
    view.setSurahIntro(surahIntro)
  }

  @ReactProp(name = "verses")
  fun setVerses(view: NativeSurahReaderView, verses: ReadableArray?) {
    view.setVerses(verses)
  }

  @ReactProp(name = "settings")
  fun setSettings(view: NativeSurahReaderView, settings: ReadableMap?) {
    view.setSettings(settings)
  }

  @ReactProp(name = "activeVerseKey")
  fun setActiveVerseKey(view: NativeSurahReaderView, activeVerseKey: String?) {
    view.setActiveVerseKey(activeVerseKey)
  }

  @ReactProp(name = "activeWord")
  fun setActiveWord(view: NativeSurahReaderView, activeWord: ReadableMap?) {
    view.setActiveWord(activeWord)
  }

  @ReactProp(name = "wordPressEnabled", defaultBoolean = false)
  fun setWordPressEnabled(view: NativeSurahReaderView, enabled: Boolean) {
    view.setWordPressEnabled(enabled)
  }

  @ReactProp(name = "topInsetPx")
  fun setTopInsetPx(view: NativeSurahReaderView, topInsetPx: Float) {
    view.setTopInsetPx(topInsetPx)
  }

  @ReactProp(name = "bottomInsetPx")
  fun setBottomInsetPx(view: NativeSurahReaderView, bottomInsetPx: Float) {
    view.setBottomInsetPx(bottomInsetPx)
  }

  @ReactProp(name = "theme")
  fun setTheme(view: NativeSurahReaderView, theme: ReadableMap?) {
    view.setTheme(theme)
  }

  companion object {
    const val REACT_CLASS = "NativeSurahReader"
    private const val COMMAND_SCROLL_TO_VERSE = "scrollToVerse"
    private const val COMMAND_SCROLL_TO_VERSE_ID = 1
  }
}
