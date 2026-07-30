// Compila el CSS que consume el design system subido a claude.ai/design.
//
// apps/web es una app Vite, no una librería: su único CSS compilado es
// dist/assets/index-<hash>.css, cuyo nombre cambia en cada build y que solo
// contiene las utilidades que la app usa hoy. Este script produce una ruta
// estable (.ds-compiled.css) que además incluye el safelist del vocabulario
// completo, y le antepone el @import de las fuentes de marca (que en la app
// viven en index.html, no en el CSS).
//
// cfg.cssEntry apunta al resultado. Re-ejecutar tras cualquier cambio en
// src/index.css o tailwind.config.js.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const WEB = join(REPO, 'apps/web')
const TW_VERSION = '4.3.2' // debe seguir a apps/web devDependencies.tailwindcss

// Las fuentes de marca se sirven desde Google Fonts (apps/web/index.html).
// Sin esta línea el bundle renderiza en fallback y nada downstream lo detecta.
const FONTS = '@import url("https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,700;1,300&family=JetBrains+Mono:wght@400;600;700&display=swap");'

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, COREPACK_ENABLE_STRICT: '0' } })

console.log('→ safelist')
run(process.execPath, [join(HERE, 'gen-safelist.mjs')], REPO)

// Entrada envoltorio: el CSS real de la app + el safelist como fuente extra.
console.log('→ entrada envoltorio')
writeFileSync(join(WEB, '.ds-entry.css'), [
  '@import "./src/index.css";',
  '@source "../../.design-sync/ds-safelist.txt";',
  '',
].join('\n'))

console.log('→ tailwind')
run('pnpm', ['dlx', `@tailwindcss/cli@${TW_VERSION}`, '-i', './.ds-entry.css', '-o', './.ds-compiled.css'], WEB)

console.log('→ fuentes de marca')
const outPath = join(WEB, '.ds-compiled.css')
const css = readFileSync(outPath, 'utf8')
writeFileSync(outPath, css.includes('fonts.googleapis.com') ? css : `${FONTS}\n${css}`)

// Los activos de marca se anexan aquí, no vía cfg.tokensGlob: ese campo solo se
// consulta cuando hay un cfg.tokensPkg y se resuelve dentro de ese paquete
// (lib/css.mjs), así que no sirve para un archivo suelto del repo. Anexarlos al
// cssEntry los mete en _ds_bundle.css, que styles.css sí importa — y el cierre
// de @import de styles.css es lo único que reciben los diseños renderizados.
console.log('→ activos de marca')
run(process.execPath, [join(HERE, 'gen-brand-assets.mjs')], REPO)
const brand = readFileSync(join(HERE, 'brand-assets.css'), 'utf8')
writeFileSync(outPath, `${readFileSync(outPath, 'utf8')}\n${brand}`)

// Comprobación: una clase que solo existe en el safelist, nunca en la app.
const canary = 'grid-cols-11'
const finalCss = readFileSync(outPath, 'utf8')
console.log(
  finalCss.includes(canary)
    ? `✓ safelist activo (${canary} presente) — ${(finalCss.length / 1024).toFixed(0)} KB`
    : `✗ safelist IGNORADO — @source no convive con @config; ver .design-sync/NOTES.md`,
)
