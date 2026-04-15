# Welmi Analysis: Muscle Focus & Exercise Targeting

**Date:** 2026-03-31
**Status:** Draft
**Scope:** User preferences for muscle focus, intensity, and training schedule; impact on program generation and exercise selection

---

## 1. What We Currently Have

### Exercise Categorization
- **8 exercise categories** in the catalog: `core`, `full`, `legs`, `lumbar`, `movilidad`, `pull`, `push`, `skill` (157 total exercises)
- **Muscles field** is a free-text string on every exercise (e.g. "Pecho, hombros, triceps", "Dorsal, biceps, romboides"). Not normalized -- each exercise has a comma-separated list of Spanish muscle names
- **Difficulty levels** on exercises: `beginner`, `intermediate`, `advanced` (via `difficulty_level` select field on `exercises_catalog`)
- **Priority field** on program exercises: `high`, `med`, `low` -- determines emphasis within a workout

### Program Structure
- **Programs** collection: `name`, `description`, `duration_weeks`, `is_active`, `difficulty`, `is_official`, `is_featured`, `cover_image`, `created_by`
- **Program phases** (4 phases in default program): each phase spans several weeks, increasing difficulty. E.g. Phase 1 "Base & Activacion" (weeks 1-6) through Phase 4 "Peak & Consolidacion" (weeks 21-26)
- **Program exercises**: tied to a specific `program + phase_number + day_id`, with full exercise metadata denormalized per row (exercise_name, sets, reps, rest_seconds, muscles, note, youtube, priority, sort_order)
- **Program day config**: defines the daily structure per phase (`day_type`: push/pull/lumbar/legs/full/rest/cardio, plus cardio-specific config)
- **User programs**: junction table linking user to program, with `is_current` flag

### Weekly Schedule (Hardcoded in Default Program)
The default program uses a fixed 7-day week:
| Day | Focus | Type |
|-----|-------|------|
| Lunes | Empuje + Core | push |
| Martes | Tiron + Movilidad | pull |
| Miercoles | Lumbar + Stretching | lumbar |
| Jueves | Piernas + Gluteos | legs |
| Viernes | Full Body + Core | full |
| Sabado | Caminata activa | rest |
| Domingo | Descanso total | rest |

### Training Schedule Features
- **Weekly goal** in settings: user sets 1-7 sessions/week target
- **Workout reminders**: per-user, supports `hour`, `minute`, `days_of_week` (JSON array), `enabled` toggle
- **No day-of-week selection**: users cannot choose which specific days they train. The program prescribes Mon-Fri workouts and Sat-Sun rest, regardless of user preference

### Exercise Progressions
- `exercise_progressions` collection tracks progression chains: `exercise_id -> next_exercise_id`, grouped by `category`, ordered by `difficulty_order`
- Supports auto-progression: when user hits `target_reps_to_advance` for `sessions_at_target` sessions, suggest advancing

### What's Missing
- No muscle group preference system
- No intensity preference (beyond choosing beginner/intermediate/advanced program)
- No training day selection (which days of the week to train)
- No personalized exercise filtering or emphasis based on user goals
- Programs are one-size-fits-all once selected

---

## 2. What Welmi Does (Competitor Analysis)

### 2a. Training Type Selection
- Screen: "Choose your training type"
- Two options with visual cards:
  - **Fitness** (bodyweight at home) -- marked as "recommended"
  - **Walking** (alternate fast/slow walking)
- Can be changed later in settings
- **Our equivalent**: We already have this split -- calisthenics workouts vs cardio sessions (running/walking/cycling). Our cardio is more sophisticated with GPS tracking

### 2b. Muscle Focus Areas
- Screen: "What areas do you want to focus on?"
- Shows a human body illustration with selectable regions:
  - Pecho (Chest)
  - Brazos (Arms)
  - Abs
  - Espalda (Back)
  - Piernas (Legs)
- **Single-select** (only one area at a time)
- Visual feedback: selected area highlights on the body diagram
- Affects which exercises appear more frequently in generated workouts
- **Our equivalent**: Nothing. Our programs have fixed push/pull/legs/full split days with no user preference input

### 2c. Intensity Level
- Screen: "What intensity level works best for you?"
- Slider with 3 levels:
  - **Basic** -- emoji: relaxed face, "Light exercises to start"
  - **Moderate** -- emoji: focused face, "Balanced between effort and recovery"
  - **High** -- emoji: fire, "Maximum challenge"
- Affects exercise selection, volume (sets/reps), and rest times
- **Our equivalent**: We have `difficulty` on exercises and programs but no user-facing intensity preference that modifies the workout

### 2d. Training Day Scheduling
- Screen: "What days do you want to train?"
- Day-of-week picker: Mon through Sun with checkboxes
- Shows "Today" badge on current day
- Validation message: "3-5 days: perfect balance for results without burnout"
- Affects which days show workouts vs rest
- **Our equivalent**: We have `weekly_goal` (1-7) and `workout_reminders.days_of_week`, but these don't affect which days have assigned workouts in the program. The program always prescribes Mon-Fri regardless

