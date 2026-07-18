/**
 * Lógica pura de la sección «Descubre» (issue #236) — directorio bilingüe de
 * TODAS las features de la app, complemento permanente de «Novedades» (que solo
 * cuenta lo nuevo). El catálogo vive en packages/core/data/features.json con el
 * mismo patrón bilingüe {es, en} del changelog; añadir una feature nueva es
 * añadir una entrada al JSON, sin tocar componentes.
 */
import type { LocalizedText } from './whats-new'

// Reexport para que los consumidores del directorio no dependan de whats-new.
export { pickLang } from './whats-new'
export type { LocalizedText }

export type FeatureCategory = 'training' | 'nutrition' | 'progress' | 'community' | 'extras'

export interface FeatureEntry {
  id: string
  /** Nombre del icono lucide; cada plataforma lo resuelve con un mapa local (sin eval). */
  icon: string
  category: FeatureCategory
  title: LocalizedText
  body: LocalizedText
  /** Ruta expo-router destino; null = no navegable (p. ej. widgets de escritorio). */
  route: string | null
}

/** Orden fijo de presentación de las categorías del directorio. */
export const FEATURE_CATEGORY_ORDER: readonly FeatureCategory[] = [
  'training',
  'nutrition',
  'progress',
  'community',
  'extras',
]

export interface FeatureGroup {
  category: FeatureCategory
  features: FeatureEntry[]
}

/**
 * Agrupa el catálogo por categoría en el orden fijo, preservando el orden de
 * las entradas dentro de cada grupo y omitiendo categorías vacías.
 */
export function groupFeatures(features: FeatureEntry[]): FeatureGroup[] {
  return FEATURE_CATEGORY_ORDER.map((category) => ({
    category,
    features: features.filter((f) => f.category === category),
  })).filter((g) => g.features.length > 0)
}
