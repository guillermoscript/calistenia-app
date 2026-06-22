# Plan 014: Canonical, reusable exercise media (one image/video set per exercise, reused across library · program · free session · mobile)

> **Executor instructions**: Follow step by step; run every verification; obey
> STOP conditions. Update this plan's status row in `advisor-plans/README-exercise-data.md` when
> done. This is a multi-part plan — land it in the phases shown; each phase is
> independently shippable.
>
> **Drift check (run first)**:
> `git diff --stat 943f558..HEAD -- apps/web/src/components/MediaViewer.tsx packages/core/hooks/usePrograms.ts scripts/seed-exercises.mjs seeds/exercises/_schema.json pb_migrations`
> Re-confirm the "Current state" facts before editing.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED (touches media resolution across surfaces + a seed upload step;
  no destructive data ops)
- **Depends on**: 011 (media attaches to the unified canonical record)
- **Related**: 013 (tempo) — both extend the canonical record
- **Category**: data architecture / UX
- **Planned at**: commit `943f558`, 2026-06-21

## Why this matters

The request — *"a proper way to have this organized and systematically so we can
reuse images, videos and more for explanatory purposes"* — is exactly what is
missing. Today exercise media is **fragmented and barely reused**:

- Media lives in **two disconnected PocketBase collections** with **no fallback
  between them**: `exercises_catalog` (`default_images`, `default_video`) and
  `program_exercises` (`demo_images`, `demo_video`). A program exercise with no
  media does **not** inherit the catalog's canonical media.
- The web `MediaViewer` **only** resolves `program_exercises` file URLs
  (`/api/files/program_exercises/...`); the catalog's `default_images`/
  `default_video` are **unreachable from the session view**.
- **Mobile has no media rendering at all.**
- The seed schema defines `image_files`/`video_file`, but `seed-exercises.mjs`
  **ignores them** — seed media is never uploaded, so there's no systematic way to
  ship curated media with an exercise.
- Coverage is **8/171 images, 2 videos**; `youtube` is only a *search query
  string*, not a curated video. `with_video_links: 171` in the catalog header is
  misleading (those are search queries, not videos).

Result: the same exercise's demo has to be attached manually per program, can't be
shown on mobile, and there's no pipeline to add media once and reuse it. This plan
makes **`exercises_catalog` the canonical media source**, adds a **fallback
hierarchy**, a **shared resolver**, a **seed media pipeline**, and **mobile
rendering**.

## Current state (verified)

- **PB schema** — `pb_migrations/1774000001_created_exercises_catalog.js:111-141`
  (VERBATIM): `default_images` (`type:"file"`, `maxSelect:3`), `default_video`
  (`type:"file"`, `maxSelect:1`). And `pb_migrations/1774000002_updated_program_exercises.js:14-48`
  adds `demo_images` (file, max 3) + `demo_video` (file, max 1) to
  `program_exercises`. **Two separate media stores.**
- **Web MediaViewer** — `apps/web/src/components/MediaViewer.tsx:17-27` reads
  `exercise.demoImages` / `exercise.demoVideo` and builds a YouTube **search**
  link from `exercise.youtube`. Lines 65–104 render images/video via
  `/api/files/program_exercises/${exercise.pbRecordId}/${file}` — **program path
  only**.
- **Program mapping** — `packages/core/hooks/usePrograms.ts:134-150` maps
  `demoImages: r.demo_images || []`, `demoVideo: r.demo_video || ''`,
  `pbRecordId: r.id` from `program_exercises`. No catalog fallback.
- **Free session** — `apps/web/src/pages/FreeSessionPage.tsx:132-145` sets
  `demoImages: ex.images?.length ? ex.images : undefined` from the **catalog JSON
  `images` array** (which holds *wger external URLs*, not PB file names) — a
  different shape than MediaViewer expects, hence broken.
- **Seed pipeline** — `scripts/seed-exercises.mjs:149-171` (VERBATIM record
  create) writes name/slug/description/etc. but **never** uploads
  `image_files`/`video_file`. Schema `seeds/exercises/_schema.json:157-168`
  defines them ("Empty = placeholder for later") but they are dropped.
