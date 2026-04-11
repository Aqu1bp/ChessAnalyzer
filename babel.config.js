const path = require('path');

module.exports = function (api) {
  api.cache(true);

  // Resolve Expo's bundled preset from this app's local `expo` package.
  // Using an unrelated parent-level `babel-preset-expo` breaks Expo Router's
  // auto-detection because the preset can no longer resolve the app-local
  // `expo-router` package.
  const expoPreset = path.join(
    path.dirname(require.resolve('expo/package.json')),
    'node_modules',
    'babel-preset-expo',
  );

  return {
    presets: [expoPreset],
    plugins: ['react-native-reanimated/plugin'],
  };
};
