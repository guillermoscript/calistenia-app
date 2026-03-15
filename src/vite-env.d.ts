/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_POCKETBASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  webkitAudioContext?: typeof AudioContext
}
