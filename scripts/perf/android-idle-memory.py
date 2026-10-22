#!/usr/bin/env python3
"""Fresh-process Android home samples; never clears app data or changes settings."""

import argparse
import csv
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]


def command(*args, check=True):
    result = subprocess.run(args, capture_output=True, text=True, check=check)
    return result.stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--label', required=True)
    parser.add_argument('--runs', type=int, default=5)
    parser.add_argument('--package', default='com.anonymous.quranappmobile')
    parser.add_argument('--ready-text', default='আল-ফাতিহা')
    parser.add_argument('--apk', type=Path, required=True)
    parser.add_argument('--build-command', required=True)
    parser.add_argument('--output-root', type=Path, default=ROOT / '.artifacts/performance/idle-memory')
    args = parser.parse_args()
    if args.runs < 1:
        parser.error('--runs must be positive')
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    output = args.output_root / f'{stamp}-{args.label}'
    output.mkdir(parents=True)
    print(output, flush=True)
    metadata = {
        'label': args.label, 'runs': args.runs, 'package': args.package,
        'ready_text': args.ready_text, 'sample_seconds': [5, 15, 30, 60],
        'readiness_note': 'First matching accessibility dump; upper-bound UI readiness proxy, not frame timing.',
        'commit': command('git', 'rev-parse', 'HEAD').strip(),
        'dirty_state': command('git', 'status', '--porcelain=v1'),
        'build_command': args.build_command, 'apk': str(args.apk.resolve()),
        'apk_sha256': hashlib.sha256(args.apk.read_bytes()).hexdigest(),
        'device': command('adb', 'shell', 'getprop', 'ro.product.model').strip(),
        'android': command('adb', 'shell', 'getprop', 'ro.build.version.release').strip(),
        'sdk': command('adb', 'shell', 'getprop', 'ro.build.version.sdk').strip(),
        'memory': command('adb', 'shell', 'cat', '/proc/meminfo'),
        'size': command('adb', 'shell', 'wm', 'size').strip(),
        'density': command('adb', 'shell', 'wm', 'density').strip(),
        'package_info': command('adb', 'shell', 'dumpsys', 'package', args.package),
    }
    (output / 'metadata.json').write_text(json.dumps(metadata, indent=2))
    (output / 'worktree.patch').write_text(command('git', 'diff', '--binary'))
    timing_path = output / 'timings.csv'
    with timing_path.open('w') as timing_file:
        timings = csv.writer(timing_file)
        timings.writerow(['run', 'label', 'pid', 'readiness_proxy_ms', 'sample_target_seconds', 'sample_actual_seconds'])
        for run in range(1, args.runs + 1):
            command('adb', 'shell', 'am', 'force-stop', args.package)
            started = time.monotonic()
            launch = command('adb', 'shell', 'am', 'start', '-W', '-n', f'{args.package}/.MainActivity')
            (output / f'run-{run}-launch.txt').write_text(launch)
            deadline = started + 60
            while True:
                command('adb', 'shell', 'uiautomator', 'dump', '/sdcard/quran-idle-memory-ui.xml', check=False)
                xml = command('adb', 'shell', 'cat', '/sdcard/quran-idle-memory-ui.xml', check=False)
                try:
                    nodes = ET.fromstring(xml).iter('node')
                    ready = any(args.ready_text in (node.get('text', '') + node.get('content-desc', ''))
                                and node.get('package') == args.package for node in nodes)
                except ET.ParseError:
                    ready = False
                if ready:
                    break
                if time.monotonic() > deadline:
                    raise RuntimeError('Home readiness timed out; no valid sample collected.')
                time.sleep(0.25)
            appeared = time.monotonic()
            readiness_ms = round((appeared - started) * 1000)
            (output / f'run-{run}-ready.xml').write_text(xml)
            pid = command('adb', 'shell', 'pidof', '-s', args.package).strip()
            for target in [5, 15, 30, 60]:
                time.sleep(max(0, appeared + target - time.monotonic()))
                current_pid = command('adb', 'shell', 'pidof', '-s', args.package).strip()
                if not pid or current_pid != pid:
                    raise RuntimeError('App process changed during sampling.')
                label = f'run-{run}-{target}s'
                actual = time.monotonic() - appeared
                subprocess.run([str(ROOT / 'scripts/perf/collect-android-metrics.sh'), label,
                                str(output), str(output / 'metrics.csv')], check=True,
                               env={**os.environ, 'PERF_PACKAGE': args.package})
                widget = args.package + ':verse_spotlight_widget'
                widget_pid = command('adb', 'shell', 'pidof', '-s', widget, check=False).strip()
                if widget_pid:
                    subprocess.run([str(ROOT / 'scripts/perf/collect-android-metrics.sh'), label,
                                    str(output / 'widget'), str(output / 'widget-metrics.csv')], check=True,
                                   env={**os.environ, 'PERF_PACKAGE': widget})
                else:
                    (output / f'{label}-widget-absent.txt').write_text('No widget process at this checkpoint.\n')
                timings.writerow([run, label, pid, readiness_ms, target, round(actual, 3)])
                timing_file.flush()
                print(f'{args.label} {label} pid={pid} ready_proxy={readiness_ms}ms', flush=True)
    command('adb', 'shell', 'rm', '-f', '/sdcard/quran-idle-memory-ui.xml')


if __name__ == '__main__':
    main()
