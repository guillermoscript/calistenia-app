/**
 * `init-core.ts` llama a `initCore()` en su cuerpo, pero sus imports ESTÁTICOS
 * se evalúan antes. Si alguno llega (directa o indirectamente) a un módulo de
 * core que lee el platform adapter al evaluarse —`pocketbase.ts` y `ai-api.ts`
 * hacen `getEnv()` arriba del todo—, revienta con «initCore() no fue llamado» y
 * la app se queda en la splash. Ni el typecheck ni los tests de core lo ven:
 * pasó con `push-registration` → `core/lib/push-token` → `pocketbase.ts`.
 *
 * Este test recorre el grafo de imports estáticos de `init-core.ts` (relativos
 * y `@calistenia/core/...`; los `import()` dinámicos y los `import type` no
 * cuentan) y falla si alcanza uno de esos módulos.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// .mjs y no .ts: la app no tiene tipos de Node y `tsc` rechazaría `node:fs`.
const MOBILE_SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CORE = resolve(MOBILE_SRC, '..', '..', '..', 'packages', 'core')
const ENTRY = resolve(MOBILE_SRC, 'lib', 'init-core.ts')

/** Módulos de core que llaman a `getEnv()`/`getPlatform()` al evaluarse. */
const READS_PLATFORM_ON_LOAD = [
  resolve(CORE, 'lib', 'pocketbase.ts'),
  resolve(CORE, 'lib', 'ai-api.ts'),
]

const STATIC_IMPORT = /^\s*(?:import|export)\s+(?!type\b)(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm

function resolveFile(base) {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

function resolveSpecifier(spec, from) {
  if (spec.startsWith('.')) return resolveFile(resolve(dirname(from), spec))
  if (spec.startsWith('@calistenia/core/')) return resolveFile(resolve(CORE, spec.slice('@calistenia/core/'.length)))
  if (spec.startsWith('@/')) return resolveFile(resolve(MOBILE_SRC, spec.slice(2)))
  return null // paquete de node_modules: fuera del alcance
}

/** Cadena de imports desde `ENTRY` hasta el primer módulo prohibido, o null. */
function findForbiddenChain() {
  const parent = new Map([[ENTRY, null]])
  const queue = [ENTRY]
  while (queue.length) {
    const file = queue.shift()
    if (READS_PLATFORM_ON_LOAD.includes(file)) {
      const chain = []
      for (let f = file; f; f = parent.get(f) ?? null) chain.unshift(f)
      return chain
    }
    if (!/\.tsx?$/.test(file)) continue
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(STATIC_IMPORT)) {
      const next = resolveSpecifier(match[1], file)
      if (next && !parent.has(next)) {
        parent.set(next, file)
        queue.push(next)
      }
    }
  }
  return null
}

describe('init-core: imports estáticos', () => {
  it('no evalúa ningún módulo de core que lea el platform adapter antes de initCore()', () => {
    const chain = findForbiddenChain()
    expect(chain?.map(f => f.replace(`${resolve(MOBILE_SRC, '..', '..', '..')}/`, ''))).toBeUndefined()
  })
})
