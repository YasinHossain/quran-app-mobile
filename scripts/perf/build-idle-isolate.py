#!/usr/bin/env python3
"""Build a temporary idle diagnostic, restoring exact source bytes even on failure.

Run builds sequentially, outside memory measurements. Generated APKs are diagnostic
only. Never install them for users. Existing dirty files are backed up, not reset.
"""

import argparse
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('variant', choices=['control', 'control-reanimated', 'no-bundled', 'no-bootstrap', 'no-prefetch', 'no-home', 'profile', 'engine-015', 'bundle-mode', 'inline-requires'])
    args = parser.parse_args()
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    output = ROOT / '.artifacts/performance/idle-memory/builds' / f'{stamp}-{args.variant}'
    output.mkdir(parents=True)
    lock = (output.parent / 'build.lock').open('a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    def terminate(_signal, _frame):
        raise SystemExit(143)

    signal.signal(signal.SIGTERM, terminate)
    originals = {}
    replacements = {}

    def replace(path, transform):
        target = ROOT / path
        original = target.read_bytes()
        replacement = transform(original.decode()).encode()
        originals[path] = original
        backup = output / 'originals' / path
        backup.parent.mkdir(parents=True, exist_ok=True)
        backup.write_bytes(original)
        replacements[path] = replacement
        target.write_bytes(replacement)

    def substitute(text, before, after):
        if before not in text:
            raise RuntimeError(f'Expected diagnostic patch context missing: {before}')
        return text.replace(before, after, 1)

    try:
        if args.variant in ('control', 'control-reanimated'):
            def entry(text):
                package = json.loads(text)
                package['main'] = 'scripts/perf/idle-control.js'
                return json.dumps(package, indent=2) + '\n'
            replace('package.json', entry)
            if args.variant == 'control-reanimated':
                replace('scripts/perf/idle-control.js', lambda text: "require('react-native-reanimated');\n" + text)
        elif args.variant == 'no-bundled':
            replace('src/core/infrastructure/translations/bundledSaheehInternational.ts', lambda _: '''
// DIAGNOSTIC ONLY: existing installed translations stay on disk.
export const BUNDLED_SAHEEH_TRANSLATION_ID = 20;
export const BUNDLED_SAHEEH_VERSION = '2026-04-23';
export async function bootstrapBundledSaheehInternationalAsync(): Promise<void> {}
export function getBundledSaheehVerses(): readonly any[] { return []; }
''')
            replace('lib/verse-spotlight/bundledFallback.ts', lambda _: '''
// DIAGNOSTIC ONLY: excludes the payload import and its eager validation/map.
export const BUNDLED_SAHIH_TRANSLATION_ID = 20;
export const BUNDLED_SAHIH_TRANSLATOR_NAME = 'Saheeh International';
export function getBundledFallbackVerse(_key: string): any { return null; }
''')
        elif args.variant == 'no-bootstrap':
            replace('app/_layout.tsx', lambda text: substitute(substitute(text,
                '          initializeAppDbAsync(),', '          Promise.resolve(),'),
                '          bootstrapBundledSaheehInternationalAsync(),', '          Promise.resolve(),'))
        elif args.variant == 'no-prefetch':
            replace('providers/StartupResourcePrefetch.tsx', lambda _: 'export function StartupResourcePrefetch(): null { return null; }\n')
        elif args.variant == 'no-home':
            replace('app/(tabs)/index.tsx', lambda _: '''
import React from 'react';
import { Text, View } from 'react-native';
export default function IdleHome() {
  return React.createElement(View, {style: {flex: 1, justifyContent: 'center'}},
    React.createElement(Text, null, 'Idle memory home control'));
}
''')
        elif args.variant == 'inline-requires':
            replace('metro.config.js', lambda text: substitute(text,
                'module.exports = withNativeWind(config, {', '''const previousGetTransformOptions = config.transformer.getTransformOptions;
config.transformer.getTransformOptions = async () => {
  const options = previousGetTransformOptions ? await previousGetTransformOptions() : {};
  return { ...options, transform: { ...options.transform, inlineRequires: true } };
};
module.exports = withNativeWind(config, {'''))
        elif args.variant == 'bundle-mode':
            replace('babel.config.js', lambda text: substitute(text,
                "'react-native-reanimated/plugin'",
                "['react-native-worklets/plugin', { bundleMode: true }]"))
            replace('metro.config.js', lambda text: substitute(text,
                'withNativeWind(config, {',
                "withNativeWind(require('react-native-worklets/bundleMode').getBundleModeMetroConfig(config), {"))
            # Upstream Bundle Mode Metro workaround (0.84.x), restored after build.
            replace('node_modules/metro/src/node-haste/DependencyGraph.js', lambda text: substitute(text,
                '  async getOrComputeSha1(mixedPath) {', '''  async getOrComputeSha1(mixedPath) {
    if (mixedPath.includes(require('path').join('react-native-worklets', '.worklets'))) {
      return { sha1: require('crypto').createHash('sha1').update(performance.now().toString()).digest('hex') };
    }
'''))
        elif args.variant == 'engine-015':
            replace('android/build.gradle', lambda text: text + '''
// DIAGNOSTIC ONLY: reproduce the ABI-incompatible 0.15 pin. Not a production fix.
gradle.projectsEvaluated {
    allprojects {
        configurations.configureEach {
            resolutionStrategy.force('com.facebook.hermes:hermes-android:250829098.0.15')
            resolutionStrategy.dependencySubstitution {
                substitute(module('com.facebook.react:hermes-android')).using(module('com.facebook.hermes:hermes-android:250829098.0.15'))
            }
            resolutionStrategy.eachDependency { details ->
                if (details.requested.group in ['com.facebook.hermes', 'com.facebook.react'] && details.requested.name == 'hermes-android') {
                    details.useTarget('com.facebook.hermes:hermes-android:250829098.0.15')
                    details.because('Isolate facebook/hermes#2090 without changing application code')
                }
            }
        }
    }
}
''')
        elif args.variant == 'profile':
            replace('android/app/src/main/AndroidManifest.xml', lambda text: substitute(text,
                '    <meta-data android:name="expo.modules.updates.ENABLED"',
                '    <profileable android:shell="true"/>\n    <meta-data android:name="expo.modules.updates.ENABLED"'))
            replace('android/app/build.gradle', lambda text: substitute(text, 'android {', '''android {
    externalNativeBuild { cmake { path file("../../scripts/perf/idle-native/CMakeLists.txt") } }
    sourceSets { main { java.srcDirs += file("../../scripts/perf/idle-native/java") } }
'''))
            replace('android/app/src/main/java/com/anonymous/quranappmobile/MainApplication.kt', lambda text: substitute(text,
                '          add(NativeSurahReaderPackage())',
                '          add(com.anonymous.quranappmobile.perfidle.IdleHeapPackage())\n          add(NativeSurahReaderPackage())'))
            replace('app/_layout.tsx', lambda text: "import '../scripts/perf/idle-heap-capture';\n" + text)

        (output / 'diagnostic.patch').write_text(subprocess.check_output(['git', 'diff', '--binary'], cwd=ROOT, text=True))
        build = ['./gradlew', ':app:assembleRelease', '-PreactNativeArchitectures=arm64-v8a', '--console=plain']
        with (output / 'build.log').open('w') as log:
            subprocess.run(build, cwd=ROOT / 'android', env=os.environ, stdout=log, stderr=subprocess.STDOUT, check=True)
        if args.variant == 'engine-015':
            with (output / 'hermes-dependency.txt').open('w') as log:
                subprocess.run(['./gradlew', ':app:dependencyInsight', '--configuration', 'releaseRuntimeClasspath', '--dependency', 'hermes-android', '--console=plain'], cwd=ROOT / 'android', stdout=log, stderr=subprocess.STDOUT, check=True)
        apk = output / 'app-release.apk'
        shutil.copy2(ROOT / 'android/app/build/outputs/apk/release/app-release.apk', apk)
        source_map = ROOT / 'android/app/build/intermediates/sourcemaps/react/release/index.android.bundle.packager.map'
        shutil.copy2(source_map, output / 'bundle.map')
        sources = json.loads(source_map.read_text())['sources']
        audit = {
            'variant': args.variant, 'build_command': build,
            'apk_sha256': hashlib.sha256(apk.read_bytes()).hexdigest(),
            'module_count': len(sources),
            'bundled_payload_sources': [p for p in sources if '2026-04-23/payload.json' in p],
            'app_sources': [p for p in sources if p.startswith('app/') or '/app/' in p and 'node_modules/' not in p],
            'profile_sources': [p for p in sources if 'idle-heap-capture' in p],
            'generated_worklet_count': sum('/.worklets/' in p for p in sources),
        }
        (output / 'audit.json').write_text(json.dumps(audit, indent=2))
        if args.variant in ('control', 'control-reanimated', 'no-bundled') and audit['bundled_payload_sources']:
            raise RuntimeError('Invalid isolate: bundled Quran payload still included')
        if args.variant in ('control', 'control-reanimated') and audit['app_sources']:
            raise RuntimeError('Invalid control: application route imports still included')
        print(output, flush=True)
    finally:
        conflicts = []
        for path, original in originals.items():
            target = ROOT / path
            if not target.exists() or target.read_bytes() != replacements[path]:
                conflicts.append(path)
            else:
                target.write_bytes(original)
        lock.close()
        if conflicts:
            raise RuntimeError(f'{conflicts} changed concurrently; originals saved at {output}/originals')


if __name__ == '__main__':
    main()
