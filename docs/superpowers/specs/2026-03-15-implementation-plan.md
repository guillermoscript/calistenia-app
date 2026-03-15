# Implementation Plan — Calistenia App Evolution

**Date:** 2026-03-15
**Based on:** [Design Spec](./2026-03-15-app-evolution-design.md)

---

## Fase 0: TypeScript Migration

### 0.1 Setup (tsconfig, deps, Vite)
- Install: `typescript`, `@types/react`, `@types/react-dom`
- Create `tsconfig.json` with `strict: false`, `allowJs: true`, `noEmit: true`, `jsx: react-jsx`
- Create `src/vite-env.d.ts` with `ImportMetaEnv` for `VITE_POCKETBASE_URL`
- Rename `vite.config.js` → `vite.config.ts`
- Add `"typecheck": "tsc --noEmit"` to package.json scripts
- Update build script: `"build": "tsc && vite build"`

### 0.2 Define Core Types
- Create `src/types/index.ts` with all interfaces:
  - `Exercise` (note: `sets: number | string` for "múltiples"/"intentos" cases)
  - `ExerciseMedia`, `Workout`, `WorkoutsMap`, `WorkoutKey`
  - `Phase`, `WeekDay`, `DayType`
  - `SetData`, `ExerciseLog`, `SessionDone`, `ProgressMap`
  - `Settings`, `ProgramMeta`
  - `LumbarCheck`, `User`, `PauseEntry`, `WorkDayData`
  - `ProtocolExercise`, `Protocol`
  - `NutritionEntry`, `FoodItem`, `NutritionGoal`, `UserProfile`

### 0.3 Migrate Leaf Modules (src/lib/)
1. `utils.js` → `utils.ts` — Add `ClassValue` type from clsx
2. `sounds.js` → `sounds.ts` — Type `tone()` params, declare `window.webkitAudioContext`
3. `notifications.js` → `notifications.ts` — Type `send()` and all exported functions
4. `pocketbase.js` → `pocketbase.ts` — Use `RecordModel`, `RecordAuthResponse` from PocketBase SDK

### 0.4 Migrate Data
- `data/workouts.js` → `data/workouts.ts` — Apply `Phase[]`, `WeekDay[]`, `WorkoutsMap` types

### 0.5 Migrate Hooks
1. `use-mobile.jsx` → `use-mobile.tsx` (trivial, returns `boolean`)
2. `useAuth.js` → `useAuth.ts` — Define `UseAuthReturn` interface, type PB error handling
3. `usePrograms.js` → `usePrograms.ts` — Define `UseProgramsReturn`, type PB record interfaces (`PBPhaseRecord`, etc.)
4. `useProgress.js` → `useProgress.ts` — Type `ProgressMap`, all CRUD functions
5. `useWorkDay.js` → `useWorkDay.ts` — Define `UseWorkDayReturn`, type refs

### 0.6 Migrate Components (bottom-up)
**UI components (14 files):** Mechanical rename `.jsx` → `.tsx`, add `React.ComponentPropsWithoutRef` types, `VariantProps` for button

**Custom components (8 files in order):**
1. `Timer.tsx` — Props: `initialSeconds?, onComplete?, autoStart?, label?`
2. `RestTimer.tsx` — Props: `seconds?, onDone?`
3. `YoutubeModal.tsx` — Props: `query, onClose`
4. `WeekPlanWidget.tsx` — Props: `selectedPhase, isWorkoutDone, weekDays?`
5. `LumbarCheckModal.tsx` — Props: `user, onDone, onSkip`
6. `ProgramSelectorModal.tsx` — Props: `programs, activeProgram, onSelect, onClose`
7. `ExerciseCard.tsx` — Props: `exercise, workoutKey, onLogSet, onStartRest, logs?`
8. `SessionView.tsx` (669 lines, 5 sub-components) — Type `Step`, phase union `'exercise' | 'rest' | 'note' | 'celebrate'`

