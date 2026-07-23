package com.anonymous.quranappmobile.versespotlight

import android.app.ActivityManager
import android.app.Application
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.util.AtomicFile
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import com.anonymous.quranappmobile.MainActivity
import com.anonymous.quranappmobile.R
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager
import java.io.File
import java.security.MessageDigest
import java.security.SecureRandom
import org.json.JSONArray
import org.json.JSONObject

internal const val SPOTLIGHT_SCHEMA_VERSION = 1
internal const val SPOTLIGHT_SURFACE = "android-widget"
internal const val BUNDLED_SAHIH_ID = 20
internal const val EXPECTED_VERSE_COUNT = 6236

internal data class SpotlightChapter(
    val id: Int,
    val nameSimple: String,
    val nameArabic: String,
    val verseCount: Int,
    val startIndex: Int,
)

internal data class SpotlightFallbackVerse(
    val verseKey: String,
    val arabic: String,
    val translation: String,
)

internal class SpotlightIndex(
    val verseKeys: List<String>,
    val chapters: List<SpotlightChapter>,
    val poolKeys: List<String>,
    val poolVersion: String,
) {
  private val indexByKey = verseKeys.withIndex().associate { it.value to it.index }
  private val chapterById = chapters.associateBy { it.id }

  fun contains(verseKey: String): Boolean = indexByKey.containsKey(verseKey)

  fun previous(verseKey: String): String? {
    val index = indexByKey[verseKey] ?: return null
    return verseKeys.getOrNull(index - 1)
  }

  fun next(verseKey: String): String? {
    val index = indexByKey[verseKey] ?: return null
    return verseKeys.getOrNull(index + 1)
  }

  fun chapter(verseKey: String): SpotlightChapter? {
    val surahId = verseKey.substringBefore(':').toIntOrNull() ?: return null
    return chapterById[surahId]
  }

  fun randomAnchor(currentVerseKey: String?, nextInt: (Int) -> Int): String {
    require(poolKeys.isNotEmpty()) { "Verse Spotlight anchor pool is empty." }
    val currentIndex = poolKeys.indexOf(currentVerseKey)
    if (poolKeys.size == 1 || currentIndex < 0) {
      return poolKeys[nextInt(poolKeys.size).coerceIn(0, poolKeys.lastIndex)]
    }
    val candidate = nextInt(poolKeys.size - 1).coerceIn(0, poolKeys.size - 2)
    return poolKeys[if (candidate >= currentIndex) candidate + 1 else candidate]
  }
}

internal data class WidgetSpotlightState(
    val schemaVersion: Int = SPOTLIGHT_SCHEMA_VERSION,
    val surface: String = SPOTLIGHT_SURFACE,
    val verseKey: String,
    val selectedAt: Long,
    val nextRandomAt: Long? = null,
    val requestedTranslationId: Int,
    val effectiveTranslationId: Int,
    val poolVersion: String,
)

internal fun normalizeWidgetState(
    candidate: WidgetSpotlightState?,
    index: SpotlightIndex,
    requestedTranslationId: Int,
    now: Long,
    nextInt: (Int) -> Int,
): WidgetSpotlightState {
  val requestedId = requestedTranslationId.takeIf { it > 0 } ?: BUNDLED_SAHIH_ID
  val isValid =
      candidate?.schemaVersion == SPOTLIGHT_SCHEMA_VERSION &&
          candidate.surface == SPOTLIGHT_SURFACE &&
          candidate.poolVersion == index.poolVersion &&
          index.contains(candidate.verseKey) &&
          candidate.selectedAt >= 0 &&
          candidate.requestedTranslationId > 0 &&
          candidate.effectiveTranslationId > 0

  if (!isValid) {
    return WidgetSpotlightState(
        verseKey = index.randomAnchor(null, nextInt),
        selectedAt = now,
        requestedTranslationId = requestedId,
        effectiveTranslationId = BUNDLED_SAHIH_ID,
        poolVersion = index.poolVersion,
    )
  }

  return requireNotNull(candidate).copy(
      requestedTranslationId = requestedId,
      effectiveTranslationId =
          if (candidate.requestedTranslationId == requestedId) {
            candidate.effectiveTranslationId
          } else {
            BUNDLED_SAHIH_ID
          },
      nextRandomAt = null,
  )
}

internal interface WidgetStatePersistence {
  fun read(widgetId: Int): WidgetSpotlightState?

  fun write(widgetId: Int, state: WidgetSpotlightState)

  fun remove(widgetId: Int)
}

