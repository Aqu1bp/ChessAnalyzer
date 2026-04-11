const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('tflite', 'wasm', 'html', 'bundle');

module.exports = config;
