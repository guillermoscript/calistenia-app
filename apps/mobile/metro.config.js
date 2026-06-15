const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Monorepo pnpm: `packages/core` y `apps/mobile` pueden resolver copias
// distintas de react / react-query (peer deps satisfechos con versiones de
// react diferentes: 19.2.3 en mobile, 19.2.7 vía web/core). Dos copias de
// react-query = dos contextos = "No QueryClient set" y splash colgado.
// Forzamos una única copia (la de la app) para estos singletons.
const APP_NODE_MODULES = path.resolve(__dirname, 'node_modules');
const SINGLETONS = new Set([
  'react',
  '@tanstack/react-query',
  '@tanstack/react-query-persist-client',
  '@tanstack/query-sync-storage-persister',
]);

const baseResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const pkg = moduleName.startsWith('@')
    ? moduleName.split('/').slice(0, 2).join('/')
    : moduleName.split('/')[0];
  if (SINGLETONS.has(pkg)) {
    const subpath = moduleName.slice(pkg.length); // '' | '/jsx-runtime' | ...
    const filePath = require.resolve(pkg + subpath, { paths: [APP_NODE_MODULES] });
    return { type: 'sourceFile', filePath };
  }
  return (baseResolveRequest || context.resolveRequest)(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './src/global.css', inlineRem: 16 });
