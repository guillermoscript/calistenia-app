// Emite las declaraciones .d.ts de los primitivos de UI a apps/web/ds-types.
//
// Sin esto el conversor no tiene contrato de props que leer (la app usa
// `noEmit: true`) y emite `[key: string]: unknown` para los 129 componentes.
// Ver .design-sync/tsconfig.dts.json.
//
// tsc puede salir con código != 0 por errores de tipo preexistentes de la app;
// con `noEmitOnError` en falso (el valor por defecto) las declaraciones se
// emiten igual, así que aquí solo se avisa y se comprueba la salida real.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const OUT = join(REPO, 'apps/web/ds-types')

if (existsSync(OUT)) rmSync(OUT, { recursive: true })

try {
  execFileSync(
    join(REPO, 'apps/web/node_modules/.bin/tsc'),
    ['-p', join(HERE, 'tsconfig.dts.json')],
    { cwd: REPO, stdio: ['ignore', 'inherit', 'inherit'] },
  )
} catch {
  console.log('⚠ tsc terminó con errores de tipo — se comprueba la salida emitida')
}

const uiDir = join(OUT, 'components/ui')
const emitted = existsSync(uiDir) ? readdirSync(uiDir).filter((f) => f.endsWith('.d.ts')) : []
console.log(
  emitted.length >= 31
    ? `✓ declaraciones: ${emitted.length} archivos en apps/web/ds-types/components/ui`
    : `✗ solo ${emitted.length} declaraciones emitidas (se esperaban 31) — el contrato de props quedará vacío`,
)
