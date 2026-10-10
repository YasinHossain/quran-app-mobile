package com.anonymous.quranappmobile.nativehomeindex

import android.view.View
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewGroupManager
import com.facebook.react.uimanager.annotations.ReactProp

class NativeHomeIndexViewManager : ViewGroupManager<NativeHomeIndexView>() {
  override fun getName(): String = REACT_CLASS
  override fun createViewInstance(context: ThemedReactContext) = NativeHomeIndexView(context)

  override fun addView(parent: NativeHomeIndexView, child: View, index: Int) =
      parent.addReactHeaderChild(child, index)

  override fun getChildCount(parent: NativeHomeIndexView): Int = parent.reactHeaderChildCount()
  override fun getChildAt(parent: NativeHomeIndexView, index: Int): View = parent.reactHeaderChildAt(index)
  override fun removeViewAt(parent: NativeHomeIndexView, index: Int) = parent.removeReactHeaderChildAt(index)

  override fun getCommandsMap() = mutableMapOf(COMMAND_SCROLL_TO_TOP to COMMAND_SCROLL_TO_TOP_ID)

  override fun receiveCommand(view: NativeHomeIndexView, commandId: String, args: ReadableArray?) {
    if (commandId == COMMAND_SCROLL_TO_TOP) {
      view.scrollToTop(if (args != null && args.size() > 0) args.getBoolean(0) else true)
    }
  }

  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> = mutableMapOf(
      NativeHomeIndexView.EVENT_ITEM_PRESS to mutableMapOf("registrationName" to "onItemPress"),
      NativeHomeIndexView.EVENT_TAB_PRESS to mutableMapOf("registrationName" to "onTabPress"),
      NativeHomeIndexView.EVENT_HEADER_VISIBILITY_CHANGE to
          mutableMapOf("registrationName" to "onHeaderVisibilityChange"),
  )

  @ReactProp(name = "content")
  fun setContent(view: NativeHomeIndexView, content: ReadableMap?) = view.setContent(content)

  @ReactProp(name = "numColumns", defaultInt = 1)
  fun setNumColumns(view: NativeHomeIndexView, value: Int) = view.setNumColumns(value)

  @ReactProp(name = "headerHeight", defaultFloat = 0f)
  fun setHeaderHeight(view: NativeHomeIndexView, value: Float) = view.setHeaderHeight(value)

  @ReactProp(name = "headerIntroHeight", defaultFloat = 0f)
  fun setHeaderIntroHeight(view: NativeHomeIndexView, value: Float) = view.setHeaderIntroHeight(value)

  @ReactProp(name = "tabsHeight", defaultFloat = 0f)
  fun setTabsHeight(view: NativeHomeIndexView, value: Float) = view.setTabsHeight(value)

  @ReactProp(name = "bottomInset", defaultFloat = 0f)
  fun setBottomInset(view: NativeHomeIndexView, value: Float) = view.setBottomInset(value)

  @ReactProp(name = "theme")
  fun setTheme(view: NativeHomeIndexView, theme: ReadableMap?) = view.setTheme(theme)

  companion object {
    const val REACT_CLASS = "NativeHomeIndex"
    private const val COMMAND_SCROLL_TO_TOP = "scrollToTop"
    private const val COMMAND_SCROLL_TO_TOP_ID = 1
  }
}
