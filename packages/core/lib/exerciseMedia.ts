/**
 * exerciseMedia.ts — canonical exercise media resolver (Plan 014)
 *
 * Resolves the media set for an exercise using a 4-level fallback hierarchy:
 *   (a) program override  — program_exercises.demo_images / demo_video (PB file URL)
 *   (b) catalog default   — exercises_catalog.default_images / default_video (PB file URL)
 *   (c) curated video     — a direct video URL stored on the catalog entry
 *   (d) youtube search    — last resort, always available from exercise.youtube
 *
 * Pure function: no imports from pocketbase, no side effects.
 * Suitable for use in both web and React Native.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Minimal shape of an Exercise as seen by the resolver.
 * Both program exercises and catalog exercises fit this shape.
 */
export interface ExerciseMediaInput {
  /** PocketBase record id for program_exercises (program override layer) */
  pbRecordId?: string
  /** File names from program_exercises.demo_images (program override) */
  demoImages?: string[]
  /** File name from program_exercises.demo_video (program override) */
  demoVideo?: string
  /** YouTube search query or video title */
  youtube?: string
}

/**
 * Minimal shape of an exercises_catalog record needed for fallback.
 * Fields come from the PB record or the bundled JSON catalog.
 */
export interface CatalogMediaRecord {
  /** PocketBase record id of the exercises_catalog entry */
  pbRecordId?: string
  /** File names from exercises_catalog.default_images */
  defaultImages?: string[]
  /** File name from exercises_catalog.default_video */
  defaultVideo?: string
  /** Direct curated video URL (not a PB file, e.g. https://…/demo.mp4) */
  curatedVideoUrl?: string
  /** YouTube search query */
  youtube_query?: string
}

export interface ExerciseMediaOpts {
  /** PocketBase base URL (e.g. "https://gym.guille.tech") */
  pbBaseUrl?: string
  /** Catalog record for this exercise — used for fallback layers (b) and (c) */
  catalogRecord?: CatalogMediaRecord
}

export interface ResolvedMedia {
  /** Fully-resolved image URLs (may be empty) */
  images: string[]
  /** Fully-resolved video URL or null */
  video: string | null
  /** YouTube search URL (always available when exercise.youtube is set) */
  youtubeUrl: string
  /** Which layer produced the images/video: 'program' | 'catalog' | 'curated' | 'none' */
  source: 'program' | 'catalog' | 'curated' | 'none'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pbFileUrl(baseUrl: string, collection: string, recordId: string, filename: string): string {
  return `${baseUrl}/api/files/${collection}/${recordId}/${filename}`
}

function buildYoutubeUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
}

// ── Resolver ──────────────────────────────────────────────────────────────────

/**
 * Resolve the canonical media set for an exercise.
 *
 * @param exercise - The exercise (from program_exercises or free session)
 * @param opts     - Options: pbBaseUrl + optional catalog record for fallback
 * @returns ResolvedMedia with images[], video, youtubeUrl, source
 */
export function getExerciseMedia(
  exercise: ExerciseMediaInput,
  opts: ExerciseMediaOpts = {},
): ResolvedMedia {
  const { pbBaseUrl = '', catalogRecord } = opts

  // (d) YouTube URL — always computed (last resort, but used in all paths)
  const ytQuery = exercise.youtube?.trim()
    || catalogRecord?.youtube_query?.trim()
    || ''
  const youtubeUrl = ytQuery ? buildYoutubeUrl(ytQuery) : ''

  // (a) Program override — program_exercises file URLs
  if (exercise.pbRecordId && (exercise.demoImages?.length || exercise.demoVideo)) {
    const images = (exercise.demoImages || [])
      .filter(Boolean)
      .map(f => pbBaseUrl
        ? pbFileUrl(pbBaseUrl, 'program_exercises', exercise.pbRecordId!, f)
        : `/api/files/program_exercises/${exercise.pbRecordId}/${f}`)

    const video = exercise.demoVideo
      ? (pbBaseUrl
          ? pbFileUrl(pbBaseUrl, 'program_exercises', exercise.pbRecordId, exercise.demoVideo)
          : `/api/files/program_exercises/${exercise.pbRecordId}/${exercise.demoVideo}`)
      : null

    if (images.length > 0 || video) {
      return { images, video, youtubeUrl, source: 'program' }
    }
  }

  // (b) Catalog default — exercises_catalog file URLs
  if (catalogRecord?.pbRecordId && (catalogRecord.defaultImages?.length || catalogRecord.defaultVideo)) {
    const images = (catalogRecord.defaultImages || [])
      .filter(Boolean)
      .map(f => pbBaseUrl
        ? pbFileUrl(pbBaseUrl, 'exercises_catalog', catalogRecord.pbRecordId!, f)
        : `/api/files/exercises_catalog/${catalogRecord.pbRecordId}/${f}`)

    const video = catalogRecord.defaultVideo
      ? (pbBaseUrl
          ? pbFileUrl(pbBaseUrl, 'exercises_catalog', catalogRecord.pbRecordId, catalogRecord.defaultVideo)
          : `/api/files/exercises_catalog/${catalogRecord.pbRecordId}/${catalogRecord.defaultVideo}`)
      : null

    if (images.length > 0 || video) {
      return { images, video, youtubeUrl, source: 'catalog' }
    }
  }

  // (c) Curated video URL (direct, non-PB)
  if (catalogRecord?.curatedVideoUrl) {
    return {
      images: [],
      video: catalogRecord.curatedVideoUrl,
      youtubeUrl,
      source: 'curated',
    }
  }

  // (d) YouTube only — no hosted media at all
  return { images: [], video: null, youtubeUrl, source: 'none' }
}
