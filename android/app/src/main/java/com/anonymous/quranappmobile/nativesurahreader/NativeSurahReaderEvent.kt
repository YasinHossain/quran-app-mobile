package com.anonymous.quranappmobile.nativesurahreader

import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event

internal class NativeSurahReaderEvent(
    surfaceId: Int,
    viewId: Int,
    private val eventNameValue: String,
    private val eventData: WritableMap,
) : Event<NativeSurahReaderEvent>(surfaceId, viewId) {
  override fun getEventName(): String = eventNameValue

  override fun getEventData(): WritableMap = eventData
}
