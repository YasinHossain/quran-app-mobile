#!/usr/bin/env bash

set -euo pipefail

PACKAGE="${PERF_PACKAGE:-com.anonymous.quranappmobile}"
PROFILE="${PERF_PROFILE:-audio-start-stop}"
SURAH_ID="${PERF_SURAH_ID:-2}"
SWIPE_COUNT="${PERF_SWIPE_COUNT:-8}"
SETTLE_SECONDS="${PERF_SETTLE_SECONDS:-5}"
RUN_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT_ROOT="${PERF_OUTPUT_ROOT:-.artifacts/performance/baseline}"
OUTPUT_DIR="$OUTPUT_ROOT/${RUN_STAMP}-${PROFILE}-surah-${SURAH_ID}"
CSV_PATH="$OUTPUT_DIR/metrics.csv"
COLLECTOR="$(cd "$(dirname "$0")" && pwd)/collect-android-metrics.sh"

mkdir -p "$OUTPUT_DIR"

if ! adb shell dumpsys media_session | grep -A12 "package=$PACKAGE" | grep -q 'state=PLAYING'; then
  echo "Start audio for Surah $SURAH_ID, keep the reader visible, then rerun this command." >&2
  exit 1
fi

{
  echo "timestamp_utc=$RUN_STAMP"
  echo "profile=$PROFILE"
  echo "surah_id=$SURAH_ID"
  echo "swipe_count=$SWIPE_COUNT"
  echo "settle_seconds=$SETTLE_SECONDS"
  echo "package=$PACKAGE"
  echo "commit=$(git rev-parse HEAD)"
  echo "manual_precondition=Start verse audio from the visible verse action sheet."
  echo "git_status_begin"
  git status --porcelain=v1
  echo "git_status_end"
} > "$OUTPUT_DIR/run-metadata.txt"

adb shell dumpsys gfxinfo "$PACKAGE" reset > "$OUTPUT_DIR/playing-gfx-reset.txt"
swipe=1
while [[ "$swipe" -le "$SWIPE_COUNT" ]]; do
  adb shell input swipe 540 1900 540 650 350
  sleep 0.25
  swipe=$((swipe + 1))
done
sleep "$SETTLE_SECONDS"
"$COLLECTOR" "audio-playing-after-scroll" "$OUTPUT_DIR" "$CSV_PATH"
adb shell dumpsys gfxinfo "$PACKAGE" > "$OUTPUT_DIR/audio-playing-after-scroll-gfxinfo.txt"

adb shell input keyevent 85
sleep "$SETTLE_SECONDS"
adb shell input swipe 540 1900 540 650 350
adb shell input swipe 540 1900 540 650 350
sleep "$SETTLE_SECONDS"
"$COLLECTOR" "audio-stopped-after-continued-scroll" "$OUTPUT_DIR" "$CSV_PATH"
adb shell dumpsys media_session > "$OUTPUT_DIR/media-session-after-stop.txt"
adb exec-out screencap -p > "$OUTPUT_DIR/audio-stopped.png"

echo "$OUTPUT_DIR"
