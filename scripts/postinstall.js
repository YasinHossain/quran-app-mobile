/* eslint-disable no-console */
const fs = require('fs/promises');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

async function exists(absolutePath) {
  try {
    await fs.access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Patch a file in-place.
 * - No-op if file is missing
 * - Idempotent
 */
async function patchFile(relativePath, patchFn) {
  const absolutePath = path.join(projectRoot, relativePath);
  if (!(await exists(absolutePath))) {
    return { relativePath, status: 'missing' };
  }

  const before = await fs.readFile(absolutePath, 'utf8');
  const after = patchFn(before);

  if (after === before) {
    return { relativePath, status: 'unchanged' };
  }

  await fs.writeFile(absolutePath, after, 'utf8');
  return { relativePath, status: 'patched' };
}

function patchDeprecatedReactNativeSafeAreaViewCjs(contents) {
  // React Native 0.81+ logs a deprecation warning when `SafeAreaView` is accessed
  // from `react-native` (getter in `react-native/index.js`). `react-native-css-interop`
  // only needs SafeAreaView interop for styling, and already supports
  // `react-native-safe-area-context` in the same module.
  //
  // Remove the `react_native_1.SafeAreaView` interop registration to prevent the
  // deprecation warning during module initialization.
  return contents.replace(
    /\r?\n?\(0, api_1\.cssInterop\)\(react_native_1\.SafeAreaView, \{ className: "style" \}\);\r?\n?/,
    '\n'
  );
}

function patchDeprecatedReactNativeSafeAreaViewTs(contents) {
  // Best-effort patch for the TS source file (some bundlers/devtools may read it).
  let next = contents;
  next = next.replace(/\r?\n\s*SafeAreaView,\s*\r?\n/, '\n');
  // Only remove the single-line RN SafeAreaView registration (the safe-area-context
  // one is multi-line and should remain).
  next = next.replace(
    /\r?\ncssInterop\(SafeAreaView,\s*\{\s*className:\s*"style"\s*\}\s*\);\r?\n?/,
    '\n'
  );
  return next;
}

async function main() {
  const results = [];

  results.push(
    await patchFile(
      'node_modules/react-native-css-interop/dist/runtime/components.js',
      patchDeprecatedReactNativeSafeAreaViewCjs
    )
  );
  results.push(
    await patchFile(
      'node_modules/react-native-css-interop/src/runtime/components.ts',
      patchDeprecatedReactNativeSafeAreaViewTs
    )
  );

  const patched = results.filter((r) => r.status === 'patched');
  if (patched.length === 0) return;

  console.log(
    `postinstall: patched deprecated react-native SafeAreaView usage in ${patched
      .map((r) => r.relativePath)
      .join(', ')}`
  );
}

main().catch((error) => {
  console.error('postinstall failed:', error);
  process.exitCode = 1;
});
