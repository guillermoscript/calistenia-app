/**
 * catalogMedia.ts — bundled-catalog static media lookup (Plan 015)
 *
 * The resolver in `exerciseMedia.ts` is pure and takes a `catalogRecord.staticMedia`.
 * This module supplies that staticMedia by indexing the bundled catalog JSON by id,
 * so any surface (library, session, free session, mobile) can resolve a canonical
 * exercise's structured media from just its id — without each call site importing
 * the catalog. Works on web and React Native (the JSON is bundled either way).
 */

import catalog from '../data/exercise-catalog.json'
import type { CatalogStaticMedia } from './exerciseMedia'

interface CatalogEntry {
  id: string
  seed_slug?: string
  slug?: string
  media?: CatalogStaticMedia
}

const mediaByKey: Map<string, CatalogStaticMedia> = (() => {
  const m = new Map<string, CatalogStaticMedia>()
  const categories = (catalog as { categories?: Record<string, { exercises?: CatalogEntry[] }> }).categories ?? {}
  for (const cat of Object.values(categories)) {
    for (const ex of cat.exercises ?? []) {
      if (ex.media && (ex.media.sequence || ex.media.muscles || ex.media.thumbnail || ex.media.video)) {
        // Index by every identifier a caller might hold: catalog id, seed slug, or display slug.
        for (const key of [ex.id, ex.seed_slug, ex.slug]) {
          if (key) m.set(key, ex.media)
        }
      }
    }
  }
  return m
})()

/** Return the bundled structured media for a canonical exercise id or slug, if any. */
export function getCatalogStaticMedia(idOrSlug?: string): CatalogStaticMedia | undefined {
  return idOrSlug ? mediaByKey.get(idOrSlug) : undefined
}