### 0.7 Migrate Pages + Root
1. `AuthPage.tsx` — Type form events `React.FormEvent<HTMLFormElement>`
2. `DashboardPage.tsx` — 16+ props interface, internal `StatCard`/`GoalCard` props
3. `WorkoutPage.tsx` — Type `viewMode: 'list' | 'session'`
4. `LumbarPage.tsx` — Type internal `WorkDayClock`, `CountdownPill`, `PROTOCOLS`
5. `ProgressPage.tsx` — Type `allLogs` computation
6. `App.tsx` — Type `AppShell` props, `TABS` array with `React.FC<IconProps>`
7. `main.tsx` — Add `document.getElementById('root')!` assertion

### 0.8 Enable Strict Mode
Incrementally enable:
1. `"noImplicitAny": true` → fix all implicit any
2. `"strictNullChecks": true` → add null guards
3. `"strictFunctionTypes": true`
4. Finally `"strict": true`, remove `"allowJs": true`

**Total files: ~38 renames + 2 new files (tsconfig, vite-env.d.ts)**

---

## Fase 1: Exercise Media + Program Customization

### 1.1 PocketBase Migrations (backend first)

**1.1.1 Create `exercises_catalog` collection:**
- Fields: `name`, `slug` (unique), `description`, `muscles`, `category` (select: push/pull/legs/core/lumbar/full/mobility/skill), `youtube`, `default_images` (file×3), `default_video` (file×1, 50MB), `priority`, `is_timer`, `default_timer_seconds`, `default_sets`, `default_reps`, `default_rest_seconds`, `note`
- Rules: read for authenticated, CRUD admin-only
- Indexes: category, slug

**1.1.2 Add media fields to `program_exercises`:**
- `demo_images` (file, multiple, max 3, image mimeTypes)
- `demo_video` (file, single, video mimeTypes, 50MB)

**1.1.3 Add `created_by` to `programs`:**
- Relation to users (optional, nullable for system programs)
- Update rules: create/update/delete restricted to `created_by = @request.auth.id`
- Cascade security for phases/exercises via `program.created_by`

**1.1.4 Seed `exercises_catalog`:**
- Extract ~70 unique exercises from `SEED_WORKOUTS` in `scripts/pb-migrate.js`
- New `seedExercisesCatalog()` function with idempotency check

### 1.2 Exercise Media (UI)

**1.2.1 Thread PB records through data flow:**
- Update `usePrograms` → `buildWorkoutsMap` to preserve `pbRecordId`, `demoImages`, `demoVideo` on each exercise

**1.2.2 Create `src/components/workout/MediaViewer.tsx`:**
- Dialog with 3 tabs: Images (carousel with prev/next/dots), Video (HTML5 player), YouTube (existing search links)
- Images via `pb.files.getURL(record, filename)`

**1.2.3 Update `ExerciseCard.tsx`:**
- Show 40×40 thumbnail if `demoImages.length > 0`
- Tap → open MediaViewer
- Keep YouTube button as fallback when no media

**1.2.4 Update `SessionView.tsx`:**
- Same thumbnail + MediaViewer pattern in `ExerciseScreen`

### 1.3 Program Customization (UI)

**1.3.1 Create `src/hooks/useProgramEditor.ts`:**
State shape:
```typescript
{
  programId: string | null
  step: 1 | 2 | 3 | 4
  info: { name, description, duration_weeks }
  phases: Phase[]
  days: Record<string, { focus, type, color, exercises }>
  isDirty: boolean
  isSaving: boolean
  errors: Record<string, string>
}
```
Functions: `setStep`, `updateInfo`, `addPhase/removePhase/updatePhase`, `updateDay`, `addExercise/removeExercise/updateExercise/reorderExercise`, `loadProgram`, `saveProgram`, `validate`

**1.3.2 Create `src/components/programs/ExerciseCatalogPicker.tsx`:**
- Search input + category filter pills
- Lists exercises from `exercises_catalog`
- "Add" button per exercise

**1.3.3 Create `src/pages/ProgramEditorPage.tsx`:**
4-step wizard:
- **Step 1:** Name, description, duration (Input/Textarea)
- **Step 2:** 1-4 phases with name, week range, color swatches
- **Step 3:** Day config per phase (focus, type select, rest days)
- **Step 4:** Exercise selection per day (catalog picker + custom + media upload + drag reorder)
- Navigation: Back/Next, step indicator, "Save Draft", "Create Program"

