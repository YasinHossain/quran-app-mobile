package com.anonymous.quranappmobile

import com.anonymous.quranappmobile.versespotlight.VerseSpotlightProcess
import com.anonymous.quranappmobile.versespotlight.VerseSpotlightWidgetPackage

import android.app.Application
import android.content.res.Configuration

import com.anonymous.quranappmobile.nativesurahreader.NativeSurahReaderPackage
import com.facebook.react.PackageList
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
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    if (VerseSpotlightProcess.isWidgetProcess(this)) return
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
