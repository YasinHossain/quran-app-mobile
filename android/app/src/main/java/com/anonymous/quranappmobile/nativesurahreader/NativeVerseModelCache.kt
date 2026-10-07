package com.anonymous.quranappmobile.nativesurahreader

internal data class NativeReaderSettings(
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

/** Only content/configuration identity belongs here; playback, insets and scroll targets do not. */
internal data class NativeVerseModelKey(
    val surahId: Int,
    val revision: String,
    val settings: NativeReaderSettings,
    val theme: NativeReaderTheme,
)

internal class NativeVerseModel(val verses: List<NativeVerse>) {
  val contentHash: Int = verses.hashCode()
}

/**
 * One immutable parsed snapshot per native reader. No bridge objects or previous Surahs are kept.
 * Settings/theme changes conservatively reparse; absent revisions retain the legacy parsing path.
 */
internal class NativeVerseModelCache {
  private var key: NativeVerseModelKey? = null
  private var model: NativeVerseModel? = null

  fun resolve(nextKey: NativeVerseModelKey?, parse: () -> List<NativeVerse>): NativeVerseModel {
    val previous = model
    if (nextKey != null && nextKey == key && previous != null) return previous

    val next = NativeVerseModel(parse())
    key = nextKey
    model = if (nextKey != null) next else null
    return next
  }

  fun clear() {
    key = null
    model = null
  }
}
