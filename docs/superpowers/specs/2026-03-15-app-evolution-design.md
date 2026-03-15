# Calistenia App Evolution — Design Spec

**Date:** 2026-03-15
**Scope:** TypeScript migration + 3 major feature areas (Program Customization, AI Nutrition, Exercise Media) + complementary improvements

---

## 1. TypeScript Migration

### Strategy: Incremental migration (not big-bang rewrite)

Rename files `.jsx` → `.tsx` / `.js` → `.ts` progressively, starting from leaf modules (utilities, types) up to components and pages.

### Steps

1. **Setup:** Add `tsconfig.json`, install TypeScript + `@types/react`, configure Vite for TS
2. **Define core types first:** Create `src/types/` with interfaces for all data models (Exercise, Program, Phase, Session, SetLog, LumbarCheck, User, NutritionEntry, etc.)
3. **Migrate leaf modules:** `src/lib/pocketbase.ts`, `src/lib/sounds.ts`, `src/lib/notifications.ts`
4. **Migrate data:** `src/data/workouts.ts` with typed exercise/phase structures
5. **Migrate hooks:** `src/hooks/useAuth.ts`, `useProgress.ts`, `usePrograms.ts`, `useWorkDay.ts`
6. **Migrate components:** Bottom-up from small (Timer, Badge) to large (SessionView, WorkoutPage)
7. **Migrate pages:** Last, since they compose everything else
8. **Strict mode:** Enable `strict: true` once fully migrated

### Key Types to Define

```typescript
interface Exercise {
  id: string
  name: string
  sets: number
  reps: string
  rest: number
  muscles: string
  note?: string
  youtube?: string
  priority: 'high' | 'med' | 'low'
  isTimer?: boolean
  timerSeconds?: number
  media?: ExerciseMedia[]
}

interface ExerciseMedia {
  id: string
  type: 'image' | 'video'
  url: string
  uploadedBy: string
  caption?: string
}

interface Program {
  id: string
  name: string
  description?: string
  durationWeeks: number
  isActive: boolean
  isPublic: boolean
  createdBy: string
  phases: Phase[]
}

interface Phase {
  phaseNumber: 1 | 2 | 3 | 4
  name: string
  weeks: string
  color: string
  bgColor: string
  days: WorkoutDay[]
}

interface WorkoutDay {
  dayId: string
  dayName: string
  dayFocus: string
  dayType: string
  dayColor: string
  exercises: Exercise[]
}

interface NutritionEntry {
  id: string
  user: string
  photoUrl?: string
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  foods: FoodItem[]
  totalCalories: number
  totalProtein: number
  totalCarbs: number
  totalFat: number
  loggedAt: string
  aiModel?: string
}

interface FoodItem {
  name: string
  portion: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

interface NutritionGoal {
  userId: string
  dailyCalories: number
  dailyProtein: number
  dailyCarbs: number
  dailyFat: number
  goal: 'muscle_gain' | 'fat_loss' | 'recomp' | 'maintain'
}

interface UserProfile {
  id: string
  email: string
  displayName?: string
  weight?: number
  height?: number
  level: 'beginner' | 'intermediate' | 'advanced'
  goal?: string
  tier: 'free' | 'pro'
  avatarUrl?: string
}
```

---

## 2. Program Customization

### 2A. Create Programs from Scratch

**UI:** New page/modal wizard with steps:
1. Program info (name, description, duration in weeks)
2. Define phases (1-4, each with name, week range, color)
3. For each phase → define days (workout focus per day of the week)
4. For each day → add exercises from library or create custom ones

**Data flow:**
- New PocketBase collections: reuse existing `programs`, `program_phases`, `program_exercises`
- Add `created_by` field to `programs` to distinguish user-created vs system programs
- API rules: users can CRUD their own programs

### 2B. Modify Existing Programs

**UI:** "Duplicar y editar" button on any program
- Creates a copy of the program under the user's ownership
- Opens the same editor wizard with pre-filled data
- Per-exercise: swap, change sets/reps/rest, reorder, remove

### 2C. Exercise Library

**New concept:** A shared exercise catalog that programs reference

- PocketBase collection `exercises_catalog` with: name, description, muscles, default media, youtube, category (push/pull/legs/core/mobility)
- Users pick from catalog when building programs, or create custom exercises
- Custom exercises can optionally be shared to the catalog (future)

### Architecture Decision

Programs live fully in PocketBase (not hardcoded). The current `data/workouts.js` becomes a **seed script** that populates PocketBase on first setup, then is no longer used at runtime.

---

## 3. AI Nutrition Tracking

### Architecture

```
[Photo] → [Vercel AI SDK] → [Model by tier] → [Structured JSON] → [PocketBase]
                                                      ↓
                                              NutritionEntry saved
```

**Backend requirement:** A small API route (can be a Vercel serverless function, Cloudflare Worker, or Node/Express endpoint) that:
1. Receives the image
2. Calls Vercel AI SDK with the appropriate model based on user tier
3. Returns structured nutrition data

**Why a backend?** API keys cannot be exposed client-side. PocketBase alone can't call external AI APIs.

### Tier → Model Mapping

| Tier | Model | Use case |
|------|-------|----------|
| free | `claude-haiku-4-5` or `gemini-flash` | Basic calorie estimation |
| pro | `claude-sonnet-4-6` or `gpt-4o` | Detailed macros + suggestions |

### Features

**Meal Logging:**
- Camera/gallery → upload photo → AI analysis → confirm/edit results → save
- Manual entry option (no photo)
- Meal type selector (desayuno, almuerzo, cena, snack)

