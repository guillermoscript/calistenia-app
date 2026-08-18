/** Utilidades puras para listas reordenables (picker manual + preview IA). */

/** Devuelve una copia del array con los índices `a` y `b` intercambiados. */
export function swap<T>(items: T[], a: number, b: number): T[] {
  const next = [...items]
  ;[next[a], next[b]] = [next[b], next[a]]
  return next
}

/** Devuelve una copia del array sin el elemento en `index`. */
export function removeAt<T>(items: T[], index: number): T[] {
  return items.filter((_, i) => i !== index)
}

/**
 * Mueve el elemento de `from` a `to`. Si `to` queda fuera de rango devuelve el
 * array sin cambios (mismo array, para no romper memoización).
 */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return items
  return swap(items, from, to)
}
