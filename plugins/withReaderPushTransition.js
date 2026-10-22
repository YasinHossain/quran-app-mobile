const { createRunOncePlugin, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Copies app-level overrides of react-native-screens' `ios_from_right` push animations into the
// generated Android project. App resources win over library resources with the same name.
function syncNativeFiles(projectRoot) {
  const templateRes = path.join(
    projectRoot,
    'plugins',
    'reader-push-transition',
    'android',
    'src',
    'main',
    'res'
  );
  const androidRes = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res');
  for (const directory of fs.readdirSync(templateRes)) {
    const destination = path.join(androidRes, directory);
    fs.mkdirSync(destination, { recursive: true });
    for (const file of fs.readdirSync(path.join(templateRes, directory))) {
      fs.copyFileSync(path.join(templateRes, directory, file), path.join(destination, file));
    }
  }
}

function withReaderPushTransition(config) {
  return withDangerousMod(config, [
    'android',
    (mod) => {
      syncNativeFiles(mod.modRequest.projectRoot);
      return mod;
    },
  ]);
}

module.exports = createRunOncePlugin(
  withReaderPushTransition,
  'with-reader-push-transition',
  '1.0.0'
);
module.exports.syncNativeFiles = syncNativeFiles;
