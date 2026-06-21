import { describe, it, expect } from 'vitest'
import { getExerciseMedia } from './exerciseMedia'
import type { ExerciseMediaInput, CatalogMediaRecord, CatalogStaticMedia } from './exerciseMedia'

const PB = 'https://gym.guille.tech'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const exerciseWithOverride: ExerciseMediaInput = {
  pbRecordId: 'pe_rec_123',
  demoImages: ['demo1.jpg', 'demo2.jpg'],
  demoVideo: 'demo.mp4',
  youtube: 'push up tutorial',
}

const exerciseNoOverride: ExerciseMediaInput = {
  pbRecordId: 'pe_rec_456',
  demoImages: [],
  demoVideo: '',
  youtube: 'pull up tutorial',
}

const exerciseNoMedia: ExerciseMediaInput = {
  youtube: 'squat tutorial',
}

const catalogWithMedia: CatalogMediaRecord = {
  pbRecordId: 'cat_rec_789',
  defaultImages: ['cat1.jpg'],
  defaultVideo: 'cat_demo.mp4',
  youtube_query: 'squat exercise tutorial',
}

const catalogWithCurated: CatalogMediaRecord = {
  pbRecordId: 'cat_rec_abc',
  defaultImages: [],
  curatedVideoUrl: 'https://cdn.example.com/exercise.mp4',
  youtube_query: 'lunge tutorial',
}

const catalogNoMedia: CatalogMediaRecord = {
  pbRecordId: 'cat_rec_def',
  defaultImages: [],
  youtube_query: 'burpee exercise tutorial',
}

// [015] Catalog with static structured media (bundled catalog paths)
const pullupStaticMedia: CatalogStaticMedia = {
  sequence:  '/exercise-media/strict-pull-up/sequence.webp',
  muscles:   '/exercise-media/strict-pull-up/muscles.webp',
  thumbnail: '/exercise-media/strict-pull-up/thumbnail.webp',
}