**1.3.4 "Duplicar y Editar":**
- Add `duplicateProgram(programId)` to `usePrograms` — copies program + phases + exercises
- Add "Duplicar" button in `ProgramSelectorModal`
- Opens editor with pre-loaded copy

**1.3.5 Update `usePrograms.ts`:**
- Filter: show system programs + user's own programs
- Add `deleteProgram`, `duplicateProgram`
- Expose `loadProgramData` for editor

**1.3.6 Wire into App:**
- Full-screen overlay pattern (like SessionView, `fixed inset-0 z-[60]`)
- "Crear Programa" button in DashboardPage program section
- No new permanent tab (accessible from Dashboard + ProgramSelectorModal)

---

## Fase 2: AI Nutrition Tracking

### 2.1 Backend API Service

**2.1.1 Create `api/` directory:**
- `api/package.json` — deps: `express`, `multer`, `ai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai`, `zod`, `pocketbase`, `cors`
- `api/server.js` — Express server on port 3001
- `api/Dockerfile` — Node 20 alpine

**2.1.2 POST `/api/analyze-meal` endpoint:**
- Receives: multipart form (image + meal_type), Authorization header with PB token
- Validates PB token by calling auth refresh
- Reads user tier from PB user record
- Calls Vercel AI SDK `generateObject` with Zod schema:
  ```
  { foods: [{ name, portion_g, calories, protein, carbs, fat }], totals: { calories, protein, carbs, fat } }
  ```
- Tier mapping: free → `claude-haiku-4-5` / `gemini-flash`, pro → `claude-sonnet-4-6` / `gpt-4o`
- System prompt in Spanish for nutrition analysis

**2.1.3 Update `docker-compose.yml`:**
- Add `ai-api` service with env vars: `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENAI_API_KEY`, `POCKETBASE_URL`

**2.1.4 Update `vite.config.ts`:**
- Add proxy: `/api/analyze-meal` → `http://127.0.0.1:3001`

### 2.2 PocketBase Collections

**2.2.1 `nutrition_entries`:**
- `user` (relation), `photo` (file), `meal_type` (select: desayuno/almuerzo/cena/snack), `foods` (JSON), `total_calories/protein/carbs/fat` (numbers), `ai_model` (text), `logged_at` (date)
- Indexes: user, user+date
- Rules: user-scoped CRUD

**2.2.2 `nutrition_goals`:**
- `user` (relation, unique), `daily_calories/protein/carbs/fat` (numbers), `goal` (select), `weight`, `height`, `age`, `sex`, `activity_level`
- Rules: user-scoped CRUD

### 2.3 Frontend Hook

**2.3.1 Create `src/hooks/useNutrition.ts`:**
- Pattern: same as `useProgress` (PB + localStorage fallback)
- State: `entries`, `goals`, `isReady`
- CRUD: `analyzeMeal(imageFile, mealType)`, `saveEntry()`, `deleteEntry()`, `updateEntry()`
- Goals: `saveGoals()`, `calculateMacros()` (Mifflin-St Jeor formula)
- Computed: `getDailyTotals(date?)`, `getWeeklyAverages()`, `getEntriesForDate(date)`, `getRemainingMacros(date?)`
- Cost control: check daily analysis count (limit 5/day for free tier)

### 2.4 Frontend Components

**2.4.1 `src/components/nutrition/MacroBar.tsx`:**
- Props: `label, current, target, unit, color`
- Uses Radix Progress, color-coded: green < 80%, amber 80-100%, red > 100%

**2.4.2 `src/components/nutrition/NutritionGoalSetup.tsx`:**
- Multi-step wizard: body data → activity level → goal → review calculated macros → save
- Mifflin-St Jeor calculation with goal adjustments