internal class WidgetStateManager(
    private val persistence: WidgetStatePersistence,
    private val index: SpotlightIndex,
    private val now: () -> Long = System::currentTimeMillis,
    private val nextInt: (Int) -> Int = SecureRandom()::nextInt,
) {
  fun load(widgetId: Int, requestedTranslationId: Int): WidgetSpotlightState {
    val normalized =
        normalizeWidgetState(
            persistence.read(widgetId),
            index,
            requestedTranslationId,
            now(),
            nextInt,
        )
    persistence.write(widgetId, normalized)
    return normalized
  }

  fun save(widgetId: Int, state: WidgetSpotlightState) = persistence.write(widgetId, state)

  fun remove(widgetId: Int) = persistence.remove(widgetId)

  fun navigate(widgetId: Int, requestedTranslationId: Int, action: String): WidgetSpotlightState {
    val current = load(widgetId, requestedTranslationId)
    val target =
        when (action) {
          VerseSpotlightWidgetProvider.ACTION_PREVIOUS -> index.previous(current.verseKey)
          VerseSpotlightWidgetProvider.ACTION_NEXT -> index.next(current.verseKey)
          VerseSpotlightWidgetProvider.ACTION_SHUFFLE ->
              index.randomAnchor(current.verseKey, nextInt)
          else -> null
        } ?: current.verseKey
    val updated =
        current.copy(
            verseKey = target,
            selectedAt = now(),
            nextRandomAt = null,
            effectiveTranslationId = BUNDLED_SAHIH_ID,
        )
    save(widgetId, updated)
    return updated
  }
}

internal class SharedPreferencesWidgetStatePersistence(context: Context) : WidgetStatePersistence {
  private val preferences: SharedPreferences =
      context.getSharedPreferences("verse_spotlight_widget_state_v1", Context.MODE_PRIVATE)

  override fun read(widgetId: Int): WidgetSpotlightState? {
    val raw = preferences.getString(key(widgetId), null) ?: return null
    return runCatching {
          val json = JSONObject(raw)
          WidgetSpotlightState(
              schemaVersion = json.optInt("schemaVersion", 0),
              surface = json.optString("surface", ""),
              verseKey = json.optString("verseKey", ""),
              selectedAt = json.optLong("selectedAt", -1),
              nextRandomAt =
                  if (json.isNull("nextRandomAt")) null else json.optLong("nextRandomAt"),
              requestedTranslationId = json.optInt("requestedTranslationId", 0),
              effectiveTranslationId = json.optInt("effectiveTranslationId", 0),
              poolVersion = json.optString("poolVersion", ""),
          )
        }
        .getOrNull()
  }

  override fun write(widgetId: Int, state: WidgetSpotlightState) {
    val json =
        JSONObject()
            .put("schemaVersion", state.schemaVersion)
            .put("surface", state.surface)
            .put("verseKey", state.verseKey)
            .put("selectedAt", state.selectedAt)
            .put("nextRandomAt", state.nextRandomAt ?: JSONObject.NULL)
            .put("requestedTranslationId", state.requestedTranslationId)
            .put("effectiveTranslationId", state.effectiveTranslationId)
            .put("poolVersion", state.poolVersion)
    preferences.edit().putString(key(widgetId), json.toString()).apply()
  }

  override fun remove(widgetId: Int) {
    preferences.edit().remove(key(widgetId)).apply()
  }

  private fun key(widgetId: Int): String = "widget_$widgetId"
}

internal data class CachedTranslation(
    val translationId: Int,
    val textByVerseKey: Map<String, String>,
)

internal data class WidgetContentSnapshot(
    val requestedTranslationId: Int = BUNDLED_SAHIH_ID,
    val translationSelected: Boolean = true,
    val cachedTranslation: CachedTranslation? = null,
)

internal data class ResolvedWidgetContent(
    val displayText: String,
    val isArabicOnly: Boolean,
    val requestedTranslationId: Int,
    val effectiveTranslationId: Int,
)

