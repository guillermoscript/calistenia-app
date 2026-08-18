import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * `--lime` es el único acento de la app y siempre se empareja con
 * `--lime-foreground` para el texto/iconos que van encima (`bg-lime` +
 * `text-lime-foreground`). Si ese par no llega a 4,5:1 (WCAG AA, texto
 * normal), esos botones/badges quedan ilegibles. Ver issue #548: en modo
 * claro `--lime-foreground` era blanco sobre un lima medio-oscuro y daba
 * 2,33:1.
 *
 * Este test parsea los valores HSL crudos del CSS (sin montar componentes)
 * y calcula el contraste real, así que una futura vuelta a un valor claro
 * en `--lime-foreground` (o un cambio de `--lime` que rompa el par) falla
 * aquí en vez de en producción.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))

type Hsl = { h: number; s: number; l: number }

function parseToken(css: string, block: 'root' | 'dark', name: string): Hsl {
  // Bloque `:root { ... }` (light) o `.dark { ... }` / `.dark:root { ... }`.
  const blockRe = block === 'root'
    ? /:root\s*\{([\s\S]*?)\n\s{0,2}\}/
    : /\.dark(?::root)?\s*\{([\s\S]*?)\n\s{0,2}\}/
  const blockMatch = css.match(blockRe)
  if (!blockMatch) throw new Error(`No se encontró el bloque ${block} en el CSS`)

  const tokenRe = new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`)
  const tokenMatch = blockMatch[1].match(tokenRe)
  if (!tokenMatch) throw new Error(`No se encontró --${name} en el bloque ${block}`)

  const [, h, s, l] = tokenMatch
  return { h: Number(h), s: Number(s), l: Number(l) }
}

/** HSL -> sRGB (0-255), fórmula estándar CSS Color 4. */
function hslToRgb({ h, s, l }: Hsl): [number, number, number] {
  const sN = s / 100
  const lN = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = sN * Math.min(lN, 1 - lN)
  const f = (n: number) => lN - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
}

/** Luminancia relativa WCAG 2.x. */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const chan = (c: number) => {
    const cs = c / 255
    return cs <= 0.03928 ? cs / 12.92 : ((cs + 0.055) / 1.055) ** 2.4
  }
  const [rl, gl, bl] = [chan(r), chan(g), chan(b)]
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl
}

/** Ratio de contraste WCAG 2.x entre dos colores (orden indistinto). */
function contrastRatio(a: Hsl, b: Hsl): number {
  const la = relativeLuminance(hslToRgb(a))
  const lb = relativeLuminance(hslToRgb(b))
  const [lighter, darker] = la >= lb ? [la, lb] : [lb, la]
  return (lighter + 0.05) / (darker + 0.05)
}

const AA_NORMAL_TEXT = 4.5

describe('contraste lime/lime-foreground (#548)', () => {
  it('web: cumple AA en modo claro', () => {
    const css = readFileSync(path.resolve(__dirname, '../index.css'), 'utf-8')
    const lime = parseToken(css, 'root', 'lime')
    const foreground = parseToken(css, 'root', 'lime-foreground')
    expect(contrastRatio(lime, foreground)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
  })

  it('web: cumple AA en modo oscuro', () => {
    const css = readFileSync(path.resolve(__dirname, '../index.css'), 'utf-8')
    const lime = parseToken(css, 'dark', 'lime')
    const foreground = parseToken(css, 'dark', 'lime-foreground')
    expect(contrastRatio(lime, foreground)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
  })

  it('mobile: cumple AA en modo claro (mismo token portado en global.css)', () => {
    const css = readFileSync(
      path.resolve(__dirname, '../../../mobile/src/global.css'),
      'utf-8',
    )
    const lime = parseToken(css, 'root', 'lime')
    const foreground = parseToken(css, 'root', 'lime-foreground')
    expect(contrastRatio(lime, foreground)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
  })

  it('mobile: cumple AA en modo oscuro', () => {
    const css = readFileSync(
      path.resolve(__dirname, '../../../mobile/src/global.css'),
      'utf-8',
    )
    const lime = parseToken(css, 'dark', 'lime')
    const foreground = parseToken(css, 'dark', 'lime-foreground')
    expect(contrastRatio(lime, foreground)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
  })
})
