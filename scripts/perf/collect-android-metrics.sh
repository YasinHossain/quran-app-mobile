#!/usr/bin/env bash

set -euo pipefail

PACKAGE="${PERF_PACKAGE:-com.anonymous.quranappmobile}"
LABEL="${1:?usage: collect-android-metrics.sh LABEL OUTPUT_DIR CSV_PATH}"
OUTPUT_DIR="${2:?usage: collect-android-metrics.sh LABEL OUTPUT_DIR CSV_PATH}"
CSV_PATH="${3:?usage: collect-android-metrics.sh LABEL OUTPUT_DIR CSV_PATH}"
PID="$(adb shell pidof -s "$PACKAGE" | tr -d '\r')"

if [[ -z "$PID" ]]; then
  echo "No running process for $PACKAGE" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
SAFE_LABEL="$(printf '%s' "$LABEL" | tr -cs 'A-Za-z0-9._-' '_')"
MEMINFO_PATH="$OUTPUT_DIR/${SAFE_LABEL}-meminfo.txt"
STATUS_PATH="$OUTPUT_DIR/${SAFE_LABEL}-proc-status.txt"

adb shell dumpsys meminfo "$PACKAGE" > "$MEMINFO_PATH"
adb shell cat "/proc/$PID/status" > "$STATUS_PATH"

if [[ ! -f "$CSV_PATH" ]]; then
  printf '%s\n' 'timestamp_utc,label,pid,total_rss_kb,rss_anon_kb,rss_file_kb,swap_kb,total_pss_kb,private_dirty_kb,private_clean_kb,swap_pss_kb,native_heap_size_kb,native_heap_alloc_kb,native_heap_pss_kb,dalvik_heap_size_kb,dalvik_heap_alloc_kb,dalvik_heap_pss_kb,unknown_pss_kb,private_other_pss_kb,views,activities' > "$CSV_PATH"
fi

awk -v timestamp="$TIMESTAMP" -v label="$LABEL" -v pid="$PID" '
  FNR == NR {
    if ($1 == "VmRSS:") rss = $2
    else if ($1 == "RssAnon:") anon = $2
    else if ($1 == "RssFile:") file = $2
    else if ($1 == "VmSwap:") swap = $2
    next
  }
  $1 == "Native" && $2 == "Heap" {
    native_pss = $3; native_size = $8; native_alloc = $9
  }
  $1 == "Dalvik" && $2 == "Heap" {
    dalvik_pss = $3; dalvik_size = $8; dalvik_alloc = $9
  }
  $1 == "Unknown" { unknown_pss = $2 }
  $1 == "TOTAL" && $2 ~ /^[0-9]+$/ {
    total_pss = $2; private_dirty = $3; private_clean = $4; swap_pss = $5; total_rss_meminfo = $6
  }
  $1 == "Private" && $2 == "Other:" { private_other = $3 }
  $1 == "Views:" { views = $2 }
  $1 == "AppContexts:" { activities = $4 }
  END {
    if (!rss) rss = total_rss_meminfo
    printf "%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s\n", timestamp, label, pid, rss, anon, file, swap, total_pss, private_dirty, private_clean, swap_pss, native_size, native_alloc, native_pss, dalvik_size, dalvik_alloc, dalvik_pss, unknown_pss, private_other, views, activities
  }
' "$STATUS_PATH" "$MEMINFO_PATH" >> "$CSV_PATH"