**Daily Dashboard:**
- Calories consumed vs goal (circular progress)
- Macro breakdown (protein/carbs/fat bars)
- Meal timeline for the day
- Weekly average view

**Nutrition Goals:**
- Setup wizard: weight, height, activity level, goal (muscle gain/fat loss/recomp/maintain)
- Auto-calculate recommended macros using standard formulas (Mifflin-St Jeor + activity multiplier)
- Manual override option

**Meal Suggestions (future iteration):**
- Based on remaining macros for the day
- Simple suggestions, not full recipes (e.g., "Te faltan 40g de proteína: pollo 150g, o 3 huevos, o batido de whey")

### PocketBase Collections

**`nutrition_entries`:**
- `user` (relation)
- `photo` (file, PocketBase file storage)
- `meal_type` (select: breakfast/lunch/dinner/snack)
- `foods` (JSON array of FoodItem)
- `total_calories`, `total_protein`, `total_carbs`, `total_fat` (numbers)
- `ai_model` (string, which model analyzed it)
- `logged_at` (datetime)

**`nutrition_goals`:**
- `user` (relation, unique)
- `daily_calories`, `daily_protein`, `daily_carbs`, `daily_fat` (numbers)
- `goal` (select: muscle_gain/fat_loss/recomp/maintain)
- `weight`, `height`, `activity_level` (for recalculation)

---

## 4. Exercise Media

### Storage

Use PocketBase's built-in file storage. Each exercise in `program_exercises` gets a `media` file field (multiple files allowed).

### PocketBase Changes

Add to `program_exercises`:
- `demo_images` (file field, multiple, max 3, image types only)
- `demo_video` (file field, single, video types, max 50MB)

### UI

**In ExerciseCard:**
- Thumbnail preview of first image (if exists)
- Tap to open media viewer modal

**Media Viewer Modal:**
- Image carousel (swipeable on mobile)
- Video player (native HTML5)
- YouTube embed (existing feature)
- All three sources in tabs: "Demo" | "YouTube"

**In Program Editor (new):**
- Upload images/video per exercise via drag-and-drop or file picker
- Preview before saving
- Delete/replace existing media

---

## 5. Complementary Improvements

### 5A. Progression System

- New collection `exercise_progressions` linking exercises in order (easier → harder)
- UI shows "progression path" per exercise
- After N sessions at target reps, suggest moving to next progression

### 5B. Enhanced User Profile

- Add fields to PocketBase `users`: weight, height, level, goal, avatar
- Profile settings page
- Used for nutrition goal calculations

### 5C. Improved Progress Page

- Line charts for exercise progression over time (lightweight chart lib like recharts or chart.js)
- Weight tracking with graph
- Body photos timeline (optional)
- Weekly/monthly summaries

### 5D. PWA Enhancements

- Service worker for offline caching
- Web app manifest for installability
- Better offline fallback UI

---

## 6. New Project Structure (Post-Migration)

```
src/
├── types/                    # TypeScript interfaces & types
│   ├── exercise.ts
│   ├── program.ts
│   ├── nutrition.ts
│   ├── user.ts
│   └── index.ts
├── lib/                      # Utilities
│   ├── pocketbase.ts
│   ├── sounds.ts
│   ├── notifications.ts
│   └── ai/
│       └── nutrition-analyzer.ts   # Vercel AI SDK client
├── hooks/                    # React hooks
│   ├── useAuth.ts
│   ├── useProgress.ts
│   ├── usePrograms.ts
│   ├── useWorkDay.ts
│   ├── useNutrition.ts       # NEW
│   └── useProgramEditor.ts   # NEW
├── components/
│   ├── ui/                   # Radix/shadcn primitives
│   ├── workout/              # Workout-related components
│   │   ├── ExerciseCard.tsx
│   │   ├── SessionView.tsx
│   │   ├── RestTimer.tsx
│   │   ├── Timer.tsx
│   │   └── MediaViewer.tsx   # NEW
│   ├── nutrition/            # NEW
│   │   ├── MealLogger.tsx
│   │   ├── NutritionDashboard.tsx
│   │   ├── MacroBar.tsx
│   │   └── MealSuggestions.tsx
│   ├── programs/             # NEW
│   │   ├── ProgramEditor.tsx
│   │   ├── PhaseEditor.tsx
│   │   ├── DayEditor.tsx
│   │   ├── ExercisePicker.tsx
│   │   └── ExerciseLibrary.tsx
│   ├── progress/             # Reorganized
│   │   ├── Charts.tsx
│   │   ├── WeightTracker.tsx
│   │   └── BodyPhotos.tsx
│   └── layout/
│       ├── Sidebar.tsx
│       └── Navigation.tsx
├── pages/
│   ├── DashboardPage.tsx
│   ├── WorkoutPage.tsx
│   ├── LumbarPage.tsx
│   ├── ProgressPage.tsx
│   ├── NutritionPage.tsx     # NEW
│   ├── ProgramEditorPage.tsx # NEW
│   ├── ProfilePage.tsx       # NEW
│   └── AuthPage.tsx
├── data/
│   └── seed.ts               # Seed script for default program
├── api/                      # Backend routes (if using Vercel/serverless)
│   └── analyze-meal.ts
└── App.tsx
```

---

## 7. Implementation Order

### Fase 0: TypeScript Migration (fundación)
### Fase 1: Exercise Media + Program Customization (lo que piden los usuarios)
### Fase 2: AI Nutrition (feature diferenciador)
### Fase 3: Progression System + Progress Improvements (valor a largo plazo)
### Fase 4: PWA + Polish (calidad de producto)

Each phase is independently deployable and valuable.
