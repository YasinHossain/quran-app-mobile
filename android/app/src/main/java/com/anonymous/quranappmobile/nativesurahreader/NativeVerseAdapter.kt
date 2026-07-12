package com.anonymous.quranappmobile.nativesurahreader

import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView

internal class NativeVerseAdapter(
    private val items: List<NativeVerse>,
    private val onActionPress: (NativeVerse) -> Unit,
) : RecyclerView.Adapter<NativeVerseViewHolder>() {
  var surahId: Int = 1
  var activeVerseKey: String? = null
  var arabicFontFace: String? = null
  var arabicFontSize: Float = 25f
  var translationFontSize: Float = 16f
  var showTranslationAttribution: Boolean = false
  var theme: NativeReaderTheme = NativeReaderTheme.default()

  init {
    setHasStableIds(true)
  }

  override fun getItemId(position: Int): Long = items[position].stableId(surahId)

  override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): NativeVerseViewHolder {
    return NativeVerseViewHolder(NativeVerseRowView(parent.context, onActionPress))
  }

  override fun onBindViewHolder(holder: NativeVerseViewHolder, position: Int) {
    holder.bind(
        items[position],
        activeVerseKey,
        arabicFontFace,
        arabicFontSize,
        translationFontSize,
        showTranslationAttribution,
        theme,
    )
  }

  override fun getItemCount(): Int = items.size
}

internal class NativeVerseViewHolder(private val row: NativeVerseRowView) :
    RecyclerView.ViewHolder(row) {
  fun bind(
      verse: NativeVerse,
      activeVerseKey: String?,
      arabicFontFace: String?,
      arabicFontSize: Float,
      translationFontSize: Float,
      showTranslationAttribution: Boolean,
      theme: NativeReaderTheme,
  ) {
    row.bind(
        verse,
        activeVerseKey,
        arabicFontFace,
        arabicFontSize,
        translationFontSize,
        showTranslationAttribution,
        theme,
    )
  }
}