internal fun resolveWidgetContent(
    verseKey: String,
    snapshot: WidgetContentSnapshot,
    fallback: SpotlightFallbackVerse,
): ResolvedWidgetContent {
  if (!snapshot.translationSelected) {
    return ResolvedWidgetContent(
        displayText = fallback.arabic,
        isArabicOnly = true,
        requestedTranslationId = snapshot.requestedTranslationId,
        effectiveTranslationId = BUNDLED_SAHIH_ID,
    )
  }

  val cached = snapshot.cachedTranslation
  val selectedText =
      cached
          ?.takeIf { it.translationId == snapshot.requestedTranslationId }
          ?.textByVerseKey
          ?.get(verseKey)
          ?.trim()
          ?.takeIf { it.isNotEmpty() }

  return if (cached != null && selectedText != null) {
    ResolvedWidgetContent(
        displayText = selectedText,
        isArabicOnly = false,
        requestedTranslationId = snapshot.requestedTranslationId,
        effectiveTranslationId = cached.translationId,
    )
  } else {
    ResolvedWidgetContent(
        displayText = fallback.translation,
        isArabicOnly = false,
        requestedTranslationId = snapshot.requestedTranslationId,
        effectiveTranslationId = BUNDLED_SAHIH_ID,
    )
  }
}

internal class VerseSpotlightAssets private constructor(
    val index: SpotlightIndex,
    val fallbackByKey: Map<String, SpotlightFallbackVerse>,
) {
  companion object {
    @Volatile private var cached: VerseSpotlightAssets? = null

    fun load(context: Context): VerseSpotlightAssets {
      cached?.let { return it }
      return synchronized(this) {
        cached ?: read(context.applicationContext).also { cached = it }
      }
    }

    private fun read(context: Context): VerseSpotlightAssets {
      val canonical = readJson(context, "verse_spotlight/canonical-verse-index.json")
      val pool = readJson(context, "verse_spotlight/curated-anchor-pool.json")
      val fallbackBytes = readBytes(context, "verse_spotlight/bundled-sahih.json")
      val fallback = JSONObject(fallbackBytes.toString(Charsets.UTF_8))
      val metadata = readJson(context, "verse_spotlight/bundled-sahih-metadata.json")

      check(canonical.optInt("schemaVersion") == SPOTLIGHT_SCHEMA_VERSION)
      check(canonical.optInt("verseCount") == EXPECTED_VERSE_COUNT)
      val verseKeys = canonical.getJSONArray("verseKeys").toStringList()
      check(verseKeys.size == EXPECTED_VERSE_COUNT)
      check(verseKeys.first() == "1:1" && verseKeys.last() == "114:6")
      check(verseKeys.toSet().size == EXPECTED_VERSE_COUNT)

      val chaptersJson = canonical.getJSONArray("chapters")
      val chapters =
          List(chaptersJson.length()) { position ->
            val chapter = chaptersJson.getJSONObject(position)
            SpotlightChapter(
                id = chapter.getInt("id"),
                nameSimple = chapter.getString("nameSimple"),
                nameArabic = chapter.getString("nameArabic"),
                verseCount = chapter.getInt("verseCount"),
                startIndex = chapter.getInt("startIndex"),
            )
          }
      check(chapters.size == 114)
      chapters.forEach { chapter ->
        check(verseKeys[chapter.startIndex] == "${chapter.id}:1")
        check(
            verseKeys[chapter.startIndex + chapter.verseCount - 1] ==
                "${chapter.id}:${chapter.verseCount}"
        )
      }

      check(pool.optInt("schemaVersion") == SPOTLIGHT_SCHEMA_VERSION)
      val poolKeys = pool.getJSONArray("verseKeys").toStringList()
      check(poolKeys.size == pool.optInt("verseCount") && poolKeys.size > 1)
      check(poolKeys.toSet().size == poolKeys.size)
      check(poolKeys.all { verseKeys.contains(it) })
      val poolVersion = pool.getString("poolVersion")

      check(fallback.getInt("translationId") == BUNDLED_SAHIH_ID)
      val fallbackVerses = fallback.getJSONArray("verses")
      check(fallbackVerses.length() == EXPECTED_VERSE_COUNT)
      val fallbackByKey = LinkedHashMap<String, SpotlightFallbackVerse>(EXPECTED_VERSE_COUNT)
      repeat(fallbackVerses.length()) { position ->
        val verse = fallbackVerses.getJSONObject(position)
        val expectedKey = verseKeys[position]
        check(verse.getString("verseKey") == expectedKey)
        val arabic = verse.getString("arabicUthmani").trim()
        val translation = verse.getString("text").trim()
        check(arabic.isNotEmpty() && translation.isNotEmpty())
        fallbackByKey[expectedKey] = SpotlightFallbackVerse(expectedKey, arabic, translation)
      }

      check(metadata.getInt("translationId") == BUNDLED_SAHIH_ID)
      check(metadata.getInt("verseCount") == EXPECTED_VERSE_COUNT)
      val checksum = metadata.getJSONObject("checksum")
      check(checksum.getString("algorithm").equals("sha256", ignoreCase = true))
      val actualChecksum =
          MessageDigest.getInstance("SHA-256")
              .digest(fallbackBytes)
              .joinToString("") { byte ->
                (byte.toInt() and 0xff).toString(16).padStart(2, '0')
              }
      check(actualChecksum == checksum.getString("value").lowercase())
      val attribution = metadata.getString("translatorName").trim()
      check(attribution.isNotEmpty())

      return VerseSpotlightAssets(
          index = SpotlightIndex(verseKeys, chapters, poolKeys, poolVersion),
          fallbackByKey = fallbackByKey,
      )
    }

    private fun readJson(context: Context, path: String): JSONObject =
        context.assets.open(path).bufferedReader(Charsets.UTF_8).use {
          JSONObject(it.readText())
        }

    private fun readBytes(context: Context, path: String): ByteArray =
        context.assets.open(path).use { it.readBytes() }

    private fun JSONArray.toStringList(): List<String> =
        List(length()) { position -> getString(position) }
  }
}

