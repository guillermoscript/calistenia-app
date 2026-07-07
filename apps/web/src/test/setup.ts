// Setup global de vitest (jsdom) — ver vitest.config.ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// RTL no auto-limpia sin globals:true
// El localStorage global experimental de Node (≥22, inoperante sin
// --localstorage-file) impide que vitest copie el de jsdom: window.localStorage
// llega undefined. Shim en memoria con la semántica de Storage, asignado a
// window y a globalThis (el código de la app usa `localStorage` pelado).
function createMemoryStorage(): Storage {
  let store = new Map<string, string>()
  return {
    get length() { return store.size },
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(String(k), String(v)) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => { store = new Map() },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
  }
}

const memoryStorage = createMemoryStorage()
for (const target of [globalThis, window]) {
  Object.defineProperty(target, 'localStorage', {
    value: memoryStorage,
    writable: true,
    configurable: true,
  })
}

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

// jsdom no implementa matchMedia y varios componentes lo consultan
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
