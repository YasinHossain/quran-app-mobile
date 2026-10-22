package com.anonymous.quranappmobile

import com.anonymous.quranappmobile.versespotlight.VerseSpotlightProcess
import com.anonymous.quranappmobile.versespotlight.VerseSpotlightWidgetPackage

import android.app.Activity
import android.app.Application
import android.content.res.Configuration
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.File

import com.anonymous.quranappmobile.nativesurahreader.NativeSurahReaderPackage
import com.anonymous.quranappmobile.nativehomeindex.NativeHomeIndexPackage
import com.facebook.react.PackageList
import com.facebook.react.ReactActivity
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          add(NativeSurahReaderPackage())
          add(NativeHomeIndexPackage())
          add(VerseSpotlightWidgetPackage())
        }
    )
  }

  override fun onCreate() {
    super.onCreate()
    if (VerseSpotlightProcess.isWidgetProcess(this)) return
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
    registerActivityLifecycleCallbacks(OpaqueReactWindowCallbacks)
    registerActivityLifecycleCallbacks(MushafWebViewWarmup)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    if (VerseSpotlightProcess.isWidgetProcess(this)) return
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}

/**
 * The React root always paints the theme background over the whole window, so the window's own
 * background is a hidden full-screen fill drawn every frame. Budget GPUs pay for each such layer
 * on every animation frame, so drop it once the app window is showing. The launch splash is its
 * own window/overlay, so startup is unaffected.
 */
private object OpaqueReactWindowCallbacks : Application.ActivityLifecycleCallbacks {
  override fun onActivityResumed(activity: Activity) {
    if (activity is ReactActivity) activity.window.setBackgroundDrawable(null)
  }

  override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit
  override fun onActivityStarted(activity: Activity) = Unit
  override fun onActivityPaused(activity: Activity) = Unit
  override fun onActivityStopped(activity: Activity) = Unit
  override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
  override fun onActivityDestroyed(activity: Activity) = Unit
}

/**
 * Starts the process's first WebView while the launch splash still covers the window, for users
 * who read in a WebView Mushaf (JS keeps the marker file in sync; see StartupResourcePrefetch).
 *
 * Chromium's startup initializes Vulkan in the app process. On Adreno phones whose UI renders with
 * OpenGL (seen on a Galaxy M14, Android 14), that corrupts ~4 frames of the whole window, so doing
 * it after Home is showing flickers whatever is on screen. A cold Mushaf reader would otherwise pay
 * the ~235 ms Chromium startup during its push.
 */
private object MushafWebViewWarmup : Application.ActivityLifecycleCallbacks {
  private const val MARKER_FILE = "warm-mushaf-webview-on-launch"
  private const val TIMEOUT_MS = 4_000L
  private const val WARMUP_HTML = "<!doctype html><html><body></body></html>"

  private var started = false

  override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {
    if (started || activity !is ReactActivity) return
    started = true
    if (!File(activity.filesDir, MARKER_FILE).exists()) return

    // Runs once the React root is attached, so the WebView goes underneath it.
    activity.window.decorView.post { start(activity) }
  }

  private fun start(activity: Activity) {
    if (activity.isFinishing || activity.isDestroyed) return
    val content = activity.findViewById<ViewGroup>(android.R.id.content) ?: return
    val webView =
        try {
          WebView(activity)
        } catch (error: RuntimeException) {
          // WebView provider missing or updating; the reader reports it when it opens.
          return
        }
    var finished = false
    val finish = {
      if (!finished) {
        finished = true
        content.removeView(webView)
        webView.destroy()
      }
    }
    webView.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
    webView.webViewClient =
        object : WebViewClient() {
          override fun onPageFinished(view: WebView, url: String?) = finish()
        }
    content.addView(webView, 0, ViewGroup.LayoutParams(1, 1))
    webView.loadData(WARMUP_HTML, "text/html", null)
    webView.postDelayed({ finish() }, TIMEOUT_MS)
  }

  override fun onActivityStarted(activity: Activity) = Unit
  override fun onActivityResumed(activity: Activity) = Unit
  override fun onActivityPaused(activity: Activity) = Unit
  override fun onActivityStopped(activity: Activity) = Unit
  override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
  override fun onActivityDestroyed(activity: Activity) = Unit
}
