package com.anonymous.quranappmobile.perfidle

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.common.annotations.FrameworkAPI
import com.facebook.react.common.annotations.UnstableReactNativeAPI
import com.facebook.react.uimanager.ViewManager
import java.io.File

class IdleHeapModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "IdleHeapDiagnostic"

  @ReactMethod(isBlockingSynchronousMethod = true)
  @OptIn(FrameworkAPI::class, UnstableReactNativeAPI::class)
  fun capture(): String {
    System.loadLibrary("idleheap")
    val pointer = context.javaScriptContextHolder?.get() ?: error("JS runtime unavailable")
    check(pointer != 0L) { "JS runtime pointer is null" }
    val path = File(context.filesDir, "idle-home.heapsnapshot").absolutePath
    captureNative(pointer, path)
    return path
  }

  private external fun captureNative(pointer: Long, path: String)
}

class IdleHeapPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(IdleHeapModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
