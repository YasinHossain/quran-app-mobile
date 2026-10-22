#!/usr/bin/env bash

set -euo pipefail

PACKAGE="${PERF_PACKAGE:-com.anonymous.quranappmobile}"
PROFILE="${PERF_PROFILE:-saved-settings}"
SURAH_ID="${PERF_SURAH_ID:-2}"
CYCLES="${PERF_CYCLES:-10}"
SETTLE_SECONDS="${PERF_SETTLE_SECONDS:-5}"
READINESS_TIMEOUT_SECONDS="${PERF_READINESS_TIMEOUT_SECONDS:-45}"
SWIPE_COUNT="${PERF_SWIPE_COUNT:-8}"
READY_PATTERN="${PERF_READY_PATTERN:-text=\"${SURAH_ID}:1\"}"
RUN_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT_ROOT="${PERF_OUTPUT_ROOT:-.artifacts/performance/baseline}"
OUTPUT_DIR="$OUTPUT_ROOT/${RUN_STAMP}-${PROFILE}-surah-${SURAH_ID}"
CSV_PATH="$OUTPUT_DIR/metrics.csv"
GFX_CSV_PATH="$OUTPUT_DIR/gfx.csv"
COLLECTOR="$(cd "$(dirname "$0")" && pwd)/collect-android-metrics.sh"

mkdir -p "$OUTPUT_DIR"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

wait_for_process() {
  local waited=0
  while [[ "$waited" -lt "$READINESS_TIMEOUT_SECONDS" ]]; do
    if [[ -n "$(adb shell pidof -s "$PACKAGE" | tr -d '\r')" ]]; then return 0; fi
    sleep 1
    waited=$((waited + 1))
  done
  fail "process did not start within ${READINESS_TIMEOUT_SECONDS}s"
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

capture_gfx() {
  local label="$1"
  local gfx_path="$OUTPUT_DIR/${label}-gfxinfo.txt"
  adb shell dumpsys gfxinfo "$PACKAGE" > "$gfx_path"
  if [[ ! -f "$GFX_CSV_PATH" ]]; then
    printf '%s\n' 'label,total_frames,janky_frames,janky_percent,p50_ms,p90_ms,p95_ms,p99_ms' > "$GFX_CSV_PATH"
  fi
  awk -v label="$label" '
    /^Total frames rendered:/ { frames = $4 }
    /^Janky frames:/ { janky = $3; percent = $4; gsub(/[()%]/, "", percent) }
    /^50th percentile:/ { p50 = $3; gsub(/ms/, "", p50) }
    /^90th percentile:/ { p90 = $3; gsub(/ms/, "", p90) }
    /^95th percentile:/ { p95 = $3; gsub(/ms/, "", p95) }
    /^99th percentile:/ { p99 = $3; gsub(/ms/, "", p99) }
    END { printf "%s,%s,%s,%s,%s,%s,%s,%s\n", label, frames, janky, percent, p50, p90, p95, p99 }
  ' "$gfx_path" >> "$GFX_CSV_PATH"
}

{
  echo "timestamp_utc=$RUN_STAMP"
  echo "profile=$PROFILE"
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
wait_for_process
wait_for_stable_home
dump_ui "$OUTPUT_DIR/home-initial-ui.xml"
adb exec-out screencap -p > "$OUTPUT_DIR/home-initial.png"
"$COLLECTOR" "home-initial" "$OUTPUT_DIR" "$CSV_PATH"

cycle=1
while [[ "$cycle" -le "$CYCLES" ]]; do
  adb shell am start -a android.intent.action.VIEW -d "quranappmobile://surah/$SURAH_ID" "$PACKAGE" > "$OUTPUT_DIR/cycle-${cycle}-open.txt"
  wait_for_reader
  adb shell dumpsys gfxinfo "$PACKAGE" reset > "$OUTPUT_DIR/cycle-${cycle}-gfx-reset.txt"
  swipe=1
  while [[ "$swipe" -le "$SWIPE_COUNT" ]]; do
    adb shell input swipe 540 1900 540 650 350
    sleep 0.25
    swipe=$((swipe + 1))
  done
  sleep "$SETTLE_SECONDS"
  capture_gfx "cycle-${cycle}-reader"
  "$COLLECTOR" "cycle-${cycle}-reader" "$OUTPUT_DIR" "$CSV_PATH"
  if [[ "$cycle" -eq 1 || "$cycle" -eq "$CYCLES" ]]; then
    dump_ui "$OUTPUT_DIR/cycle-${cycle}-reader-ui.xml"
    adb exec-out screencap -p > "$OUTPUT_DIR/cycle-${cycle}-reader.png"
  fi

  adb shell input keyevent 4
  wait_for_stable_home
  "$COLLECTOR" "cycle-${cycle}-home" "$OUTPUT_DIR" "$CSV_PATH"
  cycle=$((cycle + 1))
done

echo "$OUTPUT_DIR"