---

## 3. Proposed Features

### 3a. Muscle Group Focus Preference

**Decision: Multi-select (up to 2-3 focus areas), not single-select like Welmi.**

Rationale: Welmi's single-select makes sense for isolation-style fitness apps, but calisthenics is inherently compound and full-body. A push-up works chest, shoulders, and triceps simultaneously. Limiting to one focus area would either be dishonest (still training everything) or lead to a bad program (skipping essential movement patterns).

**Proposed muscle group taxonomy (user-facing):**

| Focus Area | Maps To (categories/muscles) | Icon |
|------------|------------------------------|------|
| Upper Push (Chest + Shoulders + Triceps) | push category exercises, "pecho", "hombros", "deltoides", "triceps" | Chest/shoulder icon |
| Upper Pull (Back + Biceps) | pull category exercises, "dorsal", "biceps", "romboides", "trapecio" | Back/lats icon |
| Core & Abs | core category, "core", "oblicuos", "TvA" | Abs icon |
| Legs & Glutes | legs category, "cuadriceps", "gluteos", "isquios", "pantorrillas" | Legs icon |
| Skills & Balance | skill category, handstand/planche/lever exercises | Star/balance icon |

**How focus affects workouts:**
- Focus areas get **+1 set per exercise** and/or **+1 exercise** in their category per workout day
- Non-focus areas still appear (calisthenics demands balanced training) but at baseline volume
- On "full body" days, focus area exercises are placed first (fresher = more effort)
- Priority field on focus-area exercises is boosted to `high`

**Our Advantage -- Key Marketing Message:**
> "In calisthenics, every exercise is a full-body event. 'Focus' means we turn up the volume on your priority areas while keeping everything else strong. No muscle left behind."

### 3b. Intensity Preference

**Three tiers affecting exercise selection and volume:**

| Level | Sets Multiplier | Rep Range | Rest | Exercise Pool | Phase Progression Speed |
|-------|----------------|-----------|------|---------------|------------------------|
| **Foundational** | 0.8x (fewer sets) | Lower end of ranges | +15s | Beginner + some intermediate | Slower (extra week per phase) |
| **Balanced** | 1.0x (default) | Mid ranges | Default | Beginner + intermediate | Normal |
| **Intense** | 1.2x (more sets) | Upper end of ranges | -15s | Intermediate + advanced | Faster (skip 1 week per phase if strong) |

Implementation: Intensity is applied as a modifier on top of the base program, not as separate programs. This avoids tripling the content creation burden.

### 3c. Training Day Scheduling

**User selects which days of the week they want to train (checkboxes, Mon-Sun).**

Rules:
- Minimum 2 days, maximum 6 days (1 rest day required)
- Validation messages:
  - 2 days: "Good for maintenance. We'll pick full-body workouts."
  - 3-4 days: "Great balance of training and recovery."
  - 5 days: "Serious commitment! We'll include active recovery."
  - 6 days: "Advanced schedule. Make sure you're sleeping well."
- Non-selected days are marked as rest days
- Selected days get workouts assigned from the program in a smart rotation:
  - If 3 days selected: push, pull, legs (rotating)
  - If 4 days: push, pull, legs, full
  - If 5 days: push, pull, lumbar, legs, full (current default)
  - If 6 days: push, pull, core, legs, full, skill
  - If 2 days: full, full (different exercises each day)

**Integration with existing workout_reminders:**
- When user sets training days, auto-create/update workout_reminders for those days
- Existing reminder time preferences are preserved

### 3d. Program Generation with Focus Areas

When a user has focus preferences set, the program exercises are modified at read time (not stored differently):

1. **Load base program** as normal from `program_exercises`
2. **Apply focus modifier**: for exercises matching focus areas, boost sets/priority
3. **Apply intensity modifier**: adjust sets multiplier, rest times
4. **Apply day schedule**: map workout types to selected days
5. **Cache modified program** in memory (already done in `usePrograms` hook)

This is a **read-time transformation**, not a separate program. The base program stays clean, and personalization is a layer on top. This means:
- Program creators (admin/editors) don't need to create variants
- Users can change preferences and immediately see updated workouts
- No data duplication

---

## 4. Data Model Additions

### New Collection: `user_training_preferences`

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | text (PK) | yes | auto | |
| user | relation -> users | yes | | One per user (unique index) |
| focus_areas | json | no | `[]` | Array of strings: `["upper_push", "core"]`. Max 3. |
| intensity | select | no | `"balanced"` | `"foundational"`, `"balanced"`, `"intense"` |
| training_days | json | no | `[1,2,3,4,5]` | Array of ISO day numbers (1=Mon, 7=Sun) |
| onboarding_completed | bool | no | false | True after user completes preference wizard |
| created | auto | | | |
| updated | auto | | | |

