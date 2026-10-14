package com.anonymous.quranappmobile

import com.anonymous.quranappmobile.versespotlight.VerseSpotlightProcess
import com.anonymous.quranappmobile.versespotlight.VerseSpotlightWidgetPackage

import android.app.Activity
import android.app.Application
import android.content.res.Configuration
import android.os.Bundle

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
