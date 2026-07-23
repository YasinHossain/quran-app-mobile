const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PACKAGE_NAME = 'com.anonymous.quranappmobile';
const RECEIVER_NAME = `${PACKAGE_NAME}.versespotlight.VerseSpotlightWidgetProvider`;
const SERVICE_NAME = `${PACKAGE_NAME}.versespotlight.VerseSpotlightTextService`;
const MODULE_IMPORT = `import ${PACKAGE_NAME}.versespotlight.VerseSpotlightProcess`;
const PACKAGE_IMPORT = `import ${PACKAGE_NAME}.versespotlight.VerseSpotlightWidgetPackage`;

function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath);
    } else {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

function syncNativeFiles(projectRoot) {
  const templateRoot = path.join(projectRoot, 'plugins', 'verse-spotlight-widget', 'android');
  const androidAppRoot = path.join(projectRoot, 'android', 'app');

  copyDirectory(path.join(templateRoot, 'src', 'main'), path.join(androidAppRoot, 'src', 'main'));
  copyDirectory(path.join(templateRoot, 'src', 'test'), path.join(androidAppRoot, 'src', 'test'));

  const assetDestination = path.join(androidAppRoot, 'src', 'main', 'assets', 'verse_spotlight');
  fs.mkdirSync(assetDestination, { recursive: true });
  const fallbackMetadataPath = path.join(
    projectRoot,
    'assets',
    'verse-spotlight',
    'bundled-sahih-metadata.json'
  );
  const fallbackMetadata = JSON.parse(fs.readFileSync(fallbackMetadataPath, 'utf8'));
  if (typeof fallbackMetadata.payloadPath !== 'string' || !fallbackMetadata.payloadPath) {
    throw new Error('Verse Spotlight fallback metadata has no payloadPath.');
  }
  const assets = [
    [
      path.join(projectRoot, 'assets', 'verse-spotlight', 'canonical-verse-index.json'),
      'canonical-verse-index.json',
    ],
    [
      path.join(projectRoot, 'assets', 'verse-spotlight', 'curated-anchor-pool.json'),
      'curated-anchor-pool.json',
    ],
    [
      fallbackMetadataPath,
      'bundled-sahih-metadata.json',
    ],
    [
      path.resolve(projectRoot, fallbackMetadata.payloadPath),
      'bundled-sahih.json',
    ],
  ];
  for (const [source, fileName] of assets) {
    if (!fs.existsSync(source)) {
      throw new Error(`Verse Spotlight widget asset is missing: ${source}`);
    }
    fs.copyFileSync(source, path.join(assetDestination, fileName));
  }
}

function ensureWidgetReceiver(androidManifest) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
  application.receiver = application.receiver ?? [];

  let receiver = application.receiver.find(
    (candidate) => candidate.$?.['android:name'] === RECEIVER_NAME
  );
  if (!receiver) {
    receiver = { $: { 'android:name': RECEIVER_NAME } };
    application.receiver.push(receiver);
  }

  receiver.$ = {
    ...receiver.$,
    'android:name': RECEIVER_NAME,
    'android:enabled': 'true',
    'android:exported': 'true',
    'android:label': '@string/verse_spotlight_widget_name',
    'android:process': ':verse_spotlight_widget',
  };
  receiver['intent-filter'] = [
    {
      action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }],
    },
  ];
  receiver['meta-data'] = [
    {
      $: {
        'android:name': 'android.appwidget.provider',
        'android:resource': '@xml/verse_spotlight_widget_info',
      },
    },
  ];
  return androidManifest;
}

function ensureWidgetService(androidManifest) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
  application.service = application.service ?? [];

  let service = application.service.find(
    (candidate) => candidate.$?.['android:name'] === SERVICE_NAME
  );
  if (!service) {
    service = { $: { 'android:name': SERVICE_NAME } };
    application.service.push(service);
  }

  service.$ = {
    ...service.$,
    'android:name': SERVICE_NAME,
    'android:exported': 'false',
    'android:permission': 'android.permission.BIND_REMOTEVIEWS',
    'android:process': ':verse_spotlight_widget',
  };
  return androidManifest;
}

function ensureMainApplication(contents) {
  let next = contents;
  if (!next.includes(PACKAGE_IMPORT)) {
    next = next.replace(
      /^package [^\n]+\n/m,
      (line) => `${line}\n${MODULE_IMPORT}\n${PACKAGE_IMPORT}\n`
    );
  }
  if (!next.includes('add(VerseSpotlightWidgetPackage())')) {
    next = next.replace(
      /add\(NativeSurahReaderPackage\(\)\)/,
      'add(NativeSurahReaderPackage())\n          add(VerseSpotlightWidgetPackage())'
    );
  }
  if (!next.includes('if (VerseSpotlightProcess.isWidgetProcess(this)) return')) {
    next = next.replace(
      /override fun onCreate\(\) \{\n\s*super\.onCreate\(\)/,
      (match) =>
        `${match}\n    if (VerseSpotlightProcess.isWidgetProcess(this)) return`
    );
  }
  const processGuardCount = (
    next.match(/if \(VerseSpotlightProcess\.isWidgetProcess\(this\)\) return/g) ?? []
  ).length;
  if (processGuardCount < 2) {
    next = next.replace(
      /override fun onConfigurationChanged\(newConfig: Configuration\) \{\n\s*super\.onConfigurationChanged\(newConfig\)/,
      (match) =>
        `${match}\n    if (VerseSpotlightProcess.isWidgetProcess(this)) return`
    );
  }
  return next;
}

function withVerseSpotlightWidget(config) {
  config = withAndroidManifest(config, (mod) => {
    mod.modResults = ensureWidgetReceiver(mod.modResults);
    mod.modResults = ensureWidgetService(mod.modResults);
    return mod;
  });
  config = withMainApplication(config, (mod) => {
    mod.modResults.contents = ensureMainApplication(mod.modResults.contents);
    return mod;
  });
  config = withDangerousMod(config, [
    'android',
    (mod) => {
      syncNativeFiles(mod.modRequest.projectRoot);
      return mod;
    },
  ]);
  return config;
}

module.exports = createRunOncePlugin(
  withVerseSpotlightWidget,
  'with-verse-spotlight-widget',
  '1.0.0'
);
module.exports.ensureMainApplication = ensureMainApplication;
module.exports.ensureWidgetReceiver = ensureWidgetReceiver;
module.exports.ensureWidgetService = ensureWidgetService;
module.exports.syncNativeFiles = syncNativeFiles;
