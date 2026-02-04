module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['nativewind/babel', 'babel-preset-expo'],
    plugins: ['expo-router/babel', 'react-native-reanimated/plugin'],
  };
};
