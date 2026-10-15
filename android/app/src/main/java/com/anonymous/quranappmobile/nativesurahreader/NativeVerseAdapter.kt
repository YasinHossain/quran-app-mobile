package com.anonymous.quranappmobile.nativesurahreader

import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView

internal const val DISPLAY_MODE_PLAIN = "plain"
internal const val DISPLAY_MODE_TAJWEED = "tajweed"
internal const val DISPLAY_MODE_WORD_BY_WORD = "wordByWord"

internal class NativeVerseAdapter(
    private val items: List<NativeVerse>,
    private val onActionPress: (NativeVerse) -> Unit,
    private val onWordPress: (NativeVerse, NativeWord) -> Unit,
) : RecyclerView.Adapter<RecyclerView.ViewHolder>() {
  var surahIntros: Map<Int, NativeSurahIntro> = emptyMap()
  var scopeBanner: NativeScopeBanner? = null
  var activeVerseKey: String? = null
  var activeWord: NativeActiveWord? = null
  var arabicFontFace: String? = null
  var arabicFontSize: Float = 25f
  var contentLanguage: String? = null
  var translationFontSize: Float = 16f
  var translationIds: List<Int> = emptyList()
  var translationNames: Map<Int, String> = emptyMap()
  var displayMode: String = DISPLAY_MODE_PLAIN
  var showByWords: Boolean = false
  var tajweed: Boolean = false
  var audioWordSyncEnabled: Boolean = false
  var wordPressEnabled: Boolean = false
  var showTranslationAttribution: Boolean = false
  var wordLang: String? = null
  var theme: NativeReaderTheme = NativeReaderTheme.default()

  init {
    setHasStableIds(true)
  }

  private var rows: List<NativeReaderRow> = emptyList()
  private var verseAdapterPositions = IntArray(0)

  /** Call after any change to the verse list, Surah intros or banner; rows index into [items]. */
  fun rebuildRows() {
    rows = buildNativeReaderRows(items, surahIntros, scopeBanner)
    verseAdapterPositions = IntArray(items.size)
    rows.forEachIndexed { position, row ->
      if (row is NativeReaderRow.Verse) verseAdapterPositions[row.verseIndex] = position
    }
  }

  fun surahNameFor(verse: NativeVerse): String? = surahIntros[verse.surahNumber]?.surahName

  override fun getItemId(position: Int): Long {
    return when (val row = rows[position]) {
      is NativeReaderRow.Banner -> BANNER_ROW_ID
      is NativeReaderRow.Intro -> introRowId(row.intro.chapterId)
      is NativeReaderRow.Verse -> items[row.verseIndex].stableId()
    }
  }

  override fun getItemViewType(position: Int): Int {
    return when (rows[position]) {
      is NativeReaderRow.Banner -> VIEW_TYPE_BANNER
      is NativeReaderRow.Intro -> VIEW_TYPE_INTRO
      is NativeReaderRow.Verse -> VIEW_TYPE_VERSE
    }
  }

  override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
    return when (viewType) {
      VIEW_TYPE_BANNER -> NativeScopeBannerViewHolder(NativeScopeBannerRowView(parent.context))
      VIEW_TYPE_INTRO -> NativeSurahIntroViewHolder(NativeSurahIntroRowView(parent.context))
      else -> NativeVerseViewHolder(NativeVerseRowView(parent.context, onActionPress, onWordPress))
    }
  }

  override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
    val row = rows[position]
    when {
      holder is NativeScopeBannerViewHolder && row is NativeReaderRow.Banner -> {
        holder.bind(row.banner, theme)
      }
      holder is NativeSurahIntroViewHolder && row is NativeReaderRow.Intro -> {
        holder.bind(row.intro, theme, row.isLeading)
      }
      holder is NativeVerseViewHolder && row is NativeReaderRow.Verse -> {
        val verse = items[row.verseIndex]
        holder.bind(
            verse,
            activeVerseKey,
            activeWord,
            arabicFontFace,
            arabicFontSize,
            translationFontSize,
            displayMode,
            showByWords,
            audioWordSyncEnabled,
            wordPressEnabled,
            showTranslationAttribution,
            theme,
            surahNameFor(verse),
        )
      }
    }
  }

  override fun onViewAttachedToWindow(holder: RecyclerView.ViewHolder) {
    super.onViewAttachedToWindow(holder)
    updateAttachedActiveAudio(holder)
    updateAttachedWordPress(holder)
  }

  fun updateAttachedWordPress(holder: RecyclerView.ViewHolder) {
    if (holder is NativeVerseViewHolder) {
      holder.updateWordPressEnabled(wordPressEnabled)
    }
  }

  fun updateAttachedActiveAudio(holder: RecyclerView.ViewHolder) {
    if (holder is NativeVerseViewHolder) {
      holder.bindActiveAudio(activeVerseKey, activeWord)
      holder.itemView.invalidate()
    }
  }

  override fun getItemCount(): Int = rows.size

  fun adapterPositionForVerseIndex(verseIndex: Int): Int =
      verseAdapterPositions.getOrNull(verseIndex) ?: verseIndex

  /** The verse at [position], or the verse an intro/banner row introduces. -1 when empty. */
  fun verseIndexForAdapterPosition(position: Int): Int {
    if (position < 0) return -1
    for (index in position until rows.size) {
      val row = rows[index]
      if (row is NativeReaderRow.Verse) return row.verseIndex
    }
    return -1
  }

  companion object {
    private const val VIEW_TYPE_INTRO = 0
    private const val VIEW_TYPE_VERSE = 1
    private const val VIEW_TYPE_BANNER = 2
  }
}

internal class NativeScopeBannerViewHolder(private val row: NativeScopeBannerRowView) :
    RecyclerView.ViewHolder(row) {
  fun bind(banner: NativeScopeBanner, theme: NativeReaderTheme) {
    row.bind(banner, theme)
  }
}

internal class NativeSurahIntroViewHolder(private val row: NativeSurahIntroRowView) :
    RecyclerView.ViewHolder(row) {
  fun bind(intro: NativeSurahIntro, theme: NativeReaderTheme, isLeading: Boolean) {
    row.bind(intro, theme, isLeading)
  }
}

internal class NativeVerseViewHolder(private val row: NativeVerseRowView) :
    RecyclerView.ViewHolder(row) {
  fun bind(
      verse: NativeVerse,
      activeVerseKey: String?,
      activeWord: NativeActiveWord?,
      arabicFontFace: String?,
      arabicFontSize: Float,
      translationFontSize: Float,
      displayMode: String,
      showByWords: Boolean,
      audioWordSyncEnabled: Boolean,
      wordPressEnabled: Boolean,
      showTranslationAttribution: Boolean,
      theme: NativeReaderTheme,
      surahName: String? = null,
  ) {
    row.bind(
        verse,
        activeVerseKey,
        activeWord,
        arabicFontFace,
        arabicFontSize,
        translationFontSize,
        displayMode,
        showByWords,
        audioWordSyncEnabled,
        wordPressEnabled,
        showTranslationAttribution,
        theme,
        surahName,
    )
  }

  fun bindActiveAudio(activeVerseKey: String?, activeWord: NativeActiveWord?) {
    row.bindActiveAudio(activeVerseKey, activeWord)
  }

  fun updateWordPressEnabled(enabled: Boolean) {
    row.updateWordPressEnabled(enabled)
  }

  fun fadeInTranslations(verseKeys: Set<String>, resourceIds: Set<Int>, durationMs: Long) {
    row.fadeInTranslations(verseKeys, resourceIds, durationMs)
  }
}
