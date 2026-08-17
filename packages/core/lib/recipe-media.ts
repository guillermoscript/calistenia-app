/**
 * Foto y vídeo de una receta, vía TheMealDB (#171, extraído a core en #468).
 *
 * Las recetas de un plan pantry-aware las inventa el LLM y no se persisten, así
 * que no traen imagen: se busca una en TheMealDB (gratis, sin API key) con el
 * `photo_query` en inglés que el propio LLM genera. El matching es
 * deliberadamente estricto — una foto de otro plato es peor que ninguna foto.
 *
 * Estaba duplicado carácter a carácter en la pantalla de móvil y en el diálogo
 * de web; sin DOM ni React Native de por medio, el sitio era core.
 */
import { roundQty } from './shopping'

/** Tope del stepper de porciones del detalle de receta. */
export const MAX_SERVINGS = 8

// Cache in-module: misma query no se re-busca al volver a abrir la receta.
const mediaCache = new Map<string, MealMedia | null>()

type MealDbHit = { strMeal?: string; strMealThumb?: string; strYoutube?: string | null; strSource?: string | null }
export type MealMedia = { thumb: string; youtube: string | null; source: string | null }

async function mealDbSearch(q: string): Promise<MealDbHit[]> {
  const res = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(q)}`)
  if (!res.ok) throw new Error(`${res.status}`)
  const data = (await res.json()) as { meals?: MealDbHit[] | null }
  return data.meals ?? []
}

const sameWord = (a: string, b: string) => a === b || a === `${b}s` || `${a}s` === b

/**
 * Solo acepta una foto si el NOMBRE del plato coincide de verdad con la query:
 * todas las palabras de la query presentes y máx 1 palabra extra (0 si la query
 * es de una sola palabra). Una foto de otro plato es peor que ninguna foto.
 */
export function pickPreciseMeal(query: string, candidates: MealDbHit[]): MealMedia | null {
  const qwords = query.split(/\s+/).filter((w) => w.length >= 3)
  if (!qwords.length) return null
  const maxExtras = qwords.length === 1 ? 0 : 1
  let best: { meal: MealDbHit; extras: number } | null = null
  for (const m of candidates) {
    if (!m.strMealThumb) continue
    const nwords = (m.strMeal ?? '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean)
    if (!nwords.length) continue
    if (!qwords.every((w) => nwords.some((n) => sameWord(n, w)))) continue
    const extras = nwords.filter((n) => !qwords.some((w) => sameWord(n, w))).length
    if (extras <= maxExtras && (!best || extras < best.extras)) best = { meal: m, extras }
  }
  if (!best) return null
  return {
    thumb: best.meal.strMealThumb!,
    youtube: best.meal.strYoutube || null,
    source: best.meal.strSource || null,
  }
}

export async function fetchMealMedia(query: string): Promise<MealMedia | null> {
  const key = query.trim().toLowerCase()
  if (!key) return null
  if (mediaCache.has(key)) return mediaCache.get(key) ?? null
  try {
    // search.php matchea por nombre de plato; buscamos la query completa y cada
    // palabra para juntar candidatos, y filtramos con matching estricto.
    const seen = new Map<string, MealDbHit>()
    for (const q of new Set([key, ...key.split(/\s+/).filter((w) => w.length >= 3)])) {
      for (const m of await mealDbSearch(q)) seen.set(m.strMealThumb ?? m.strMeal ?? '', m)
    }
    const media = pickPreciseMeal(key, [...seen.values()])
    mediaCache.set(key, media)
    return media
  } catch {
    // Sin foto no pasa nada — la receta es el contenido.
    mediaCache.set(key, null)
    return null
  }
}

// 3 × 1.5 → "4.5", 100 × 2 → "200" — sin colas de float (roundQty de core).
export function scaleQty(qty: number, factor: number): string {
  return String(roundQty(qty * factor))
}