**API Rules:**
- List/View: `user = @request.auth.id`
- Create: `@request.auth.id != "" && @request.body.user = @request.auth.id`
- Update: `user = @request.auth.id`
- Delete: `user = @request.auth.id`

**Index:** `CREATE UNIQUE INDEX idx_training_prefs_user ON user_training_preferences (user)`

### Modifications to Existing Collections

**`exercises_catalog`** -- add structured muscle tags:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| muscle_tags | json | no | Array of normalized tags: `["chest", "shoulders", "triceps"]` |

This supplements the free-text `muscles` field. The free-text stays for display; `muscle_tags` is for filtering/matching. Populated via migration that parses existing `muscles` strings.

### Normalized Muscle Tag Vocabulary

```
upper_push: chest, shoulders, triceps, deltoids
upper_pull: lats, biceps, rhomboids, traps, rear_delts
core: abs, obliques, transverse_abs, hip_flexors
legs: quads, glutes, hamstrings, calves, adductors
lumbar: lower_back, erectors, spine
skill: balance, handstand, planche, lever, flexibility
```

---

## 5. Integration with Existing Systems

### Onboarding Flow
- New users see the preference wizard after signup (3 screens: focus, intensity, days)
- Existing users see a prompt on the dashboard: "Personalize your training" (dismissable)
- Accessible from Settings at any time to change

### WorkoutContext / usePrograms Hook
- `usePrograms` hook gains access to `user_training_preferences`
- New function `applyPreferences(workout, prefs)` transforms base workout:
  - Reorder exercises (focus areas first)
  - Adjust sets/reps based on intensity
  - Filter to selected training days
- `getWorkout()` calls `applyPreferences()` before returning

### Dashboard Changes
- WeekPlanWidget shows only selected training days as active
- Rest days are visually dimmed
- Focus areas shown as badges: "Focus: Upper Push, Core"

### Program Selector
- Program difficulty badge gets context: "This program at your intensity level"
- No change to program selection flow itself

### Exercise Progressions
- Focus area exercises progress faster (require fewer `sessions_at_target` since they're trained with more volume)
- Non-focus exercises keep normal progression speed

---

## 6. Priority Assessment & Effort Estimates

### Feature Breakdown

| Feature | Priority | Effort | Value | Notes |
|---------|----------|--------|-------|-------|
| Training day scheduling | P1 | **S** | High | Simple UI + small data model. Solves a real pain point (not everyone trains Mon-Fri). Most of the plumbing exists in `workout_reminders.days_of_week` |
| Intensity preference | P2 | **M** | High | Modifier logic in usePrograms + new collection + onboarding UI. High perceived value ("the app adapts to me") |
| Muscle group focus | P3 | **M** | Medium | Needs muscle_tags migration + matching logic + focus UI. Calisthenics users care less about isolation than gym users, but it's a strong differentiator vs other calisthenics apps |
| Onboarding wizard | P2 | **S** | High | 3-screen flow. Drives engagement and makes the app feel personalized from day 1. Ship alongside whichever preference feature lands first |
| muscle_tags migration | P3 | **S** | Foundation | Parse existing `muscles` strings into normalized tags. One-time migration + script |
| Preference-aware program gen | P2 | **L** | High | The `applyPreferences()` transformation layer. This is the engine that makes all preferences useful. Complex but contained in one hook |

### Recommended Rollout Order

1. **Phase A (1-2 days):** Training day scheduling + onboarding screen 1
   - New `user_training_preferences` collection (migration)
   - Day picker UI in Settings + onboarding
   - WeekPlanWidget respects selected days
   - This alone is a meaningful improvement

2. **Phase B (3-4 days):** Intensity preference + modifier engine
   - Intensity picker UI (slider)
   - `applyPreferences()` in usePrograms that modifies sets/reps/rest
   - Settings page section

3. **Phase C (3-5 days):** Muscle focus areas
   - `muscle_tags` migration on exercises_catalog
   - Focus area multi-select UI with body illustration
   - Matching logic: focus tags -> exercise boosting
   - Dashboard badges showing current focus

### Total Estimated Effort: **M-L** (7-11 dev days across all phases)

---

## 7. Open Questions

1. **Body illustration for focus areas**: Build custom SVG or use a library? Custom SVG is more on-brand but takes design time. Could start with icon-based chips and add illustration later.

2. **Should intensity affect cardio too?** E.g., foundational = shorter target distance, intense = longer. The cardio system already has `targetDistanceKm` and `targetDurationMin` in `program_day_config`.

3. **Backward compatibility**: Users who never set preferences should see exactly the same program as today. The `applyPreferences()` function must be a no-op when preferences are empty/default.

4. **Multi-program interaction**: If a user switches programs, should preferences carry over? Yes -- preferences are user-level, not program-level. The `user_training_preferences` collection is independent of `user_programs`.

5. **Analytics events**: Track preference selections for product insights. See `docs/business/08-analytics-events.md` for event naming conventions.