- **wger import** — `packages/core/hooks/useWgerSearch.ts:51-99` downloads up to 2
  images and `formData.append('default_images', ...)` onto `exercises_catalog` —
  the one existing path that populates canonical media.
- **MCP** — `mcp-server/src/tools/media.ts:44-108` already reads **both**
  `program_exercises` (demo_*) and `exercises_catalog` (default_*) media — proof
  the catalog/program distinction is intended; the app side just doesn't use the
  catalog side.
- **Mobile** — `apps/mobile/src/components/SessionView.tsx` has **no media
  viewer** component.

## Design

Make **`exercises_catalog` the canonical media** for an exercise; everything else
reuses it.

1. **Fallback hierarchy** (resolve in order): `program_exercises.demo_*` (a
   deliberate per-program override) → `exercises_catalog.default_*` (the canonical
   set) → curated video (see #4) → `youtube` search link (last resort). A program
   exercise with no override shows the canonical media automatically.
2. **Shared resolver** in core, e.g. `packages/core/lib/exerciseMedia.ts`:
   `getExerciseMedia(exercise, { pb baseURL }): { images: string[]; video: string|null; youtubeUrl: string }`
   returning fully-resolved URLs (PB file URLs for `program_exercises` *or*
   `exercises_catalog`, depending on which level provided the media). Both web
   MediaViewer and the new mobile viewer call this — **one resolution rule**, no
   per-surface ad-hoc logic.
3. **Fix MediaViewer** to use the resolver (so it can render catalog media, not
   just program media) and fix the free-session mapping so catalog media flows
   through the same shape.
4. **Seed media pipeline**: make `seed-exercises.mjs` upload `image_files` /
   `video_file` (relative paths under `seeds/exercises/media/`) to
   `exercises_catalog.default_images` / `default_video`. This makes media
   **version-controlled and seeded systematically** — add a file once, it's the
   canonical demo everywhere. Carry the file references into the bundled catalog
   via the Plan-011 generator (store resolvable URLs/paths).
5. **Mobile media viewer**: add a `MediaViewer`-equivalent to mobile `SessionView`
   (use `expo-image` per `vercel-react-native-skills`; video via the project's
   existing video approach or a lightweight player) driven by the same resolver.
6. **Honest catalog metadata**: fix the misleading `with_video_links` counter
   (it counts youtube search queries) — split into `with_curated_video` vs
   `with_youtube_query` in the Plan-011 generator.

This plan builds the **pipeline and reuse**; filling media for all 263 exercises
is ongoing content work that the pipeline now makes systematic (drop files in
`seeds/exercises/media/`, re-seed).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Core tests | discovered runner | pass |
| Web build | `cd apps/web && npm run build` | exit 0 |
| Mobile typecheck | `cd apps/mobile && npm run typecheck` | exit 0 |
| Image coverage today | `grep -c '"images": \[$' packages/core/data/exercise-catalog.json` (approx) | small (~8) |
| Seed media dir | `ls seeds/exercises/media 2>/dev/null` | create if absent |

## Scope

**In scope**: `packages/core/lib/exerciseMedia.ts` (create resolver) + tests,
`apps/web/src/components/MediaViewer.tsx` (use resolver + catalog fallback),
`apps/web/src/pages/FreeSessionPage.tsx` (fix media shape),
`packages/core/hooks/usePrograms.ts` (pass through catalog fallback inputs if
needed), `scripts/seed-exercises.mjs` (upload seed media),
`seeds/exercises/_schema.json` (confirm media fields) + `seeds/exercises/media/`
(new dir), the Plan-011 generator (carry media refs + honest counters), a new
mobile media viewer component in `apps/mobile`, `advisor-plans/README-exercise-data.md`.

**Out of scope**: a PB schema change to the media file fields (they already
exist), bulk content creation (filling all media — that's ongoing), tempo
(Plan 013), `sets_log`.

## Git workflow

- Branch: `advisor/014-canonical-reusable-media` (from `main`).
- Explicit paths in `git add`. Commit per phase. Style:
  `feat(media): canonical reusable exercise media with program→catalog fallback`
- Media binaries: keep `seeds/exercises/media/` small/optimized; do not commit
  huge raw videos without the maintainer's OK (consider git-lfs / external host
  if large). Flag size before committing.
- No push/PR/merge/rebase without the operator's say-so.

## Steps (phased)

1. **Resolver + tests** — `getExerciseMedia` with the 4-level fallback; pure unit
   tests (program override wins; catalog fallback; youtube last resort; empty →
   youtube only).
2. **Web** — refactor `MediaViewer` to use the resolver (now renders catalog
   media); fix `FreeSessionPage` media shape. Manual smoke: an exercise with only
   catalog media now shows it in session view; a program override still wins.
3. **Seed media pipeline** — `seed-exercises.mjs` uploads `image_files`/`video_file`;
   add `seeds/exercises/media/` with a couple of real demo files as proof; re-seed
   (dry-run first) and confirm `default_images` populated in PB.
4. **Generator** — Plan-011 build carries media references into the bundled JSON
   and fixes the `with_video_links` counter.
5. **Mobile** — add the media viewer to mobile `SessionView` using the resolver.
   Manual smoke on device (maintainer drives) per `feedback_device_test_handoff`.
6. Tests + build gate; update the index.

**Verify** highlights: resolver unit tests pass; `grep -n 'getExerciseMedia'
apps/web/src/components/MediaViewer.tsx` and the mobile viewer → present;
`grep -n 'default_images' scripts/seed-exercises.mjs` → the upload now exists;
web build + mobile typecheck exit 0.

## Test plan

The **resolver is pure → unit-tested** and is the regression-critical core
(fallback order must be exact: a wrong order would, e.g., show a stale program
override or skip the canonical set). The viewer/seed-upload/mobile pieces are
verified by manual smoke (you set up; maintainer drives the UI/device per
`feedback_device_test_handoff`). Confirm no surface regresses to a broken
`/api/files/program_exercises/...` URL when only catalog media exists.

## Done criteria

- [ ] `packages/core/lib/exerciseMedia.ts` resolver exists with the documented fallback order; unit tests pass.
- [ ] Web `MediaViewer` + free session use the resolver and can render **catalog** media (not just program media).
- [ ] `seed-exercises.mjs` uploads `image_files`/`video_file`; `seeds/exercises/media/` exists with proof files; a re-seed populates `default_images`.
- [ ] Plan-011 generator carries media refs and reports honest counters (`with_curated_video` vs `with_youtube_query`).
- [ ] Mobile `SessionView` renders exercise media via the resolver.
- [ ] `cd apps/web && npm run build` + `cd apps/mobile && npm run typecheck` exit 0.
- [ ] `advisor-plans/README-exercise-data.md` plan 014 row updated.

## STOP conditions

- 011's unified catalog/pipeline does not exist yet (media has no canonical record
  to attach to) — coordinate ordering.
- A seed media file is large enough to bloat the repo — STOP and ask about
  git-lfs / external hosting before committing binaries.
- The resolver change would break an existing program that *does* have working
  `program_exercises` media — verify the override path still wins.
- Mobile video playback needs a native dependency not already installed — report
  before adding (native rebuild implications, per the mobile build gotchas).

## Maintenance notes

- After this lands, adding a demo is systematic: drop optimized files in
  `seeds/exercises/media/<slug>/`, reference them in the seed JSON, run the seed +
  catalog build — the media then appears in library, programs (as fallback), free
  session, and mobile automatically.
- Curated YouTube videos: consider adding a structured `video_url`/`video_id`
  field (vs the search-only `youtube` query) so explanatory videos are persistent
  and embeddable — a small follow-up once the pipeline exists.
- Keep media optimized (web-friendly sizes, looping short clips for demos). The
  resolver is the single place to add responsive/thumbnail variants later.