internal class WidgetContentCache(private val context: Context) {
  fun read(index: SpotlightIndex): WidgetContentSnapshot {
    val file = File(context.filesDir, "verse_spotlight/widget_content_v1.json")
    if (!file.isFile) return WidgetContentSnapshot()
    return runCatching {
          val json = JSONObject(file.readText(Charsets.UTF_8))
          check(json.optInt("schemaVersion") == SPOTLIGHT_SCHEMA_VERSION)
          val requestedId = json.optInt("requestedTranslationId", BUNDLED_SAHIH_ID)
          val translationSelected = json.optBoolean("translationSelected", true)
          check(requestedId > 0)
          val cachedJson = json.optJSONObject("cachedTranslation")
          if (cachedJson == null) {
            WidgetContentSnapshot(
                requestedTranslationId = requestedId,
                translationSelected = translationSelected,
            )
          } else {
            val translationId = cachedJson.getInt("translationId")
            val verses = cachedJson.getJSONArray("verses")
            check(translationId == requestedId)
            check(verses.length() == index.verseKeys.size)
            val textByKey = LinkedHashMap<String, String>(index.verseKeys.size)
            repeat(verses.length()) { position ->
              val verse = verses.getJSONObject(position)
              val expectedKey = index.verseKeys[position]
              check(verse.getString("verseKey") == expectedKey)
              val text = verse.getString("text").trim()
              check(text.isNotEmpty())
              textByKey[expectedKey] = text
            }
            WidgetContentSnapshot(
                requestedTranslationId = requestedId,
                translationSelected = translationSelected,
                cachedTranslation =
                    CachedTranslation(
                        translationId = translationId,
                        textByVerseKey = textByKey,
                    ),
            )
          }
        }
        .getOrElse { WidgetContentSnapshot() }
  }
}

class VerseSpotlightWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(
      context: Context,
      appWidgetManager: AppWidgetManager,
      appWidgetIds: IntArray,
  ) {
    appWidgetIds.forEach { widgetId -> render(context, appWidgetManager, widgetId) }
  }

  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      ACTION_REFRESH -> {
        val manager = AppWidgetManager.getInstance(context)
        val ids = manager.getAppWidgetIds(ComponentName(context, javaClass))
        onUpdate(context, manager, ids)
      }
      ACTION_PREVIOUS, ACTION_SHUFFLE, ACTION_NEXT -> {
        val widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, -1)
        if (widgetId != -1) {
          val assets = VerseSpotlightAssets.load(context)
          val snapshot = WidgetContentCache(context).read(assets.index)
          WidgetStateManager(
                  SharedPreferencesWidgetStatePersistence(context),
                  assets.index,
              )
              .navigate(widgetId, snapshot.requestedTranslationId, intent.action.orEmpty())
          render(context, AppWidgetManager.getInstance(context), widgetId)
        }
      }
      else -> super.onReceive(context, intent)
    }
  }

  override fun onDeleted(context: Context, appWidgetIds: IntArray) {
    val persistence = SharedPreferencesWidgetStatePersistence(context)
    appWidgetIds.forEach(persistence::remove)
    super.onDeleted(context, appWidgetIds)
  }

  private fun render(context: Context, manager: AppWidgetManager, widgetId: Int) {
    val assets = VerseSpotlightAssets.load(context)
    val snapshot = WidgetContentCache(context).read(assets.index)
    val stateManager =
        WidgetStateManager(SharedPreferencesWidgetStatePersistence(context), assets.index)
    var state = stateManager.load(widgetId, snapshot.requestedTranslationId)
    val fallback = assets.fallbackByKey[state.verseKey] ?: return
    val content =
        resolveWidgetContent(
            state.verseKey,
            snapshot,
            fallback,
        )
    state =
        state.copy(
            requestedTranslationId = content.requestedTranslationId,
            effectiveTranslationId = content.effectiveTranslationId,
        )
    stateManager.save(widgetId, state)

    val chapter = assets.index.chapter(state.verseKey) ?: return
    val reference = "${chapter.nameSimple}  •  ${state.verseKey}"
    val views = RemoteViews(context.packageName, R.layout.verse_spotlight_widget)
    val contentIntent =
        Intent(context, VerseSpotlightTextService::class.java)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            .setData(
                Uri.parse(
                    "quranappmobile://widget/$widgetId/content/" +
                        "${Uri.encode(state.verseKey)}/${state.effectiveTranslationId}"
                )
            )
    views.setRemoteAdapter(R.id.verse_spotlight_body, contentIntent)
    views.setTextViewText(R.id.verse_spotlight_metadata, reference)
    views.setContentDescription(
        R.id.verse_spotlight_body,
        "$reference. ${content.displayText}. ${context.getString(R.string.verse_spotlight_open)}",
    )
    val openIntent =
        openPendingIntent(context, widgetId, chapter.id, state.verseKey.substringAfter(':').toInt())
    views.setPendingIntentTemplate(
        R.id.verse_spotlight_body,
        openIntent,
    )
    views.setOnClickPendingIntent(R.id.verse_spotlight_metadata, openIntent)

    bindAction(
        context,
        views,
        widgetId,
        R.id.verse_spotlight_previous,
        ACTION_PREVIOUS,
        assets.index.previous(state.verseKey) != null,
        context.getString(R.string.verse_spotlight_previous),
        1,
    )
    bindAction(
        context,
        views,
        widgetId,
        R.id.verse_spotlight_next,
        ACTION_NEXT,
        assets.index.next(state.verseKey) != null,
        context.getString(R.string.verse_spotlight_next),
        2,
    )
    bindAction(
        context,
        views,
        widgetId,
        R.id.verse_spotlight_shuffle,
        ACTION_SHUFFLE,
        true,
        context.getString(R.string.verse_spotlight_shuffle),
        3,
    )
    manager.updateAppWidget(widgetId, views)
    manager.notifyAppWidgetViewDataChanged(widgetId, R.id.verse_spotlight_body)
  }

  private fun bindAction(
      context: Context,
      views: RemoteViews,
      widgetId: Int,
      viewId: Int,
      action: String,
      enabled: Boolean,
      description: String,
      actionCode: Int,
  ) {
    views.setContentDescription(viewId, description)
    views.setBoolean(viewId, "setEnabled", enabled)
    views.setInt(viewId, "setImageAlpha", if (enabled) 255 else 72)
    views.setOnClickPendingIntent(
        viewId,
        if (enabled) actionPendingIntent(context, widgetId, action, actionCode) else null,
    )
  }

  companion object {
    const val ACTION_REFRESH =
        "com.anonymous.quranappmobile.versespotlight.action.REFRESH"
    const val ACTION_PREVIOUS =
        "com.anonymous.quranappmobile.versespotlight.action.PREVIOUS"
    const val ACTION_SHUFFLE =
        "com.anonymous.quranappmobile.versespotlight.action.SHUFFLE"
    const val ACTION_NEXT = "com.anonymous.quranappmobile.versespotlight.action.NEXT"

    private fun actionPendingIntent(
        context: Context,
        widgetId: Int,
        action: String,
        actionCode: Int,
    ): PendingIntent {
      val intent =
          Intent(context, VerseSpotlightWidgetProvider::class.java)
              .setAction(action)
              .setData(Uri.parse("quranappmobile://widget/$widgetId/action/$actionCode"))
              .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
      return PendingIntent.getBroadcast(
          context,
          widgetId * 10 + actionCode,
          intent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    private fun openPendingIntent(
        context: Context,
        widgetId: Int,
        surahId: Int,
        ayahId: Int,
    ): PendingIntent {
      val deepLink =
          Uri.parse(
              "quranappmobile:///surah/$surahId?startVerse=$ayahId&view=translations"
          )
      val intent =
          Intent(Intent.ACTION_VIEW, deepLink, context, MainActivity::class.java)
              .addFlags(
                  Intent.FLAG_ACTIVITY_NEW_TASK or
                      Intent.FLAG_ACTIVITY_CLEAR_TOP or
                      Intent.FLAG_ACTIVITY_SINGLE_TOP
              )
      return PendingIntent.getActivity(
          context,
          widgetId * 10 + 4,
          intent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }
  }
}

class VerseSpotlightTextService : RemoteViewsService() {
  override fun onGetViewFactory(intent: Intent): RemoteViewsFactory =
      VerseSpotlightTextFactory(
          applicationContext,
          intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, -1),
      )
}

private class VerseSpotlightTextFactory(
    private val context: Context,
    private val widgetId: Int,
) : RemoteViewsService.RemoteViewsFactory {
  private var textItems: List<String> = emptyList()
  private var isArabicOnly = false

  override fun onCreate() = onDataSetChanged()

  override fun onDataSetChanged() {
    if (widgetId == -1) {
      textItems = emptyList()
      return
    }
    runCatching {
          val assets = VerseSpotlightAssets.load(context)
          val snapshot = WidgetContentCache(context).read(assets.index)
          val state =
              WidgetStateManager(
                      SharedPreferencesWidgetStatePersistence(context),
                      assets.index,
                  )
                  .load(widgetId, snapshot.requestedTranslationId)
          val fallback = assets.fallbackByKey.getValue(state.verseKey)
          resolveWidgetContent(state.verseKey, snapshot, fallback)
        }
        .onSuccess { content ->
          textItems = listOf(content.displayText)
          isArabicOnly = content.isArabicOnly
        }
        .onFailure {
          textItems = emptyList()
          isArabicOnly = false
        }
  }

  override fun onDestroy() {
    textItems = emptyList()
  }

  override fun getCount(): Int = textItems.size

  override fun getViewAt(position: Int): RemoteViews? {
    val text = textItems.getOrNull(position) ?: return null
    val layoutId =
        if (isArabicOnly) {
          R.layout.verse_spotlight_arabic_text_item
        } else {
          R.layout.verse_spotlight_text_item
        }
    return RemoteViews(context.packageName, layoutId).apply {
      setTextViewText(R.id.verse_spotlight_text, text)
      setContentDescription(R.id.verse_spotlight_text, text)
      setOnClickFillInIntent(R.id.verse_spotlight_text_item, Intent())
    }
  }

  override fun getLoadingView(): RemoteViews? = null

  override fun getViewTypeCount(): Int = 2

  override fun getItemId(position: Int): Long = position.toLong()

  override fun hasStableIds(): Boolean = true
}

class VerseSpotlightWidgetModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "VerseSpotlightWidget"

  @ReactMethod
  fun syncContent(payloadJson: String, promise: Promise) {
    runCatching {
          val json = JSONObject(payloadJson)
          check(json.optInt("schemaVersion") == SPOTLIGHT_SCHEMA_VERSION)
          check(json.optInt("requestedTranslationId") > 0)
          check(json.has("translationSelected"))
          check(payloadJson.length <= 12_000_000)

          val directory = File(reactContext.filesDir, "verse_spotlight")
          check(directory.exists() || directory.mkdirs())
          val atomicFile = AtomicFile(File(directory, "widget_content_v1.json"))
          val stream = atomicFile.startWrite()
          try {
            stream.write(payloadJson.toByteArray(Charsets.UTF_8))
            atomicFile.finishWrite(stream)
          } catch (error: Throwable) {
            atomicFile.failWrite(stream)
            throw error
          }

          reactContext.sendBroadcast(
              Intent(reactContext, VerseSpotlightWidgetProvider::class.java)
                  .setAction(VerseSpotlightWidgetProvider.ACTION_REFRESH)
          )
        }
        .onSuccess { promise.resolve(null) }
        .onFailure { promise.reject("widget_sync_failed", it.message, it) }
  }
}

@Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
class VerseSpotlightWidgetPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
      listOf(VerseSpotlightWidgetModule(reactContext))

  override fun createViewManagers(
      reactContext: ReactApplicationContext
  ): List<ViewManager<*, *>> = emptyList()
}

object VerseSpotlightProcess {
  fun isWidgetProcess(application: Application): Boolean {
    val processName =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
          Application.getProcessName()
        } else {
          val manager = application.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
          manager.runningAppProcesses
              ?.firstOrNull { it.pid == android.os.Process.myPid() }
              ?.processName
        }
    return processName?.endsWith(":verse_spotlight_widget") == true
  }
}
