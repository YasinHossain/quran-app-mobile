const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('wasm');

// Expo disables inline requires, so every launch evaluates the whole static import graph,
// including screens' dependencies that Home never touches, before the first frame. Inlining
// defers each module until first use (about -80 ms to Home on a budget Android phone).
// Side-effect-only imports such as `import '../global.css'` still run in order.
config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: true,
    inlineRequires: true,
  },
});

module.exports = withNativeWind(config, {
  input: './global.css',
  configPath: './tailwind.config.js',
});
