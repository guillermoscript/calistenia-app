// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // eslint-config-expo 56 ships eslint-plugin-react-hooks v6, which turns on the
    // new React Compiler rule family. Those rules assume a compiler-clean codebase
    // and fire as false positives across our established Reanimated `.value` and ref
    // patterns (155+ `react-hooks/refs` hits in SessionView, ActiveSessionContext,
    // animation components, etc.). Until we adopt React Compiler we disable them,
    // while keeping the battle-tested rules-of-hooks and exhaustive-deps active.
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
  {
    // Node build scripts (sound/asset generators) run under Node, not the RN runtime.
    files: ["scripts/**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: {
        Buffer: "readonly",
        process: "readonly",
        console: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        module: "writable",
        require: "readonly",
      },
    },
  },
]);
