package com.anonymous.quranappmobile.nativehomeindex

import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event

internal class NativeHomeIndexEvent(
    surfaceId: Int,
    viewId: Int,
    private val nativeEventName: String,
    private val payload: WritableMap,
) : Event<NativeHomeIndexEvent>(surfaceId, viewId) {
  override fun getEventName(): String = nativeEventName
  override fun getEventData(): WritableMap = payload
}
