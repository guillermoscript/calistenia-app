# seeds/exercises/media — Drop-in Demo Media

This directory holds demo images and videos for exercises in the catalog.
Files dropped here are uploaded automatically to `exercises_catalog.default_images`
and `exercises_catalog.default_video` when you run the seed script.

## Drop-in Workflow

1. **Add files here** using the naming convention below.
2. **Reference them** in the seed JSON file (`image_files` / `video_file` fields).
3. **Run the seed script** — it will upload the files automatically:

   ```sh
   node scripts/seed-exercises.mjs <PB_URL> <EMAIL> <PASSWORD>
   ```

   Files that don't exist on disk are silently skipped (no error).

## Naming Convention

```
seeds/exercises/media/<slug>-1.jpg    # first demo image
seeds/exercises/media/<slug>-2.jpg    # second demo image
seeds/exercises/media/<slug>-3.jpg    # third demo image
seeds/exercises/media/<slug>.mp4      # demo video
```

Where `<slug>` matches the `slug` field in the exercise's seed JSON entry.

### Example

For the push-up exercise with `"slug": "push_up"`:

```
seeds/exercises/media/push_up-1.jpg
seeds/exercises/media/push_up-2.jpg
seeds/exercises/media/push_up.mp4
```

And in `seeds/exercises/push.json`:

```json
{
  "slug": "push_up",
  "image_files": ["push_up-1.jpg", "push_up-2.jpg"],
  "video_file": "push_up.mp4"
}
```

## Media Spec

- Images: JPEG or PNG, max 1 MB each, max 3 per exercise (1200 × 900 px recommended)
- Video: MP4 (H.264), max 10 MB, 30 fps, landscape (16:9)
- No media committed to git — this directory is intentionally empty except for this README.
  Add an entry in `.gitignore` if you want to keep downloaded media out of version control.

## Resolver

Once uploaded to PocketBase, the media is served via the canonical resolver at
`packages/core/lib/exerciseMedia.ts` with a 4-level fallback hierarchy:

```
(a) program override  → program_exercises.demo_images / demo_video
(b) catalog default   → exercises_catalog.default_images / default_video  ← uploaded here
(c) curated video URL
(d) YouTube search    ← always available
```
