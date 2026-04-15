# Phase Photo Checkpoints — Design Spec

## Context

The app has a 4-phase training program (6 weeks each, 24 weeks total). Users can already upload body photos one at a time, but there's no connection between photos and program phases. Users lack motivation to upload photos consistently because there's no visual payoff.

**Goal:** Integrate photo uploads into the program's phase transitions so users see their transformation aligned with their training journey. Make it opt-in, non-intrusive, but rewarding for those who participate.

## Design

### 1. Phase Photo Timeline

A horizontal timeline in the "Cuerpo" tab of ProgressPage, placed at the top.

- **4 nodes** — one per phase, colored with existing `PHASE_COLORS`
- **Completed node** (has photos): filled circle + thumbnail below
- **Current node** (active phase, no photos yet): pulsing outline animation
- **Future nodes**: grey outline
- Connecting line between nodes; solid up to current phase, dashed for future
- Tap on a completed node → opens PhotoComparator pre-filtered to that phase vs previous phase
- If 3+ phases have photos: show a "Inicio vs Ahora" shortcut button

### 2. Dashboard Nudge Banner

When the user completes their first workout of a new phase:

- A dismissible banner appears on DashboardPage
- Copy: "Empezaste Fase {n} — captura tu progreso" / "You started Phase {n} — capture your progress"
- CTA button opens the Phase Photo Upload Modal
- Banner does NOT appear if:
  - User already uploaded photos for this phase
  - User dismissed it (stored in localStorage: `phase_photo_nudge_dismissed_{phase}`)
- Non-blocking, appears below the header area

### 3. Phase Photo Upload Modal

A Dialog component with 3 tap zones for front/side/back:

- **3 upload zones** displayed side by side (or stacked on mobile)
- Each zone: dashed border, camera icon, category label (Frente/Lado/Espalda)
- Tap → opens file picker (jpeg/png/webp, max 10MB)
- After selecting: shows preview with remove button
- **Reference thumbnails**: if previous phase has photos in same category, show small thumbnail labeled "Fase {n-1}" next to the zone
- **None mandatory** — user can upload 1, 2, or 3
- "Guardar" button uploads all selected photos at once with the current phase number
- Loading state during upload with progress indication

### 4. Post-Upload Animations

**Moment 1 — Before/After Reveal** (immediately after save):
- If a previous phase photo exists in the same category:
  - Full-screen-ish overlay with crossfade animation (CSS transition, ~3s)
  - Shows "Fase {n-1}" label fading to "Fase {n}"
  - User taps or waits to dismiss
- If no previous photo (first checkpoint):
  - Photo appears with `scale-in` animation (existing Tailwind keyframe)
- Shows the best available comparison (prioritizes front category)

**Moment 2 — Timeline Update** (after reveal dismisses):
- The phase node animates: scale bounce + fill color transition
- Connection line draws progressively (CSS width transition)
- Thumbnail slides up below the node (`slide-up` keyframe)

All animations use existing Tailwind CSS keyframes — no new animation library needed.

### 5. Data Model Changes

**PocketBase `body_photos` collection** — add field:
- `phase` (number, optional) — which program phase this photo belongs to (1-4)

**`useBodyPhotos` hook extensions:**
- `getPhotosByPhase(phase: number): BodyPhoto[]` — filter photos by phase
- `uploadPhotos(files: {file: File, category: string}[], phase: number)` — batch upload
- Existing single-upload and timeline features remain unchanged

**New localStorage keys:**
- `phase_photo_nudge_dismissed_{phase}` — tracks dismissed nudges per phase

### 6. Component Breakdown

| Component | Type | Location |
|-----------|------|----------|
| `PhasePhotoTimeline` | New | `src/components/progress/PhasePhotoTimeline.tsx` |
| `PhasePhotoUploadModal` | New | `src/components/progress/PhasePhotoUploadModal.tsx` |
| `PhotoRevealAnimation` | New | `src/components/progress/PhotoRevealAnimation.tsx` |
| `PhasePhotoBanner` | New | `src/components/progress/PhasePhotoBanner.tsx` |
| `ProgressPage` | Modify | Add PhasePhotoTimeline to Cuerpo tab |
| `DashboardPage` | Modify | Add PhasePhotoBanner |
| `useBodyPhotos` | Modify | Add phase field support, batch upload, phase filter |
| Translation files | Modify | Add `progress.phasePhotos.*` keys (es + en) |
| PB migration | New | Add `phase` field to `body_photos` |

### 7. Translations (key structure)

```
progress.phasePhotos.timelineTitle → "Tu transformación" / "Your transformation"
progress.phasePhotos.startVsNow → "Inicio vs Ahora" / "Start vs Now"
progress.phasePhotos.uploadTitle → "Fotos de Fase {phase}" / "Phase {phase} Photos"
progress.phasePhotos.front/side/back → categories
progress.phasePhotos.previousPhase → "Fase {phase}" / "Phase {phase}"
progress.phasePhotos.save → "Guardar" / "Save"
progress.phasePhotos.nudge → "Empezaste Fase {phase} — captura tu progreso"
progress.phasePhotos.revealBefore/After → "Fase {n}" labels
progress.phasePhotos.uploading → "Subiendo..." / "Uploading..."
```

### 8. What This Does NOT Include

- No gamification (achievements, XP, badges for photos)
- No social features (sharing, reactions)
- No AI-powered body analysis
- No mandatory photo requirements — fully opt-in
- No changes to the existing BodyPhotosTimeline or free-form photo upload
