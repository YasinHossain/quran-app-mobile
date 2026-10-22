const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { parseStringPromise } = require('xml2js');

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
  assert.equal(receivers.length, 2);
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

test('cover picker registration resolves Samsung metadata and a separate keyguard provider', async () => {
  // Start with the old home-only registration to exercise upgrades as well as idempotency.
  const manifest = { manifest: { application: [{ $: { 'android:name': '.MainApplication' }, receiver: [{
    $: { 'android:name': 'com.anonymous.quranappmobile.versespotlight.VerseSpotlightWidgetProvider' },
  }] }] } };
  plugin.ensureWidgetReceiver(manifest);
  const once = JSON.stringify(manifest);
  plugin.ensureWidgetReceiver(manifest);
  assert.equal(JSON.stringify(manifest), once);
  const receivers = manifest.manifest.application[0].receiver;
  assert.equal(receivers.length, 2);
  const cover = receivers.find((receiver) =>
    receiver.$['android:name'].endsWith('.VerseSpotlightCoverWidgetProvider'));
  assert.equal(cover.$['android:enabled'], 'true');
  assert.equal(cover.$['android:exported'], 'true');
  assert.equal(cover.$['android:process'], ':verse_spotlight_widget');
  assert.equal(cover['intent-filter'][0].action[0].$['android:name'],
    'android.appwidget.action.APPWIDGET_UPDATE');
  async function readMetadata(receiver, name) {
    const entries = receiver['meta-data'].filter((entry) => entry.$['android:name'] === name);
    assert.equal(entries.length, 1);
    const resource = entries[0].$['android:resource'];
    assert.match(resource, /^@xml\/[a-z_]+$/);
    return parseStringPromise(fs.readFileSync(path.join(projectRoot,
      'plugins/verse-spotlight-widget/android/src/main/res', `${resource.slice(1)}.xml`), 'utf8'));
  }
  const samsung = await readMetadata(cover, 'com.samsung.android.appwidget.provider');
  assert.equal(samsung['samsung-appwidget-provider'].$.display, 'sub_screen');
  const info = (await readMetadata(cover, 'android.appwidget.provider'))['appwidget-provider'].$;
  assert.equal(info['android:widgetCategory'], 'keyguard');
  assert.equal(info['android:minWidth'], '352dp');
  assert.equal(info['android:minHeight'], '339dp');
  assert.equal(info['android:resizeMode'], 'horizontal|vertical');
  const home = (await readMetadata(receivers[0], 'android.appwidget.provider'))['appwidget-provider'].$;
  assert.equal(home['android:widgetCategory'], 'home_screen');
  assert.equal(home['android:targetCellHeight'], '2');
});

test('single canonical widget is registered and obsolete multi-design receivers are stripped', async () => {
  const manifest = {
    manifest: {
      application: [
        {
          $: { 'android:name': '.MainApplication' },
          receiver: [
            { $: { 'android:name': 'com.anonymous.quranappmobile.versespotlight.VerseSpotlightSerenityWidgetProvider' } },
            { $: { 'android:name': 'com.anonymous.quranappmobile.versespotlight.VerseSpotlightMaterialWidgetProvider' } },
          ],
        },
      ],
    },
  };
  plugin.ensureWidgetReceiver(manifest);
  const receivers = manifest.manifest.application[0].receiver;
  assert.equal(receivers.length, 2);
  const home = receivers.find((entry) => entry.$['android:name'].endsWith('.VerseSpotlightWidgetProvider'));
  const cover = receivers.find((entry) => entry.$['android:name'].endsWith('.VerseSpotlightCoverWidgetProvider'));
  assert.ok(home, 'Home widget provider must be registered');
  assert.ok(cover, 'Cover widget provider must be registered');
  assert.equal(home.$['android:label'], '@string/verse_spotlight_widget_name');
  assert.equal(home.$['android:process'], ':verse_spotlight_widget');
  assert.equal(cover.$['android:label'], '@string/verse_spotlight_widget_name');
  assert.equal(cover.$['android:process'], ':verse_spotlight_widget');

  const res = path.join(projectRoot, 'plugins/verse-spotlight-widget/android/src/main/res');
  const homeMetadata = home['meta-data'].find((entry) => entry.$['android:name'] === 'android.appwidget.provider');
  const provider = (await parseStringPromise(fs.readFileSync(
    path.join(res, `${homeMetadata.$['android:resource'].slice(1)}.xml`), 'utf8'
  )))['appwidget-provider'].$;
  assert.equal(provider['android:initialLayout'], '@layout/verse_spotlight_widget');
  assert.equal(provider['android:previewLayout'], '@layout/verse_spotlight_widget_preview');
  assert.equal(provider['android:resizeMode'], 'horizontal|vertical');
  assert.equal(provider['android:targetCellHeight'], '2');

  for (const attr of ['android:initialLayout', 'android:previewLayout']) {
    await parseStringPromise(fs.readFileSync(path.join(res, `${provider[attr].slice(1)}.xml`), 'utf8'));
  }
});
