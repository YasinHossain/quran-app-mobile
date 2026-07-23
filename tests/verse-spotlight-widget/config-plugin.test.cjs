const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const plugin = require('../../plugins/withVerseSpotlightWidget');

const projectRoot = path.resolve(__dirname, '..', '..');

test('MainApplication integration is idempotent and skips React Native in the widget process', () => {
  const source = fs.readFileSync(
    path.join(
      projectRoot,
      'android/app/src/main/java/com/anonymous/quranappmobile/MainApplication.kt'
    ),
    'utf8'
  );

  const once = plugin.ensureMainApplication(source);
  const twice = plugin.ensureMainApplication(once);

  assert.equal(twice, once);
  assert.match(once, /add\(VerseSpotlightWidgetPackage\(\)\)/);
  assert.equal(
    (once.match(/if \(VerseSpotlightProcess\.isWidgetProcess\(this\)\) return/g) ?? []).length,
    2
  );
});

test('generated native widget inputs and offline assets are present', () => {
  const metadata = JSON.parse(
    fs.readFileSync(
      path.join(projectRoot, 'assets/verse-spotlight/bundled-sahih-metadata.json'),
      'utf8'
    )
  );
  const expectedPaths = [
    'plugins/verse-spotlight-widget/android/src/main/java/com/anonymous/quranappmobile/versespotlight/VerseSpotlightWidget.kt',
    'plugins/verse-spotlight-widget/android/src/main/res/layout/verse_spotlight_widget.xml',
    'plugins/verse-spotlight-widget/android/src/main/res/layout/verse_spotlight_text_item.xml',
    'plugins/verse-spotlight-widget/android/src/main/res/layout/verse_spotlight_arabic_text_item.xml',
    'plugins/verse-spotlight-widget/android/src/main/res/layout/verse_spotlight_widget_preview.xml',
    'plugins/verse-spotlight-widget/android/src/main/res/xml/verse_spotlight_widget_info.xml',
    'assets/verse-spotlight/canonical-verse-index.json',
    'assets/verse-spotlight/curated-anchor-pool.json',
    'assets/verse-spotlight/bundled-sahih-metadata.json',
    metadata.payloadPath,
  ];

  for (const relativePath of expectedPaths) {
    assert.equal(fs.existsSync(path.join(projectRoot, relativePath)), true, relativePath);
  }
});

test('Android manifest integration is idempotent and uses the isolated process', () => {
  const manifest = {
    manifest: {
      application: [{ $: { 'android:name': '.MainApplication' } }],
    },
  };

  plugin.ensureWidgetReceiver(manifest);
  plugin.ensureWidgetReceiver(manifest);
  plugin.ensureWidgetService(manifest);
  plugin.ensureWidgetService(manifest);

  const receivers = manifest.manifest.application[0].receiver;
  assert.equal(receivers.length, 1);
  assert.equal(receivers[0].$['android:exported'], 'true');
  assert.equal(receivers[0].$['android:process'], ':verse_spotlight_widget');
  assert.equal(
    receivers[0]['meta-data'][0].$['android:resource'],
    '@xml/verse_spotlight_widget_info'
  );

  const services = manifest.manifest.application[0].service;
  assert.equal(services.length, 1);
  assert.equal(services[0].$['android:exported'], 'false');
  assert.equal(
    services[0].$['android:permission'],
    'android.permission.BIND_REMOTEVIEWS'
  );
  assert.equal(services[0].$['android:process'], ':verse_spotlight_widget');
});
