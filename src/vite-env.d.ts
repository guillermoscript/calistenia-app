/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_POCKETBASE_URL?: string
  readonly VITE_AI_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const __APP_VERSION__: string

interface Window {
  webkitAudioContext?: typeof AudioContext
}
