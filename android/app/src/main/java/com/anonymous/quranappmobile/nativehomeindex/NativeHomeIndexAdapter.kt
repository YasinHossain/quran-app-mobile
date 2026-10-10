package com.anonymous.quranappmobile.nativehomeindex

import android.view.ViewGroup
import android.view.View
import androidx.recyclerview.widget.RecyclerView

internal class NativeHomeIndexAdapter(
    private val onPress: (NativeHomeIndexItem) -> Unit,
) : RecyclerView.Adapter<RecyclerView.ViewHolder>() {
  var items: List<NativeHomeIndexItem> = emptyList()
  var columns: Int = 1
  var headerHeightPx: Int = 0
  var theme: NativeHomeIndexTheme = NativeHomeIndexTheme.default()

  init {
    setHasStableIds(true)
  }

  override fun getItemCount(): Int = 1 + rowCount

  override fun getItemId(position: Int): Long {
    if (position == 0) return Long.MIN_VALUE
    val first = items.getOrNull((position - 1) * columns) ?: return position.toLong()
    return first.stableId
  }

  override fun getItemViewType(position: Int): Int = if (position == 0) HEADER else ROW

  override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
    if (viewType == HEADER) return HeaderSpacerHolder(View(parent.context))
    return RowHolder(NativeHomeGridRowView(parent.context, onPress))
  }

  override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
    when (holder) {
      is HeaderSpacerHolder -> holder.bind(headerHeightPx, theme.backgroundColor)
      is RowHolder -> holder.bind(items, (position - 1) * columns, columns, theme)
    }
  }

  fun adapterPositionForItemIndex(index: Int): Int = 1 + index.coerceAtLeast(0) / columns

  fun itemIndexForAdapterPosition(position: Int): Int =
      if (position <= 0) 0
      else ((position - 1) * columns).coerceAtMost((items.size - 1).coerceAtLeast(0))

  val rowCount: Int
    get() = if (items.isEmpty()) 0 else (items.size + columns - 1) / columns
  companion object {
    private const val HEADER = 0
    private const val ROW = 1
  }
}

private class HeaderSpacerHolder(private val spacer: View) : RecyclerView.ViewHolder(spacer) {
  fun bind(heightPx: Int, backgroundColor: Int) {
    spacer.setBackgroundColor(backgroundColor)
    spacer.layoutParams = RecyclerView.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        heightPx.coerceAtLeast(0),
    )
  }
}

private class RowHolder(private val row: NativeHomeGridRowView) : RecyclerView.ViewHolder(row) {
  fun bind(
      items: List<NativeHomeIndexItem>,
      startIndex: Int,
      columns: Int,
      theme: NativeHomeIndexTheme,
  ) = row.bind(items, startIndex, columns, theme)
}
