// Genera .design-sync/brand-assets.css — los activos de marca como custom
// properties, para que lleguen a los diseños renderizados.
//
// Por qué hace falta: el conversor solo embarca componentes, tokens, fuentes y
// markdown. El logo vive en apps/web/public/ y no se subía, así que el agente de
// diseño no tenía con qué firmar un flier. Y los diseños renderizados solo
// reciben el cierre de @import de styles.css, así que un PNG suelto en el
// proyecto no sería alcanzable: la vía fiable es incrustarlo en CSS.
//
// Se emiten variables, no clases de utilidad: las variables son datos, mientras
// que una clase nueva sería vocabulario que no existe en la app y que el agente
// acabaría usando en código que luego no compila ahí.
//
// El PNG de origen (.design-sync/assets/brand-mark.png) está recortado al
// contenido, escalado a 512px de alto y cuantizado a 16 colores: 303 KB → 16 KB,
// sin pérdida visible porque es arte plano. Se commitea ya procesado para que
// re-generar no dependa de tener una librería de imágenes instalada.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))

const mark = readFileSync(join(HERE, 'assets/brand-mark.png')).toString('base64')

// Trama de hairlines de la superficie de marketing (ver og.png). SVG inline:
// pesa nada y escala a cualquier lienzo.
const grid = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48">` +
    `<path d="M48 0H0v48" fill="none" stroke="hsl(0 0% 100% / 0.04)" stroke-width="1"/>` +
    `</svg>`,
).toString('base64')

const css = `/* Activos de marca — generado por .design-sync/gen-brand-assets.mjs.
   No editar a mano. */

:root {
  /* Marca gráfica: atleta en front lever, lima sobre transparente.
     Proporción 428 × 512 (0.836) — respétala o el atleta se deforma.
     Uso: style={{ backgroundImage: 'var(--brand-mark)', backgroundSize: 'contain',
     backgroundRepeat: 'no-repeat' }} sobre una caja con esa proporción. */
  --brand-mark: url("data:image/png;base64,${mark}");
  --brand-mark-aspect: 428 / 512;

  /* Trama de hairlines de la superficie de marketing. Se repite. */
  --brand-grid: url("data:image/svg+xml;base64,${grid}");

  /* Glow lima de la superficie de marketing. Va SOBRE bg-background.
     Solo para piezas de marketing y social — nunca en UI de producto. */
  --brand-glow: radial-gradient(60% 60% at 85% 85%, hsl(74 90% 57% / 0.16), transparent 70%);
}
`

writeFileSync(join(HERE, 'brand-assets.css'), css)
console.log(`brand-assets.css: marca ${(mark.length / 1024) | 0} KB en base64`)
