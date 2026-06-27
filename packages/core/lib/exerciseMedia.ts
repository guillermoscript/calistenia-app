/**
 * exerciseMedia.ts — canonical exercise media resolver (Plan 014 + 015)
 *
 * Resolves the media set for an exercise using a 4-level fallback hierarchy:
 *   (a) program override  — program_exercises.demo_images / demo_video (PB file URL)
 *   (b) catalog static    — bundled catalog entry's `media` object (origin-relative paths)
 *   (c) curated video     — a direct video URL stored on the catalog entry
 *   (d) youtube search    — last resort, always available from exercise.youtube
 *
 * Plan 015 adds structured media fields: sequence (hero demo), muscles (activation map),
 * thumbnail (list preview), and video. Origin-relative paths ("/exercise-media/…") can be
 * prefixed with a baseUrl for mobile where same-origin is not available.
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
 * Structured static media object from the bundled catalog (Plan 015).
 * Values are origin-relative paths (e.g. "/exercise-media/strict-pull-up/sequence.webp").
 */
export interface CatalogStaticMedia {
  /** Phase-strip movement demo (hero). Origin-relative path. */
  sequence?: string
  /** Muscle-activation map. Origin-relative path. */
  muscles?: string
  /** Small preview for lists/cards. Origin-relative path. */
  thumbnail?: string
  /** Optional looping form-demo video. Origin-relative path. */
  video?: string
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
  /**
   * Structured static media from the bundled catalog (Plan 015).
   * Origin-relative paths — prefix with mediaBaseUrl for mobile.
   */
  staticMedia?: CatalogStaticMedia
}

export interface ExerciseMediaOpts {
  /** PocketBase base URL (e.g. "https://gym.guille.tech") */
  pbBaseUrl?: string
  /**
   * Base URL (origin) to prefix onto origin-relative static media paths.
   * Used on mobile where "/exercise-media/…" is not same-origin.
   * Example: "https://gym.guille.tech"
   * If omitted, paths are returned as-is (web same-origin).
   */
  mediaBaseUrl?: string
  /** Catalog record for this exercise — used for fallback layers (b) and (c) */
  catalogRecord?: CatalogMediaRecord
}

export interface ResolvedMedia {
  /** Fully-resolved image URLs (may be empty). Back-compat list. */
  images: string[]
  /** Fully-resolved video URL or null */
  video: string | null
  /** YouTube search URL (always available when exercise.youtube is set) */
  youtubeUrl: string
  /** Which layer produced the images/video: 'program' | 'catalog' | 'curated' | 'none' */
  source: 'program' | 'catalog' | 'curated' | 'none'
  /**
   * [Plan 015] Structured static media fields.
   * Resolved sequence/muscles/thumbnail from the catalog's static media bundle.
   * Origin-relative paths from the catalog are prefixed with mediaBaseUrl if provided.
   */
  sequence: string | null
  muscles: string | null
  thumbnail: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pbFileUrl(baseUrl: string, collection: string, recordId: string, filename: string): string {
  return `${baseUrl}/api/files/${collection}/${recordId}/${filename}`
}

function buildYoutubeUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
}

/**
 * Prefix an origin-relative path (starting with "/") with mediaBaseUrl when provided.
 * Absolute URLs (starting with "https://") are returned unchanged.
 * Empty/null values return null.
 */
function resolveStaticPath(path: string | undefined, mediaBaseUrl: string): string | null {
  if (!path) return null
  if (path.startsWith('/') && mediaBaseUrl) return `${mediaBaseUrl}${path}`
  return path
}

// ── Resolver ──────────────────────────────────────────────────────────────────

/**
 * Resolve the canonical media set for an exercise.
 *
 * Fallback hierarchy:
 *   (a) Program override — program_exercises.demo_images / demo_video (PB file URL)
 *   (b) Catalog static   — bundled catalog entry's `media` object (origin-relative paths)
 *   (c) Curated video    — a direct video URL stored on the catalog entry
 *   (d) YouTube only     — last resort; youtubeUrl is always computed
 *
 * [Plan 015] Structured fields (sequence, muscles, thumbnail) are resolved from
 * catalogRecord.staticMedia (origin-relative paths, optionally prefixed by mediaBaseUrl).
 * A program override maps its first demoImage onto `sequence` for UI consistency.
 *
 * @param exercise - The exercise (from program_exercises or free session)
 * @param opts     - Options: pbBaseUrl, mediaBaseUrl, optional catalog record
 * @returns ResolvedMedia with images[], video, youtubeUrl, source, sequence, muscles, thumbnail
 */
export function getExerciseMedia(
  exercise: ExerciseMediaInput,
  opts: ExerciseMediaOpts = {},
): ResolvedMedia {
  const { pbBaseUrl = '', mediaBaseUrl = '', catalogRecord } = opts

  // (d) YouTube URL — always computed (last resort, but used in all paths)
  const ytQuery = exercise.youtube?.trim()
    || catalogRecord?.youtube_query?.trim()
    || ''
  const youtubeUrl = ytQuery ? buildYoutubeUrl(ytQuery) : ''

  // [015] Resolve static structured media from catalog (origin-relative → absolute)
  const sm = catalogRecord?.staticMedia
  const resolvedSequence  = resolveStaticPath(sm?.sequence,  mediaBaseUrl)
  const resolvedMuscles   = resolveStaticPath(sm?.muscles,   mediaBaseUrl)
  const resolvedThumbnail = resolveStaticPath(sm?.thumbnail, mediaBaseUrl)

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
      // Map the first program image onto `sequence` so the hero slot is always filled.
      // Fall through to catalog staticMedia for muscles/thumbnail (supplementary).
      return {
        images,
        video,
        youtubeUrl,
        source: 'program',
        sequence: images[0] ?? resolvedSequence,
        muscles: resolvedMuscles,
        thumbnail: images[0] ?? resolvedThumbnail,
      }
    }
  }

  // (b) Catalog static media (Plan 015) — origin-relative paths from bundled catalog
  if (sm && (sm.sequence || sm.muscles || sm.thumbnail || sm.video)) {
    const staticVideo = resolveStaticPath(sm.video, mediaBaseUrl)
    // Back-compat images[]: [sequence, muscles] filtered
    const staticImages = [resolvedSequence, resolvedMuscles].filter(Boolean) as string[]
    return {
      images: staticImages,
      video: staticVideo,
      youtubeUrl,
      source: 'catalog',
      sequence: resolvedSequence,
      muscles: resolvedMuscles,
      thumbnail: resolvedThumbnail,
    }
  }

  // (b2) Catalog PB file fields — exercises_catalog.default_images / default_video
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
      return {
        images,
        video,
        youtubeUrl,
        source: 'catalog',
        sequence: images[0] ?? null,
        muscles: null,
        thumbnail: images[0] ?? null,
      }
    }
  }

  // (c) Curated video URL (direct, non-PB)
  if (catalogRecord?.curatedVideoUrl) {
    return {
      images: [],
      video: catalogRecord.curatedVideoUrl,
      youtubeUrl,
      source: 'curated',
      sequence: null,
      muscles: null,
      thumbnail: null,
    }
  }

  // (d) YouTube only — no hosted media at all
  return {
    images: [],
    video: null,
    youtubeUrl,
    source: 'none',
    sequence: null,
    muscles: null,
    thumbnail: null,
  }
}
