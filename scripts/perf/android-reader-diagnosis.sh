#!/usr/bin/env bash

set -euo pipefail

PACKAGE="${PERF_PACKAGE:-com.anonymous.quranappmobile}"
SURAH_ID="${PERF_SURAH_ID:-2}"
CYCLES="${PERF_CYCLES:-10}"
SETTLE_SECONDS="${PERF_SETTLE_SECONDS:-5}"
READINESS_TIMEOUT_SECONDS="${PERF_READINESS_TIMEOUT_SECONDS:-45}"
SWIPE_COUNT="${PERF_SWIPE_COUNT:-8}"
READY_PATTERN="${PERF_READY_PATTERN:-text=\"${SURAH_ID}:1\"}"
RUN_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT_ROOT="${PERF_OUTPUT_ROOT:-.artifacts/performance/diagnosis}"
OUTPUT_DIR="$OUTPUT_ROOT/${RUN_STAMP}-surah-${SURAH_ID}"
CSV_PATH="$OUTPUT_DIR/metrics.csv"
COLLECTOR="$(cd "$(dirname "$0")" && pwd)/collect-android-metrics.sh"

mkdir -p "$OUTPUT_DIR"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

dump_ui() {
  local destination="$1"
  adb shell uiautomator dump /sdcard/quran-perf-ui.xml >/dev/null
  adb shell cat /sdcard/quran-perf-ui.xml > "$destination"
}

wait_for_stable_home() {
  local previous="" stable=0 waited=0 current ui_path
  while [[ "$waited" -lt "$READINESS_TIMEOUT_SECONDS" ]]; do
    ui_path="$OUTPUT_DIR/ui-home-wait.xml"
    dump_ui "$ui_path"
    current="$(shasum -a 256 "$ui_path" | awk '{print $1}')"
    if [[ "$current" == "$previous" ]]; then stable=$((stable + 1)); else stable=0; fi
    if [[ "$stable" -ge 2 ]]; then sleep "$SETTLE_SECONDS"; return 0; fi
    previous="$current"
    sleep 1
    waited=$((waited + 1))
  done
  fail "home UI did not stabilize within ${READINESS_TIMEOUT_SECONDS}s"
}

wait_for_reader() {
  local waited=0 ui_path="$OUTPUT_DIR/ui-reader-wait.xml"
  while [[ "$waited" -lt "$READINESS_TIMEOUT_SECONDS" ]]; do
    dump_ui "$ui_path"
    if grep -Fq "$READY_PATTERN" "$ui_path"; then
      sleep "$SETTLE_SECONDS"
      return 0
    fi
    sleep 1
    waited=$((waited + 1))
  done
  fail "Surah ${SURAH_ID} content did not become ready within ${READINESS_TIMEOUT_SECONDS}s"
}

scroll_reader() {
  local swipe=1
  while [[ "$swipe" -le "$SWIPE_COUNT" ]]; do
    adb shell input swipe 540 1900 540 650 350
    sleep 0.25
    swipe=$((swipe + 1))
  done
  sleep "$SETTLE_SECONDS"
}

capture_snapshot() {
  local label="$1"
  local remote_heap="/data/local/tmp/quran-${RUN_STAMP}-${label}.hprof"
  "$COLLECTOR" "$label" "$OUTPUT_DIR" "$CSV_PATH"
  adb shell am dumpheap "$PACKAGE" "$remote_heap" > "$OUTPUT_DIR/${label}-dumpheap.txt"
  adb pull "$remote_heap" "$OUTPUT_DIR/${label}.hprof" > "$OUTPUT_DIR/${label}-pull.txt"
  adb shell rm "$remote_heap"
}

{
  echo "timestamp_utc=$RUN_STAMP"
  echo "surah_id=$SURAH_ID"
  echo "cycles=$CYCLES"
  echo "swipe_count=$SWIPE_COUNT"
  echo "ready_pattern=$READY_PATTERN"
  echo "settle_seconds=$SETTLE_SECONDS"
  echo "package=$PACKAGE"
  echo "commit=$(git rev-parse HEAD)"
  echo "git_status_begin"
  git status --porcelain=v1
  echo "git_status_end"
  echo "device=$(adb shell getprop ro.product.model | tr -d '\r')"
  echo "android_release=$(adb shell getprop ro.build.version.release | tr -d '\r')"
  echo "android_sdk=$(adb shell getprop ro.build.version.sdk | tr -d '\r')"
  echo "wm_size=$(adb shell wm size | tr -d '\r')"
  echo "wm_density=$(adb shell wm density | tr -d '\r')"
  adb shell dumpsys package "$PACKAGE" | awk '/versionCode=|versionName=|flags=\[/{print}' | head -3
} > "$OUTPUT_DIR/run-metadata.txt"

adb shell am force-stop "$PACKAGE"
adb shell am start -W -n "$PACKAGE/.MainActivity" > "$OUTPUT_DIR/cold-launch.txt"
wait_for_stable_home
capture_snapshot "home-initial"

cycle=1
while [[ "$cycle" -le "$CYCLES" ]]; do
  adb shell am start -a android.intent.action.VIEW -d "quranappmobile://surah/$SURAH_ID" "$PACKAGE" \
    > "$OUTPUT_DIR/cycle-${cycle}-open.txt"
  wait_for_reader
  scroll_reader
  if [[ "$cycle" -eq 1 ]]; then
    capture_snapshot "cycle-1-reader"
  fi

  adb shell input keyevent 4
  wait_for_stable_home
  if [[ "$cycle" -eq 1 ]]; then
    capture_snapshot "cycle-1-home"
  elif [[ "$cycle" -eq "$CYCLES" ]]; then
    capture_snapshot "cycle-${cycle}-home"
  fi
  cycle=$((cycle + 1))
done

echo "$OUTPUT_DIR"
