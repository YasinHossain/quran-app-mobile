#!/usr/bin/env python3
"""Run matched release APK reader/audio journeys for the native reuse isolate.

Uses the current API 36 emulator and saved Bengali reader profile. The verified
tap targets are checked against accessibility markers before audio starts.
Never clears app data or changes saved reader settings.
"""

import argparse
import hashlib
import json
import subprocess
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PACKAGE = "com.anonymous.quranappmobile"
UI_PATH = "/sdcard/quran-reader-reuse.xml"


def run(*args, text=True):
    return subprocess.run(args, check=True, capture_output=True, text=text).stdout


def adb(*args, text=True):
    return run("adb", *args, text=text)


def ui_snapshot():
    adb("shell", "uiautomator", "dump", UI_PATH)
    return adb("shell", "cat", UI_PATH)


def wait_for(marker, timeout=45):
    end = time.monotonic() + timeout
    last_error = None
    while time.monotonic() < end:
        try:
            ui = ui_snapshot()
            if marker in ui:
                return ui
        except subprocess.CalledProcessError as exc:
            last_error = str(exc)
        time.sleep(0.5)
    raise RuntimeError(f"Missing UI marker {marker!r}; last dump error: {last_error}")


def capture_frames(directory, count=9):
    directory.mkdir(parents=True, exist_ok=True)
    timings = []
    start = time.monotonic()
    for index in range(count):
        frame_start = time.monotonic()
        png = adb("exec-out", "screencap", "-p", text=False)
        frame_end = time.monotonic()
        (directory / f"{index:02d}.png").write_bytes(png)
        timings.append({"frame": index,
                        "start_ms": round((frame_start - start) * 1000),
                        "end_ms": round((frame_end - start) * 1000)})
    (directory / "timing.json").write_text(json.dumps(timings, indent=2) + "\n")


def metrics(label, directory):
    run(str(ROOT / "scripts/perf/collect-android-metrics.sh"), label,
        str(directory), str(directory / "metrics.csv"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("variant", choices=["control", "reuse"])
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument("--artifact-root", type=Path,
                        default=ROOT / ".artifacts/performance/reader-sdk57/reuse-isolate",
                        help="Directory containing control.apk/reuse.apk and journey outputs")
    args = parser.parse_args()
    if args.runs < 1:
        parser.error("--runs must be positive")

    root = args.artifact_root
    apk = root / f"{args.variant}.apk"
    output = root / args.variant
    output.mkdir(parents=True, exist_ok=True)
    (output / "install.txt").write_text(adb("install", "-r", str(apk)))
    metadata = {"variant": args.variant, "apk": str(apk),
                "apk_sha256": hashlib.sha256(apk.read_bytes()).hexdigest(),
                "device": adb("shell", "getprop", "ro.product.model").strip(),
                "android_sdk": adb("shell", "getprop", "ro.build.version.sdk").strip(),
                "run_count": args.runs, "saved_settings_changed": False,
                "swipes_per_run": 8, "audio_next_taps_per_run": 3}
    (output / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")

    for index in range(1, args.runs + 1):
        directory = output / f"run-{index}"
        directory.mkdir(parents=True, exist_ok=True)
        adb("shell", "am", "force-stop", PACKAGE)
        adb("logcat", "-c")
        (directory / "launch.txt").write_text(
            adb("shell", "am", "start", "-W", "-n", f"{PACKAGE}/.MainActivity"))
        (directory / "home.xml").write_text(wait_for('text="হোম"'))
        time.sleep(5)
        metrics("home", directory)

        open_start = time.monotonic()
        (directory / "open.txt").write_text(
            adb("shell", "am", "start", "-a", "android.intent.action.VIEW",
                "-d", "quranappmobile://surah/2", PACKAGE))
        open_command_ms = round((time.monotonic() - open_start) * 1000)
        (directory / "open-command-ms.txt").write_text(f"{open_command_ms}\n")
        capture_frames(directory / "frames")
        (directory / "reader.xml").write_text(wait_for('text="2:1"'))
        time.sleep(1)
        metrics("reader", directory)
        (directory / "reader.png").write_bytes(adb("exec-out", "screencap", "-p", text=False))

        # The first and second verse actions are at fixed native reader positions.
        # Validate the second-verse sheet before pressing its audio action.
        adb("shell", "input", "tap", "998", "1754")
        sheet = wait_for("অডিও চালু করুন")
        (directory / "actions.xml").write_text(sheet)
        adb("shell", "input", "tap", "500", "1520")
        time.sleep(1)
        (directory / "audio-start.png").write_bytes(
            adb("exec-out", "screencap", "-p", text=False))
        for _ in range(3):
            adb("shell", "input", "tap", "410", "2150")
            time.sleep(0.7)
        time.sleep(1)
        metrics("audio-after-next", directory)
        (directory / "audio-after-next.png").write_bytes(
            adb("exec-out", "screencap", "-p", text=False))

        adb("shell", "input", "tap", "960", "2150")  # Close audio bar.
        time.sleep(0.5)
        adb("shell", "dumpsys", "gfxinfo", PACKAGE, "reset")
        for _ in range(8):
            adb("shell", "input", "swipe", "540", "1900", "540", "650", "350")
            time.sleep(0.25)
        time.sleep(5)
        metrics("reader-after-scroll", directory)
        (directory / "gfxinfo.txt").write_text(adb("shell", "dumpsys", "gfxinfo", PACKAGE))
        (directory / "reader-after-scroll.png").write_bytes(
            adb("exec-out", "screencap", "-p", text=False))
        (directory / "reader-perf.log").write_text(
            adb("logcat", "-d", "-v", "epoch", "-s", "QuranReaderPerf:I", "*:S"))

        adb("shell", "input", "keyevent", "4")
        (directory / "home-after.xml").write_text(wait_for('text="হোম"'))
        time.sleep(5)
        metrics("home-after", directory)
        print(directory, flush=True)


if __name__ == "__main__":
    main()
