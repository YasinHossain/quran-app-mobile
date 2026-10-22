module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo', 'nativewind/babel'],
    plugins: ['./scripts/babel/lucide-icon-imports', 'react-native-reanimated/plugin'],
  };
};
