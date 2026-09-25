/**
 * Punto de foco de la portada de un programa.
 *
 * La portada se pinta recortada en proporciones distintas (16:9 en la lista y
 * en la ficha de móvil, 2:1 en la ficha de escritorio) y ningún encuadre fijo
 * sirve para todas las fotos: el 25 % que había cortaba la cabeza de una
 * flexión, y el centro corta la cara de alguien de pie. El autor marca en el
 * editor dónde está lo importante y cada superficie lo usa como
 * `object-position` (web) o `contentPosition` (expo-image).
 *
 * Se guarda en `programs.cover_focus` como texto «x y» en porcentajes enteros
 * («50 30»), validado en PocketBase con el mismo patrón que produce
 * `formatCoverFocus`. Vacío = centrado.
 *
 * Módulo puro: sin React, sin PocketBase y sin Expo, para que lo compartan web,
 * móvil y los tests de core.
 */

export interface CoverFocus {
  /** 0 = borde izquierdo, 100 = borde derecho. */
  x: number
  /** 0 = borde superior, 100 = borde inferior. */
  y: number
}

export const DEFAULT_COVER_FOCUS: CoverFocus = { x: 50, y: 50 }

const STORED = /^(\d{1,3}) (\d{1,3})$/

/** Entero entre 0 y 100; lo que no es un número cae al centro. */
function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 50
  return Math.min(100, Math.max(0, Math.round(n)))
}

/** Lee `cover_focus`. Vacío, ausente o mal formado = centrado. */
export function parseCoverFocus(raw?: string | null): CoverFocus {
  const m = raw ? STORED.exec(raw.trim()) : null
  if (!m) return DEFAULT_COVER_FOCUS
  const x = Number(m[1])
  const y = Number(m[2])
  if (x > 100 || y > 100) return DEFAULT_COVER_FOCUS
  return { x, y }
}

/**
 * Valor a guardar en `cover_focus`. El centro se guarda como cadena vacía: es
 * lo mismo que no haber elegido, y así «sin foco» tiene una sola forma.
 */
export function formatCoverFocus(focus: CoverFocus): string {
  const x = clampPercent(focus.x)
  const y = clampPercent(focus.y)
  return x === 50 && y === 50 ? '' : `${x} ${y}`
}

/** `object-position` de CSS para web: «50% 30%». */
export function coverObjectPosition(raw?: string | null): string {
  const { x, y } = parseCoverFocus(raw)
  return `${x}% ${y}%`
}

/** `contentPosition` de expo-image. */
export function coverContentPosition(raw?: string | null): { left: `${number}%`; top: `${number}%` } {
  const { x, y } = parseCoverFocus(raw)
  return { left: `${x}%`, top: `${y}%` }
}

/**
 * Foco a partir de dónde pulsó el autor sobre la foto ENTERA, en píxeles
 * relativos a su esquina superior izquierda. Una pulsación que se sale del
 * borde se queda en el borde.
 */
export function focusFromPoint(px: number, py: number, width: number, height: number): CoverFocus {
  if (!(width > 0) || !(height > 0)) return DEFAULT_COVER_FOCUS
  return { x: clampPercent((px / width) * 100), y: clampPercent((py / height) * 100) }
}

/** Mueve el foco con el teclado (flechas), sin salirse de la foto. */
export function nudgeCoverFocus(focus: CoverFocus, dx: number, dy: number): CoverFocus {
  return { x: clampPercent(focus.x + dx), y: clampPercent(focus.y + dy) }
}