const catalogWithStaticMedia: CatalogMediaRecord = {
  pbRecordId: 'cat_rec_pullup',
  youtube_query: 'strict pull-up tutorial',
  staticMedia: pullupStaticMedia,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getExerciseMedia', () => {
  // (a) Program override wins
  it('returns program override images + video when pbRecordId + demoImages set', () => {
    const result = getExerciseMedia(exerciseWithOverride, { pbBaseUrl: PB })
    expect(result.source).toBe('program')
    expect(result.images).toHaveLength(2)
    expect(result.images[0]).toBe(`${PB}/api/files/program_exercises/pe_rec_123/demo1.jpg`)
    expect(result.images[1]).toBe(`${PB}/api/files/program_exercises/pe_rec_123/demo2.jpg`)
    expect(result.video).toBe(`${PB}/api/files/program_exercises/pe_rec_123/demo.mp4`)
    expect(result.youtubeUrl).toContain('youtube.com')
  })

  it('program override: uses relative /api/files/ path when no pbBaseUrl', () => {
    const result = getExerciseMedia(exerciseWithOverride, {})
    expect(result.images[0]).toBe('/api/files/program_exercises/pe_rec_123/demo1.jpg')
    expect(result.video).toBe('/api/files/program_exercises/pe_rec_123/demo.mp4')
    expect(result.source).toBe('program')
  })

  // (b) Catalog fallback when no program override
  it('falls back to catalog default_images when program has no media', () => {
    const result = getExerciseMedia(exerciseNoOverride, {
      pbBaseUrl: PB,
      catalogRecord: catalogWithMedia,
    })
    expect(result.source).toBe('catalog')
    expect(result.images).toHaveLength(1)
    expect(result.images[0]).toBe(`${PB}/api/files/exercises_catalog/cat_rec_789/cat1.jpg`)
    expect(result.video).toBe(`${PB}/api/files/exercises_catalog/cat_rec_789/cat_demo.mp4`)
  })

  it('catalog fallback: uses relative /api/files/ path when no pbBaseUrl', () => {
    const result = getExerciseMedia(exerciseNoOverride, { catalogRecord: catalogWithMedia })
    expect(result.images[0]).toBe('/api/files/exercises_catalog/cat_rec_789/cat1.jpg')
    expect(result.source).toBe('catalog')
  })

  // (c) Curated video fallback
  it('falls back to curated video URL when no PB files exist', () => {
    const result = getExerciseMedia(exerciseNoMedia, {
      pbBaseUrl: PB,
      catalogRecord: catalogWithCurated,
    })
    expect(result.source).toBe('curated')
    expect(result.images).toHaveLength(0)
    expect(result.video).toBe('https://cdn.example.com/exercise.mp4')
    expect(result.youtubeUrl).toContain('youtube.com')
  })

  // (d) YouTube last resort
  it('returns youtube-only when no media at any layer', () => {
    const result = getExerciseMedia(exerciseNoMedia, { catalogRecord: catalogNoMedia })
    expect(result.source).toBe('none')
    expect(result.images).toHaveLength(0)
    expect(result.video).toBeNull()
    expect(result.youtubeUrl).toBe(
      'https://www.youtube.com/results?search_query=' +
        encodeURIComponent('squat tutorial'),
    )
  })

  it('returns empty youtubeUrl when no youtube query at all', () => {
    const result = getExerciseMedia({}, {})
    expect(result.source).toBe('none')
    expect(result.youtubeUrl).toBe('')
  })

  // YouTube query from catalog when exercise.youtube is absent
  it('uses catalog youtube_query for youtubeUrl when exercise.youtube is absent', () => {
    const result = getExerciseMedia({}, { catalogRecord: catalogNoMedia })
    expect(result.youtubeUrl).toBe(
      'https://www.youtube.com/results?search_query=' +
        encodeURIComponent('burpee exercise tutorial'),
    )
  })

  // Program override: demoImages empty but demoVideo present → still program
  it('program override triggers with video only (no images)', () => {
    const ex: ExerciseMediaInput = {
      pbRecordId: 'pe_video_only',
      demoImages: [],
      demoVideo: 'vid.mp4',
      youtube: 'test',
    }
    const result = getExerciseMedia(ex, { pbBaseUrl: PB })
    expect(result.source).toBe('program')
    expect(result.images).toHaveLength(0)
    expect(result.video).toBe(`${PB}/api/files/program_exercises/pe_video_only/vid.mp4`)
  })

  // No pbRecordId → no program override even with demoImages
  it('skips program layer when pbRecordId is absent', () => {
    const ex: ExerciseMediaInput = {
      demoImages: ['img.jpg'],
      demoVideo: 'vid.mp4',
      youtube: 'test',
    }
    const result = getExerciseMedia(ex, {
      pbBaseUrl: PB,
      catalogRecord: catalogWithMedia,
    })
    // Should fall to catalog, not program
    expect(result.source).toBe('catalog')
  })

  // ── [Plan 015] Structured static media ──────────────────────────────────────

  it('[015] resolves staticMedia fields with origin-relative paths (web, no baseUrl)', () => {
    const result = getExerciseMedia(exerciseNoMedia, { catalogRecord: catalogWithStaticMedia })
    expect(result.source).toBe('catalog')
    expect(result.sequence).toBe('/exercise-media/strict-pull-up/sequence.webp')
    expect(result.muscles).toBe('/exercise-media/strict-pull-up/muscles.webp')
    expect(result.thumbnail).toBe('/exercise-media/strict-pull-up/thumbnail.webp')
    // back-compat images[] = [sequence, muscles]
    expect(result.images).toEqual([
      '/exercise-media/strict-pull-up/sequence.webp',
      '/exercise-media/strict-pull-up/muscles.webp',
    ])
  })

  it('[015] prefixes origin-relative paths with mediaBaseUrl (mobile)', () => {
    const result = getExerciseMedia(exerciseNoMedia, {
      catalogRecord: catalogWithStaticMedia,
      mediaBaseUrl: PB,
    })
    expect(result.source).toBe('catalog')
    expect(result.sequence).toBe(`${PB}/exercise-media/strict-pull-up/sequence.webp`)
    expect(result.muscles).toBe(`${PB}/exercise-media/strict-pull-up/muscles.webp`)
    expect(result.thumbnail).toBe(`${PB}/exercise-media/strict-pull-up/thumbnail.webp`)
    expect(result.images[0]).toBe(`${PB}/exercise-media/strict-pull-up/sequence.webp`)
  })

  it('[015] program override wins over staticMedia; muscles/thumbnail still from catalog', () => {
    const result = getExerciseMedia(exerciseWithOverride, {
      pbBaseUrl: PB,
      catalogRecord: catalogWithStaticMedia,
    })
    expect(result.source).toBe('program')
    // sequence gets first program image
    expect(result.sequence).toBe(`${PB}/api/files/program_exercises/pe_rec_123/demo1.jpg`)
    // muscles still comes from catalog staticMedia (supplementary)
    expect(result.muscles).toBe('/exercise-media/strict-pull-up/muscles.webp')
  })

  it('[015] no-media exercise → sequence/muscles/thumbnail all null, youtubeUrl set', () => {
    const result = getExerciseMedia(exerciseNoMedia, { catalogRecord: catalogNoMedia })
    expect(result.source).toBe('none')
    expect(result.sequence).toBeNull()
    expect(result.muscles).toBeNull()
    expect(result.thumbnail).toBeNull()
    expect(result.images).toHaveLength(0)
    expect(result.youtubeUrl).toContain('youtube.com')
  })
})
