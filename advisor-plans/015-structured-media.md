# Plan 015: Structured, version-controlled exercise media (sequence + muscle-map + video + thumbnail)

> Extends Plan 014. Built on `advisor/exercise-data-integration` (full 008–014 stack).
> Branch: `advisor/015-structured-media`.

## Decision (chosen by maintainer 2026-06-21)

**Structured media** on the canonical record, not a flat image array. Each exercise's
demo media is **version-controlled static content**, identical for all users, shipped
with the app (offline-friendly). PB file fields remain as an optional admin/program
override (Plan 014's layers).

```
media {
  sequence?:  string   // phase strip — the movement demo (hero)
  muscles?:   string    // muscle-activation map (own "músculos trabajados" section)
  video?:     string    // optional looping form clip
  thumbnail?: string    // small preview for lists/cards
}
```

Values are **filenames** inside the per-exercise folder `seeds/exercises/media/<slug>/`.

## Storage & delivery

- **Source of truth (versioned):** `seeds/exercises/media/<slug>/{sequence,muscles,thumbnail}.webp`, `video.mp4`.
- **Web delivery (static):** `scripts/sync-exercise-media.mjs` copies `seeds/exercises/media/**` →
  `apps/web/public/exercise-media/**`. Served by the web origin at `/exercise-media/<slug>/<file>`.
- **Bundled catalog:** the generator writes a resolved `media` object on each entry with
  **origin-relative paths** (`/exercise-media/<slug>/sequence.webp`). Works offline in library/free-session.
- **Mobile:** fetches the same files from the configured origin (`https://gym.guille.tech/exercise-media/...`)
  via the resolver's baseURL — no per-platform asset duplication.
- **PB (optional override):** migration adds `media_sequence`/`media_muscles`/`media_thumbnail` file fields
  (image mimes) to `exercises_catalog` (additive — preserve all existing field ids, `feedback_migration_safety`);
  reuse existing `default_video`. `seed-exercises.mjs` uploads them. The resolver still prefers a
  `program_exercises` demo override → then catalog (static or PB) → then youtube.

## Universal support (all 307)

`media` is an **optional field on every canonical entry**. No file yet → the resolver returns the
youtube fallback (Plan 014). So every exercise "supports" media by construction; coverage is just
"drop the files + reference them". The generator reports `with_sequence` / `with_muscle_map` counters.

## Scope (in)

1. `seeds/exercises/_schema.json` — replace `image_files`/`video_file` with structured `media` (optional).
2. `scripts/build-exercise-catalog.mjs` — carry `media` into the bundled catalog as origin-relative paths
   (enrich + new-entry passes); add `with_sequence`/`with_muscle_map` counters.
3. `scripts/sync-exercise-media.mjs` (new) — copy media into `apps/web/public/exercise-media/`; wire an
   npm `build:media`; call it from `build:catalog` (or document running both).
4. `packages/core/lib/exerciseMedia.ts` — extend `ResolvedMedia` to `{ sequence, muscles, thumbnail, video,
   images[], youtubeUrl }`; resolve catalog static paths (prefixed by baseURL) + keep program-override + youtube.
   Keep back-compat (`images[]` still derived). Unit tests for the new fields + fallback order.
3. `apps/web/src/components/MediaViewer.tsx` — render `sequence` as the hero demo and `muscles` in a
   labelled "Músculos trabajados" block; video if present. Used by session + exercise-detail.
5. `apps/mobile/src/components/SessionView.tsx` (+ any mobile detail) — render `sequence` (+ `muscles`)
   via the resolver with `expo-image`.
6. `pb_migrations/<ts>_add_structured_media_to_exercises_catalog.js` — add the 3 file fields (additive, id-preserving).
7. `scripts/seed-exercises.mjs` — upload `media.*` from `seeds/exercises/media/<slug>/` to the PB fields.

## Out of scope

- Bulk media content for all 307 (ongoing). v1 ships the pipeline + `strict-pull-up` as the worked example.
- Per-phase guided timer (Plan 013 note).

## Worked example (already staged on this branch)

`seeds/exercises/media/strict-pull-up/{sequence,muscles,thumbnail}.webp` (split from a composite demo)
+ `media` added to the `strict-pull-up` seed entry. After build, `pullup_strict` shows the sequence as
its demo and the muscle map in its own section.

## Verify

- `node scripts/build-exercise-catalog.mjs` → `pullup_strict.media.sequence === "/exercise-media/strict-pull-up/sequence.webp"`; 3 catalog copies md5-identical; validator 0 errors; invariant held.
- `node scripts/sync-exercise-media.mjs` → files present under `apps/web/public/exercise-media/strict-pull-up/`.
- resolver unit tests pass; `cd apps/web && npm run build` + `cd apps/mobile && npm run typecheck` exit 0.
- PB migration adds fields only (no drop/recreate).

## Done criteria

- [ ] Structured `media` in schema + bundled catalog; `strict-pull-up` example renders on web (sequence hero + muscle section).
- [ ] Resolver returns structured media with correct fallback; tests pass.
- [ ] Sync script + `build:media`; web build + mobile typecheck green.
- [ ] PB migration (id-preserving) + seed upload path.
- [ ] Universal: no-media exercises fall back to youtube; counters reported.
