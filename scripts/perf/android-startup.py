#!/usr/bin/env python3
"""Measure release-build cold launch until the Android starting view is removed.

Force-stop preserves app data and settings. Activity TotalTime is reported separately
because it ends before the React Native splash is hidden.
"""

import argparse
import json
import re
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path


PACKAGE = "com.anonymous.quranappmobile"
ACTIVITY = f"{PACKAGE}/.MainActivity"
EPOCH_LINE = re.compile(r"^\s*(\d+\.\d+)\s+")
TOTAL_TIME = re.compile(r"^TotalTime: (\d+)$", re.MULTILINE)


def adb(*args):
    return subprocess.run(["adb", *args], check=True, capture_output=True, text=True).stdout


def splash_removal_ms(timeout=20):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        log = adb("logcat", "-d", "-v", "epoch", "-s", "ActivityTaskManager:I", "SplashScreenView:D")
        started = None
        for line in log.splitlines():
            match = EPOCH_LINE.match(line)
            if not match:
                continue
            timestamp = float(match.group(1))
            if "ActivityTaskManager: START u0" in line and f"cmp={ACTIVITY}" in line:
                started = timestamp
            elif started is not None and "SplashScreenView: remove starting view" in line:
                return round((timestamp - started) * 1000)
        time.sleep(0.1)
    raise TimeoutError("Android did not report removal of the app starting view")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    parser.add_argument("--runs", type=int, default=5)
    args = parser.parse_args()
    if args.runs < 1:
        parser.error("--runs must be positive")

    result = {
        "measured_at_utc": datetime.now(timezone.utc).isoformat(),
        "package": PACKAGE,
        "device": adb("shell", "getprop", "ro.product.model").strip(),
        "android_version": adb("shell", "getprop", "ro.build.version.release").strip(),
        "runs": [],
    }
    for index in range(args.runs):
        adb("shell", "am", "force-stop", PACKAGE)
        adb("logcat", "-c")
        launch = adb("shell", "am", "start", "-W", "-n", ACTIVITY)
        total = TOTAL_TIME.search(launch)
        if not total:
            raise RuntimeError(f"Android did not report TotalTime: {launch}")
        run = {
            "run": index + 1,
            "activity_total_ms": int(total.group(1)),
            "starting_view_removed_ms": splash_removal_ms(),
        }
        result["runs"].append(run)
        print(run, flush=True)
        time.sleep(1)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    main()
