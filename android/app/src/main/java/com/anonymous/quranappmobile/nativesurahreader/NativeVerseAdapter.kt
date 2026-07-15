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
  var surahId: Int = 1
  var surahIntro: NativeSurahIntro? = null
  var activeVerseKey: String? = null
  var activeWord: NativeActiveWord? = null
  var arabicFontFace: String? = null
  var arabicFontSize: Float = 25f
  var contentLanguage: String? = null
  var translationFontSize: Float = 16f
  var translationIds: List<Int> = emptyList()
  var displayMode: String = DISPLAY_MODE_PLAIN
  var showByWords: Boolean = false
  var tajweed: Boolean = false
  var audioWordSyncEnabled: Boolean = false
  var wordAudioSeekEnabled: Boolean = false
  var showTranslationAttribution: Boolean = false
  var wordLang: String? = null
  var theme: NativeReaderTheme = NativeReaderTheme.default()

  init {
    setHasStableIds(true)
  }

  private val introRowCount: Int
    get() = if (surahIntro != null) 1 else 0

  override fun getItemId(position: Int): Long {
    if (position == 0 && surahIntro != null) return Long.MIN_VALUE + surahId
    return items[position - introRowCount].stableId(surahId)
  }

  override fun getItemViewType(position: Int): Int {
    return if (position == 0 && surahIntro != null) VIEW_TYPE_INTRO else VIEW_TYPE_VERSE
  }

  override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
    return if (viewType == VIEW_TYPE_INTRO) {
      NativeSurahIntroViewHolder(NativeSurahIntroRowView(parent.context))
    } else {
      NativeVerseViewHolder(NativeVerseRowView(parent.context, onActionPress, onWordPress))
    }
  }

  override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
    when (holder) {
      is NativeSurahIntroViewHolder -> {
        surahIntro?.let { holder.bind(it, theme) }
      }
      is NativeVerseViewHolder -> {
        holder.bind(
            items[position - introRowCount],
            activeVerseKey,
            activeWord,
            arabicFontFace,
            arabicFontSize,
            translationFontSize,
            displayMode,
            showByWords,
            audioWordSyncEnabled,
            wordAudioSeekEnabled,
            showTranslationAttribution,
            theme,
        )
      }
    }
  }

  override fun onBindViewHolder(
      holder: RecyclerView.ViewHolder,
      position: Int,
      payloads: MutableList<Any>
  ) {
    if (payloads.contains(PAYLOAD_ACTIVE_AUDIO) && holder is NativeVerseViewHolder) {
      holder.bindActiveAudio(activeVerseKey, activeWord)
      return
    }

    super.onBindViewHolder(holder, position, payloads)
  }

  override fun getItemCount(): Int = items.size + introRowCount

  fun adapterPositionForVerseIndex(verseIndex: Int): Int = verseIndex + introRowCount

  fun verseIndexForAdapterPosition(position: Int): Int = position - introRowCount

  companion object {
    private const val VIEW_TYPE_INTRO = 0
    private const val VIEW_TYPE_VERSE = 1
    const val PAYLOAD_ACTIVE_AUDIO = "activeAudio"
  }
}

internal class NativeSurahIntroViewHolder(private val row: NativeSurahIntroRowView) :
    RecyclerView.ViewHolder(row) {
  fun bind(intro: NativeSurahIntro, theme: NativeReaderTheme) {
    row.bind(intro, theme)
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
      wordAudioSeekEnabled: Boolean,
      showTranslationAttribution: Boolean,
      theme: NativeReaderTheme,
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
        wordAudioSeekEnabled,
        showTranslationAttribution,
        theme,
    )
  }

  fun bindActiveAudio(activeVerseKey: String?, activeWord: NativeActiveWord?) {
    row.bindActiveAudio(activeVerseKey, activeWord)
  }
}
