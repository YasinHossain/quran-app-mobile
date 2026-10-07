#!/usr/bin/env python3
"""Measure Android reader content readiness with bounded UI-dump observations.

The bounds include uiautomator polling overhead. They are a content marker proxy,
not a frame-level first-render measurement.
"""

import argparse
import json
import subprocess
import time
from pathlib import Path


PACKAGE = "com.anonymous.quranappmobile"
REMOTE_UI = "/sdcard/quran-reader-readiness.xml"


def adb(*args):
    return subprocess.run(["adb", *args], check=True, capture_output=True, text=True).stdout


def observe(marker, timeout=45):
    start = time.monotonic()
    previous_negative_end = None
    polls = []
    while time.monotonic() - start < timeout:
        poll_start = time.monotonic()
        adb("shell", "uiautomator", "dump", REMOTE_UI)
        ui = adb("shell", "cat", REMOTE_UI)
        poll_end = time.monotonic()
        matched = marker in ui
        polls.append({
            "start_ms": round((poll_start - start) * 1000),
            "end_ms": round((poll_end - start) * 1000),
            "matched": matched,
        })
        if matched:
            return {
                "lower_bound_ms": round((previous_negative_end - start) * 1000)
                if previous_negative_end is not None else 0,
                "upper_bound_ms": round((poll_end - start) * 1000),
                "polls": polls,
            }
        previous_negative_end = poll_end
    raise TimeoutError(f"UI marker {marker!r} did not appear")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    parser.add_argument("--cycles", type=int, default=5)
    args = parser.parse_args()
    if args.cycles < 2:
        parser.error("--cycles must be at least 2")

    adb("shell", "am", "force-stop", PACKAGE)
    launch_start = time.monotonic()
    launch = adb("shell", "am", "start", "-W", "-n", f"{PACKAGE}/.MainActivity")
    launch_command_ms = round((time.monotonic() - launch_start) * 1000)
    home = observe('text="সূরা"')
    home["launch_command_ms"] = launch_command_ms
    home["lower_from_launch_ms"] = home["lower_bound_ms"] + launch_command_ms
    home["upper_from_launch_ms"] = home["upper_bound_ms"] + launch_command_ms
    home["activity_output"] = launch.strip()

    cycles = []
    for index in range(1, args.cycles + 1):
        open_start = time.monotonic()
        adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d",
            "quranappmobile://surah/2", PACKAGE)
        command_done = time.monotonic()
        reader = observe('text="2:1"')
        reader["command_ms"] = round((command_done - open_start) * 1000)
        reader["lower_from_intent_ms"] = reader["lower_bound_ms"] + reader["command_ms"]
        reader["upper_from_intent_ms"] = reader["upper_bound_ms"] + reader["command_ms"]
        adb("shell", "input", "keyevent", "4")
        returned_home = observe('text="সূরা"')
        cycles.append({"cycle": index, "reader": reader, "home_after_back": returned_home})

    result = {"package": PACKAGE, "device": adb("shell", "getprop", "ro.product.model").strip(),
              "home": home, "cycles": cycles}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(args.output)


if __name__ == "__main__":
    main()