**2.4.3 `src/components/nutrition/NutritionDashboard.tsx`:**
- Circular calorie gauge (SVG)
- 3 MacroBar components (protein/carbs/fat)
- Meal timeline (vertical list of today's meals, expandable cards)

**2.4.4 `src/components/nutrition/MealLogger.tsx`:**
- Dialog flow: capture photo → analyze (loading skeleton) → review/edit results → select meal type → confirm/save
- Client-side image compression (canvas resize to max 1024px before upload)
- `<input type="file" accept="image/*" capture="environment">`

**2.4.5 `src/components/nutrition/MealSuggestions.tsx`:**
- Static logic based on remaining macros
- Spanish suggestions: "Te faltan {n}g de proteína: pechuga de pollo (31g/100g), huevos (13g/2 unidades)..."

**2.4.6 Create `src/pages/NutritionPage.tsx`:**
- If no goals → show `NutritionGoalSetup`
- If goals → show `NutritionDashboard` + `MealLogger` (FAB) + `MealSuggestions`

### 2.5 Integration
- Add "Nutrición" tab to `App.tsx` TABS (5th position, after Progress)
- Add nutrition summary widget to `DashboardPage.tsx`
- Update GitHub Actions for AI API secrets

---

## Fase 3: Progression System + Progress Improvements

### 3.1 Exercise Progressions

**3.1.1 PB collection `exercise_progressions`:**
- `exercise_id`, `exercise_name`, `category`, `difficulty_order`, `next_exercise_id`, `prev_exercise_id`, `target_reps_to_advance`, `sessions_at_target`
- Admin-only write, authenticated read

**3.1.2 Seed progression chains:**
- Push: pushup_std → diamond → archer → one_arm_prog → one_arm_actual
- Pull: australian → neg_pullup → pullup_strict → weighted → typewriter → one_arm_prog
- Legs: goblet_squat → bulgarian → pistol_prog → pistol_free
- Core: plank → hollow_hold → hollow_rock → lsit_prog → lsit_full
- Handstand: pike_pushup → pike_elevated → handstand_wall → pike_hspu → hspu_wall

**3.1.3 Create `src/hooks/useProgressions.ts`:**
- Fetch all progressions, group by category
- `getChainForExercise(id)` → full ordered chain
- `shouldSuggestProgression(id, logs)` → boolean

**3.1.4 Create `src/components/workout/ProgressionChain.tsx`:**
- Horizontal chain: arrows connecting exercises
- Current = lime, completed = muted green, future = muted gray
- Pulsing "Listo para avanzar" badge when ready

**3.1.5 Integrate in ExerciseCard + SessionView:**
- "PROGRESIÓN" button in ExerciseCard
- Post-workout suggestion dialog in SessionView

### 3.2 Enhanced Progress Page

**3.2.1 Install recharts** (`npm install recharts`)

**3.2.2 Create `src/components/progress/ExerciseChart.tsx`:**
- LineChart: date × reps, two lines (max reps lime, avg reps sky)
- Collapsible per exercise

**3.2.3 PB collection `weight_entries`:**
- `user`, `weight_kg`, `date`, `note`

**3.2.4 Create `src/hooks/useWeight.ts`:**
- `logWeight()`, `getWeightHistory()`

**3.2.5 Weight tracking UI in ProgressPage:**
- Line chart + quick-add form + trend stats

**3.2.6 PB collection `body_photos`:**
- `user`, `photo` (file), `date`, `category` (front/side/back), `note`

**3.2.7 Create `src/hooks/useBodyPhotos.ts` + `src/components/progress/BodyPhotosTimeline.tsx`:**
- Photo grid + before/after comparison + upload

**3.2.8 Create `src/components/progress/ProgressSummary.tsx`:**
- Weekly/monthly stats with period comparison

**3.2.9 Rebuild ProgressPage** to integrate all new sections

### 3.3 Enhanced User Profile

**3.3.1 PB migration:** Add weight, height, level, goal, avatar to users
**3.3.2 Create `src/pages/ProfilePage.tsx`:** Form + avatar upload + BMI
**3.3.3 Add "Perfil" tab** in App.tsx

---

## Fase 4: PWA + Polish

### 4.1 Setup
- Install `vite-plugin-pwa`
- Configure in `vite.config.ts`: manifest (name, icons, theme, display: standalone), workbox (cache strategies)

### 4.2 Caching Strategy
- **Precache:** static assets (JS, CSS, HTML, images, fonts) via globPatterns
- **Network-first:** PocketBase API calls (`/api/*`) with 5s timeout + cache fallback
- **Cache-first:** Google Fonts

### 4.3 Icons
- Create `public/icons/`: icon-192.png, icon-512.png, icon-512-maskable.png

### 4.4 Offline Banner
- Create `src/components/OfflineBanner.tsx`
- Uses `navigator.onLine` + window events
- Amber banner: "Sin conexión — los datos se guardan localmente"

### 4.5 Offline Sync Queue
- Create `src/lib/offlineQueue.ts`
- Store failed PB writes in localStorage
- Replay on reconnect (`online` event)
- Modify `useProgress` to catch PB errors and enqueue

### 4.6 Install Prompt
- Create `src/components/InstallPrompt.tsx`
- Listen `beforeinstallprompt`, show dismissible card on mobile
- Dismiss stored in localStorage (7-day cooldown)

### 4.7 Push Notifications Groundwork (optional)
- Create `src/lib/pushNotifications.ts`: permission, subscribe, scheduleLocal
- Toggle in ProfilePage

---

## Dependency Graph & Execution Order

```
Fase 0 (TypeScript) ──────────────────────────────┐
  0.1 Setup                                        │
  0.2 Types                                        │
  0.3 Lib modules                                  │
  0.4 Data                                         │
  0.5 Hooks                                        │
  0.6 Components                                   │
  0.7 Pages                                        │
  0.8 Strict mode                                  │
  ↓                                                │
Fase 1 (Media + Programs) ────────────────────────┤
  1.1 PB migrations (catalog, media fields, rules) │
  1.2 Media UI (viewer, thumbnails)                │
  1.3 Program editor (hook, picker, wizard, dupe)  │
  ↓                                                │
Fase 2 (AI Nutrition) ────────────────────────────┤
  2.1 Backend API (Express + Vercel AI SDK)        │
  2.2 PB collections (entries, goals)              │
  2.3 Hook (useNutrition)                          │
  2.4 Components (logger, dashboard, macros)       │
  2.5 Integration (tab, dashboard widget)          │
  ↓                                                │
Fase 3 (Progressions + Progress) ─────────────────┤
  3.1 Progression system (PB, hook, chain UI)      │
  3.2 Enhanced progress (charts, weight, photos)   │
  3.3 User profile (PB fields, profile page)       │
  ↓                                                │
Fase 4 (PWA + Polish) ────────────────────────────┘
  4.1-4.2 Service worker + manifest
  4.3 Icons
  4.4-4.5 Offline banner + sync queue
  4.6 Install prompt
  4.7 Push notifications (optional)
```

Each Fase is independently deployable. Within each Fase, steps are ordered by dependency.

---

## New Files Summary

| Fase | New Files | Modified Files |
|------|-----------|----------------|
| 0 | `tsconfig.json`, `src/vite-env.d.ts`, `src/types/index.ts` | 38 renames (.js→.ts, .jsx→.tsx) |
| 1 | 3 PB migrations, `MediaViewer.tsx`, `ExerciseCatalogPicker.tsx`, `ProgramEditorPage.tsx`, `useProgramEditor.ts` | `usePrograms.ts`, `ExerciseCard.tsx`, `SessionView.tsx`, `ProgramSelectorModal.tsx`, `App.tsx`, `DashboardPage.tsx`, `scripts/pb-migrate.js` |
| 2 | `api/server.js`, `api/package.json`, `api/Dockerfile`, 2 PB migrations, `useNutrition.ts`, `MacroBar.tsx`, `NutritionGoalSetup.tsx`, `NutritionDashboard.tsx`, `MealLogger.tsx`, `MealSuggestions.tsx`, `NutritionPage.tsx` | `docker-compose.yml`, `vite.config.ts`, `App.tsx`, `DashboardPage.tsx` |
| 3 | 3 PB migrations, `useProgressions.ts`, `useWeight.ts`, `useBodyPhotos.ts`, `ProgressionChain.tsx`, `ExerciseChart.tsx`, `BodyPhotosTimeline.tsx`, `ProgressSummary.tsx`, `ProfilePage.tsx` | `ExerciseCard.tsx`, `SessionView.tsx`, `ProgressPage.tsx`, `App.tsx`, `scripts/pb-migrate.js` |
| 4 | `OfflineBanner.tsx`, `offlineQueue.ts`, `InstallPrompt.tsx`, `pushNotifications.ts`, `public/icons/*` | `vite.config.ts`, `package.json`, `App.tsx`, `useProgress.ts` |
