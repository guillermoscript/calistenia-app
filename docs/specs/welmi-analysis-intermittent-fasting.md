# Welmi Competitive Analysis: Intermittent Fasting

## Current State

### What We Have
- **Meal reminders** (`meal_reminders` collection): per-meal notifications with meal_type, hour, minute, days_of_week, enabled
- **Workout reminders** (`workout_reminders` collection): similar shape + `reminder_type` field
- **Reminder scheduler** (`src/lib/reminder-scheduler.ts`): fires notifications via setTimeout + service worker, with 30s periodic safety net
- **Reminders UI** (`src/pages/RemindersPage.tsx`): unified timeline of all reminders
- **Nutrition tracking** (`nutrition_entries` collection): foods, calories, macros, photos, logged_at
- **Nutrition dashboard** (`NutritionDashboard.tsx`): calorie gauge + macro bars + meal timeline
- **No concept of time windows or ranges** — each reminder is independent, no fasting state anywhere

### What Welmi Does
1. **Educational splash**: "Fasting can help you lose weight up to 30% faster" with science backing badge
2. **Plan selection**: 4 options with clear naming:
   - 8:16 — "Inicio facil" (easy start)
   - 10:14 — "Principiante" (beginner), marked "Recomendado"
   - 12:12 — "Principiante+" (selected in screenshot)
   - 14:10 — "Intermedio", marked "Resultado mas rapido"
3. **Clock configuration**: Beautiful circular 24h clock with:
   - Blue arc showing fasting window
   - Draggable handles for start/end
   - "Ultima comida: 8:00 p.m." / "Primera comida: 8:00 a.m."
   - "Auto" toggle for automatic calculation
4. **Dashboard widget**: "Ventana de alimentacion" section showing:
   - Plan label (Plan: 12/12)
   - Live countdown timer (1:52:33)
   - Progress bar (green gradient showing current position in fasting/eating window)

## Analysis: Option A vs Option B

### Option A: Enhance Existing Reminders
- Add fasting window concept on top of meal reminders
- Pro: Less new code
- Con: Reminders are a notification scheduler, not a state tracker. Fasting needs real-time awareness ("am I fasting or eating right now?"). Fundamentally different concern.
- **Not recommended**

### Option B: Dedicated Fasting Tracker (Recommended)
- Fasting is a distinct health domain like sleep/cardio
- Needs its own state machine (fasting → eating → fasting)
- Dashboard widget with live countdown
- Can still trigger reminders as a side effect
- **Recommended** — cleaner architecture, better UX

## Proposed Implementation

### Data Model

**New `fasting_settings` collection:**

| Field | Type | Description |
|-------|------|-------------|
| `user` | Relation → users | Owner |
| `enabled` | Bool | Is fasting tracking active? |
| `plan` | Text | `"8:16"`, `"10:14"`, `"12:12"`, `"14:10"`, `"custom"` |
| `fasting_hours` | Number | Hours of fasting window |
| `eating_hours` | Number | Hours of eating window |
| `last_meal_time` | Text | HH:mm format, e.g., "20:00" |
| `first_meal_time` | Text | HH:mm format, e.g., "08:00" |
| `auto_calculate` | Bool | Auto-derive first_meal from last_meal + fasting_hours |

**Optional: `fasting_log` collection (Phase 2):**

| Field | Type | Description |
|-------|------|-------------|
| `user` | Relation → users | Owner |
| `date` | Date | Day |
| `started_at` | DateTime | When fasting began |
| `ended_at` | DateTime | When eating window opened |
| `completed` | Bool | Did user complete the full fasting window? |

### UI Components

**1. Onboarding Step (optional)**
- Simple yes/no: "Do you practice intermittent fasting?"
- If yes → plan picker (4 preset options + custom)
- If no → skip entirely
- No educational splash needed (keep it compact, unlike Welmi's 3 screens for this)

**2. Fasting Settings Page**
- Plan selector (radio cards like Welmi's)
- Time configuration: last meal time picker → auto-calculates first meal
- Enable/disable toggle

**3. Dashboard Widget — `FastingDashboardWidget.tsx`**
- Fits naturally into the "Today's snapshot" grid in `DashboardPage.tsx` (line ~424)
- Follows existing `Card` + `CardContent` + left accent border pattern
- Shows:
  - Current state: "Ayunando" / "Ventana de alimentacion"
  - Countdown to next transition
  - Simple progress bar (not the complex clock — save that for settings)
  - Plan label (e.g., 12:12)

**4. Clock UI (Phase 2)**
- Circular 24h visualization for the settings page
- Not critical for V1 — a simpler time picker works fine initially

### State Logic — `useFasting()` hook

```typescript
function useFasting() {
  const settings = useFastingSettings(); // from PocketBase
  const now = new Date();

  // Derive current state from settings + current time
  const lastMeal = parseTime(settings.last_meal_time);
  const firstMeal = parseTime(settings.first_meal_time);

  const isFasting = isInFastingWindow(now, lastMeal, firstMeal);
  const nextTransition = getNextTransition(now, lastMeal, firstMeal);
  const countdown = nextTransition - now;
  const progress = getProgress(now, lastMeal, firstMeal, isFasting);

  return { isFasting, countdown, progress, plan: settings.plan };
}
```

Key insight: **No need to "start/stop" fasting sessions.** The state is derived from settings + current time. Phase 2 can add manual logging if users want to track adherence.

## What They Do Well vs What We Do Better

| Aspect | Welmi | Us (Proposed) |
|--------|-------|---------------|
| Onboarding | 3 screens (education + plan + clock) | 1 optional step (yes/no + plan picker) |
| Clock UI | Beautiful circular clock with draggable handles | V1: simple time picker. V2: clock |
| Dashboard | Live countdown + progress bar | Same, matching our existing widget style |
| Plan options | 4 presets | 4 presets + custom |
| State tracking | Unknown (likely similar derived approach) | Derived from settings, no manual start/stop |
| Logging/history | Unknown | Phase 2: daily adherence log |

## Priority & Effort

- **Priority**: Medium — nice engagement feature, complements nutrition tracking
- **Effort**: **S-M** (2-3 days for V1)
  - Migration: 0.5h
  - `useFasting()` hook + state logic: 3h
  - Dashboard widget: 3h
  - Settings page: 4h
  - Onboarding integration: 2h
  - Testing: 2h
- **Phase 2** (clock UI + adherence logging): M (~3 more days)
- **Dependencies**: None — can be built independently
