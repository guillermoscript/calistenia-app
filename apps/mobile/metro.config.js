// getSentryExpoConfig = getDefaultConfig de Expo + recolección de source maps
// (debugId) para symbolicar stacktraces de Hermes en Sentry. Drop-in.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { withNativeWind } = require('nativewind/metro');

const config = getSentryExpoConfig(__dirname);

module.exports = withNativeWind(config, { input: './src/global.css', inlineRem: 16 });
