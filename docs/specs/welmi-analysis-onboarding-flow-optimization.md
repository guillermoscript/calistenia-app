# Onboarding Flow Optimization -- Welmi Competitive Analysis

**Date:** 2026-03-31
**Priority:** HIGH (entry point for all new users)
**Effort:** L (new screens, new DB fields, new components, touches auth + profile + program selection)
**Status:** Shipped 2026-04-17 — all three phases on main (commits 674ff86..840b3b0)

---

## 1. Current Onboarding Flow (Calistenia App)

### Authentication (AuthPage.tsx)

| Step | Screen | Data Captured |
|------|--------|---------------|
| 0 | Auth page | Email + password + display name (signup) OR Google OAuth |

Signup captures only: `email`, `password`, `display_name`. Google OAuth captures whatever Google provides (email, name, avatar).

### Post-Auth Onboarding (OnboardingFlow.tsx)

The onboarding is shown as a full-screen takeover after login if `localStorage` flag `calistenia_onboarding_done_{userId}` is not set. It has 3-4 steps depending on whether profile data is missing:

| Step | Screen | Data Captured | Skippable? |
|------|--------|---------------|------------|
| 0 | **Welcome** | None (explains app flow: Program > Day > Exercises > Progress) | Entire onboarding skippable via "Skip all" |
| 1 | **About You** (conditional -- only if `!user.weight && !user.height && !user.level`) | Weight (kg), Height (cm), Age, Sex (M/F), Level (beginner/intermediate/advanced), Goal (free text) | Yes ("Skip for now") |
| 2 | **Choose Program** | Selects an existing program (or navigates to create one) | No (Continue disabled without selection, but can create own) |
| 3 | **Quick Orientation** | None (explains daily routine + extras: nutrition, cardio, social) | Can go back to program selection |

**Key observations:**
- Step 1 (About You) is already compact -- it captures 6 data points in one form (weight, height, age, sex, level, goal). This is good.
- Step 1 only appears if Google OAuth was used (email signup doesn't pre-populate profile fields, but the condition checks `!weight && !height && !level` which is true for all new users).
- Profile data is saved to the PocketBase `users` collection fields: `weight`, `height`, `level`, `goal`. The `age` and `sex` fields are saved in `handleSaveProfile` but **no migration exists** adding those columns to the users table -- this is likely a silent failure in production.
- The onboarding state is stored in `localStorage` only -- clearing browser data re-triggers it.
- Program selection is mandatory to proceed but there's a "create your own" escape hatch.

### User Record Fields (from migrations)

Currently on the `users` collection:
- `display_name` (text) -- migration 1773243332
- `weight` (number) -- migration 1774000009
- `height` (number) -- migration 1774000009
- `level` (text) -- migration 1774000009
- `goal` (text) -- migration 1774000009
- `avatar` (file) -- migration 1774000040
- `referral_code` (text) -- migration 1774000048
- `role` (text) -- migration 1774000013
- `tier` (text) -- migration 1774000013
- `timezone` (text) -- migration 1774000070

**Missing fields** that the onboarding UI tries to save: `age` (number), `sex` (text). These writes silently fail or are ignored by PocketBase.

### Profile Page (ProfilePage.tsx)

The profile page allows editing: `display_name`, `weight`, `height`, `level`, `goal`, `avatar`, `timezone`, `language`. It does NOT expose `age` or `sex` editing.

---

## 2. Welmi's Onboarding Flow (from competitive analysis)

Welmi uses a ~20-step wizard where each screen captures ONE data point with a polished, focused UI:

| Step | Screen | Data Captured | Input Type |
|------|--------|---------------|------------|
| 1 | Age | Age | Scroll picker |
| 2 | Height | Height | Vertical ruler slider |
| 3 | Weight | Current weight (0.1kg precision) | Horizontal ruler slider |
| 4 | Activity Level | Sedentary / Lightly active / Active / Very active | 4-option select |
| 5 | Medical Conditions | Multi-select from predefined list | Multi-select chips |
| 6 | Health Disclaimer | Acknowledgment | Info screen |
| 7 | Fasting Education | What is intermittent fasting | Splash/info |
| 8 | Fasting Plan Selection | Which fasting window (16:8, 18:6, etc.) | Option cards |
| 9 | Fasting Clock Config | Start/end times for fasting window | Time pickers |
| 10 | Goal Weight | Target weight + BMI suggestion | Ruler slider + BMI display |
| 11 | Body Scan Splash | Marketing for body composition | Info screen |
| 12 | Pace Slider | How fast to reach goal (conservative to aggressive) | Slider |
| 13 | First Check-in | Schedule first body check-in | Date picker |
| 14 | Training Type | Calisthenics / Weights / Cardio / Mixed | Option cards |
| 15 | Muscle Focus Areas | Upper body / Core / Lower body / Full body | Multi-select |
| 16 | Injuries | Current injuries or limitations | Multi-select + free text |
| 17 | Intensity Level | Light / Moderate / Intense | 3-option select |
| 18 | Training Days | Which days of the week | Day selector (M-Su) |
| 19 | "Personalizing..." | Fake loading with progress messages | Loading animation |
| 20 | Progress Timeline | Projected milestones and timeline | Preview screen |
| 21 | Main Dashboard | -- | App start |

**Key observations:**
- 20 screens is excessive. At least 4 are pure info/marketing (steps 6, 7, 11, 19).
- The one-data-point-per-screen approach maximizes perceived progress but wastes time.
- However, Welmi captures several data points we completely lack: activity level, medical conditions, injuries, goal weight, pace preference, muscle focus areas, training days, intensity level.
- The "personalizing" loading screen + progress timeline is a powerful engagement hook -- it validates the user's effort and builds anticipation.

---

## 3. Comparison: What We Capture vs. What Welmi Captures

| Data Point | Calistenia App | Welmi | Gap Analysis |
|------------|---------------|-------|--------------|
| Email/password | Yes | Yes | -- |
| Display name | Yes | No | We're ahead |
| Age | UI exists, **DB field missing** | Yes | Bug: need migration |
| Height | Yes | Yes | -- |
| Weight (current) | Yes | Yes | -- |
| Sex/Gender | UI exists, **DB field missing** | No | Bug: need migration |
| Activity level | No | Yes (4 options) | **Gap: useful for calorie calc** |
| Medical conditions | No | Yes (multi-select) | **Gap: safety/liability** |
| Health disclaimer | No | Yes | **Gap: legal protection** |
| Fasting preference | No | Yes (plan + clock) | Gap: we have nutrition but no fasting |
| Goal weight | No | Yes (with BMI) | **Gap: useful for progress tracking** |
| Pace preference | No | Yes (slider) | Nice to have |
| Body scan | No | Yes (marketing) | Skip -- we have phase photos |
| Training type | Implicit (calisthenics) | Yes | Not needed (we're calisthenics-specific) |
| Muscle focus areas | No | Yes (multi-select) | **Gap: useful for program recommendation** |
| Injuries/limitations | No | Yes (multi-select) | **Gap: safety, exercise filtering** |
| Intensity level | Via "level" (beginner/etc) | Yes (separate) | Partially covered |
| Training days | No | Yes (day picker) | **Gap: useful for schedule** |
| Skill level | Yes (3 levels) | No | We're ahead |
| Goal (free text) | Yes | No | We're ahead (but unstructured) |
| Program selection | Yes | Auto-generated | Different approach |
| "Personalizing" effect | No | Yes | **Gap: engagement hook** |
| Progress timeline | No | Yes | **Gap: motivation** |

### Critical Gaps to Fill
1. **Activity level** -- needed for accurate calorie/nutrition calculations
2. **Goal weight** -- needed for progress tracking and meal plan calibration
3. **Medical conditions + injuries** -- safety, liability, exercise filtering
4. **Training days** -- schedule personalization
5. **Muscle focus areas** -- better program recommendations
6. **"Personalizing" moment** -- engagement and perceived value
7. **age/sex DB migrations** -- existing UI writes to non-existent fields

---

## 4. Proposed Optimized Onboarding Flow

**Design principle:** Compact but not overwhelming. 3-4 data points per screen. Progressive disclosure. Every screen is skippable. Total: 6 screens (vs current 4, vs Welmi's 20).

### Screen 0: Welcome (keep existing, minor tweaks)
- Keep the current welcome screen with app flow visualization
- Add a progress bar showing "Step 1 of 6"
- Remove "Skip all" -- replace with per-screen skip links
- **Data captured:** None

### Screen 1: Basics (compact form)
- **Layout:** Single card with inline fields
- **Fields:**
  - Age (number input, placeholder "28")
  - Height (number input, "175 cm")
  - Weight (number input with 0.1 step, "75.0 kg")
  - Sex (2-button toggle: Male / Female / Prefer not to say)
- **Why compact:** These are straightforward demographic fields users can fill in 10 seconds. No need for individual screens.
- **Skip:** "Skip for now" link at bottom
- **Data captured:** `age`, `height`, `weight`, `sex`
- **Note:** This is very close to the current "About You" step but drops `level` and `goal` (moved to later screens).

### Screen 2: Goals & Activity
- **Layout:** Card with structured options
- **Fields:**
  - Goal weight (number input with current weight shown for reference + calculated BMI badge)
  - Activity level (4 illustrated option cards: Sedentary / Lightly Active / Active / Very Active)
  - Pace preference (simple 3-option: Gradual / Balanced / Aggressive -- with weekly weight change estimate)
- **Why together:** All goal-related. Understanding the destination and current lifestyle in one view.
- **Skip:** "Skip for now" (defaults to no goal weight, moderate activity, balanced pace)
- **Data captured:** `goal_weight`, `activity_level`, `pace`
- **New DB fields needed:** `goal_weight` (number), `activity_level` (text: sedentary|light|active|very_active), `pace` (text: gradual|balanced|aggressive)

### Screen 3: Health & Safety
- **Layout:** Card with checklist + prominent "No issues" shortcut
- **Fields:**
  - Large "I have no conditions or injuries" button at top (one-tap skip for the majority)
  - Medical conditions (multi-select chips: Heart condition, High blood pressure, Diabetes, Asthma, Joint issues, Back problems, Other)
  - Injuries (multi-select chips: Shoulder, Wrist, Elbow, Knee, Ankle, Lower back, Other + optional free text)
- **Health disclaimer:** Small text at bottom: "Consult a healthcare professional before starting any exercise program. This app does not provide medical advice."
- **Why together:** Health and injuries are conceptually related. The "No issues" shortcut means most users spend 2 seconds here.
- **Skip:** The "No issues" button IS the skip. Users with conditions spend more time, which is appropriate.
- **Data captured:** `medical_conditions` (JSON array), `injuries` (JSON array)
- **New DB fields needed:** `medical_conditions` (JSON), `injuries` (JSON)

### Screen 4: Training Preferences
- **Layout:** Card with three sections
- **Fields:**
  - Skill level (3 radio cards: Beginner / Intermediate / Advanced -- with descriptions, from current onboarding)
  - Muscle focus (multi-select chips: Full Body / Upper Body / Core / Legs / Specific: Pull-ups, Handstand, Planche, Muscle-up)
  - Training days (7-day picker: Mon-Sun, tap to toggle)
  - Preferred intensity (3-option: Light / Moderate / Intense)
- **Why together:** All training-related preferences that inform program selection.
- **Skip:** "Skip for now" (defaults to beginner, full body, no day preference, moderate)
- **Data captured:** `level`, `focus_areas` (JSON array), `training_days` (JSON array), `intensity`
- **New DB fields needed:** `focus_areas` (JSON), `training_days` (JSON), `intensity` (text: light|moderate|intense)

### Screen 5: Choose Your Program (enhanced existing)
- **Keep existing program selector** but enhance with recommendations
- **New:** Show a "Recommended for you" badge on programs that match the user's level, focus areas, and training days
- **New:** If the user selected specific skills (pull-ups, handstand), surface programs containing those progressions
- **Keep:** "Create your own" escape hatch
- **Data captured:** Program selection (existing `user_programs` record)

### Screen 6: "Personalizing Your Experience" + Timeline Preview
- **Phase 1 (2-3 seconds):** Animated loading screen with rotating messages:
  - "Analyzing your profile..."
  - "Matching exercises to your level..."
  - "Building your weekly plan..."
  - "Calculating nutrition targets..."
- **Phase 2:** Timeline preview card showing:
  - Current weight and goal weight (if provided)
  - Projected timeline based on pace
  - Phase breakdown of selected program (Phase 1: weeks 1-6, etc.)
  - First workout suggestion for today/tomorrow
- **CTA:** "Start Training" button
- **This screen replaces** the current "Quick Orientation" step (which was informational)
- **Data captured:** None (display only)

---

## 5. UX Principles

### Compact but Not Overwhelming
- Max 4 data points per screen (vs Welmi's 1 per screen)
- Related fields are grouped logically (demographics, goals, health, training)
- Each screen should take 10-30 seconds to complete

### Progressive Disclosure
- Health screen shows "No issues" as primary action -- detail fields appear secondary
- Focus areas start with broad categories, specific skills are optional
- Goal weight is optional -- some users just want to get stronger, not lose weight

### Skip-Friendly
- Every screen (except program selection) has a "Skip for now" option
- Skipping stores sensible defaults, not empty values
- Profile page should expose ALL these fields for later editing
- Skipped fields can trigger gentle in-app prompts later ("Complete your profile for better recommendations")

### Fast Path for Power Users
- A user who skips everything still gets: Welcome > Program Selection > Dashboard (2 screens of actual input)
- A user who fills everything: 6 screens, estimated 2-3 minutes total

### Mobile-First
- All inputs should be thumb-friendly (min 44px tap targets)
- Number inputs should trigger numeric keyboard
- Chip selectors should wrap naturally on narrow screens

---

## 6. Integration with Other Feature Specs

This onboarding flow becomes the connective tissue for several existing and planned features:

| Feature | How Onboarding Feeds It |
|---------|------------------------|
| **Nutrition tracking** (NutritionPage) | `activity_level` + `weight` + `goal_weight` + `age` + `sex` enables accurate TDEE/calorie calculations |
| **Program recommendations** | `level` + `focus_areas` + `training_days` + `intensity` enables smart program matching |
| **Phase photo checkpoints** (spec: 2026-03-28) | `goal_weight` creates a concrete target for photo comparison motivation |
| **Exercise filtering** | `injuries` enables hiding/flagging contraindicated exercises |
| **Sleep tracking** (spec: 2026-03-22) | `activity_level` provides baseline for sleep recommendations |
| **Social features** (spec: 2026-03-22) | Richer profiles from onboarding data make user profiles more interesting |
| **Referral growth** (spec: 2026-03-22) | Better onboarding = better retention = more referrals |
| **Weekly meal plans** | `goal_weight` + `pace` + `activity_level` directly drive calorie targets |
| **Progress timeline** | `goal_weight` + `pace` enables projected milestone calculations |

---

## 7. Technical Implementation Notes

### New DB Migrations Required

```
users collection additions:
- age (number, optional, min 13, max 120)
- sex (text, optional -- values: male, female, other)
- goal_weight (number, optional, min 0)
- activity_level (text, optional -- values: sedentary, light, active, very_active)
- pace (text, optional -- values: gradual, balanced, aggressive)
- medical_conditions (json, optional -- array of strings)
- injuries (json, optional -- array of strings)
- focus_areas (json, optional -- array of strings)
- training_days (json, optional -- array of day IDs)
- intensity (text, optional -- values: light, moderate, intense)
```

### Existing Bug Fix
The current `OnboardingFlow.tsx` saves `age` and `sex` to the user record (line 138), but no migration adds these fields. This is a **P1 bug** -- the write silently fails. The first migration should add `age` and `sex` to fix this before the full onboarding rebuild.

### Component Architecture
- Refactor `OnboardingFlow.tsx` from a single file into a folder: `src/components/onboarding/`
  - `OnboardingFlow.tsx` -- orchestrator with step state
  - `StepBasics.tsx` -- Screen 1
  - `StepGoals.tsx` -- Screen 2
  - `StepHealth.tsx` -- Screen 3
  - `StepTraining.tsx` -- Screen 4
  - `StepProgram.tsx` -- Screen 5 (extracted from current)
  - `StepPersonalizing.tsx` -- Screen 6
  - `OnboardingProgress.tsx` -- shared progress bar component

### Analytics Events
- `onboarding_step_viewed` (step_name, step_number)
- `onboarding_step_completed` (step_name, step_number, fields_filled, fields_skipped)
- `onboarding_step_skipped` (step_name, step_number)
- `onboarding_completed` (total_time_seconds, steps_skipped_count, program_selected)
- `onboarding_abandoned` (last_step_seen, time_spent)

### Profile Page Updates
All new fields must be editable from `ProfilePage.tsx`. Group them into sections:
- Body & Demographics (age, sex, height, weight)
- Goals (goal weight, activity level, pace)
- Health (medical conditions, injuries)
- Training (level, focus areas, training days, intensity)

---

## 8. Implementation Phases

### Phase A: Fix Existing Bugs (S effort, do first)
1. Add `age` and `sex` migrations to users collection
2. Verify onboarding profile save actually persists these fields
3. Expose age and sex in ProfilePage

### Phase B: New DB Fields + Enhanced Onboarding (L effort)
1. Add all new field migrations (goal_weight, activity_level, pace, medical_conditions, injuries, focus_areas, training_days, intensity)
2. Build new onboarding step components
3. Implement "Personalizing" loading + timeline preview screen
4. Update OnboardingFlow orchestrator for 6-step flow
5. Add analytics events
6. Update ProfilePage with all new fields

### Phase C: Smart Recommendations (M effort, can be parallel)
1. Use onboarding data to compute program match scores
2. Show "Recommended for you" badges in program selector
3. Use injuries data to flag exercises in workout view
4. Use activity_level + goal_weight + pace to auto-suggest nutrition goals

---

## 9. Open Questions

1. **Fasting:** Welmi has 3 screens for fasting (education, plan, clock). Do we want fasting support at all? Currently we have nutrition tracking but no fasting. Recommendation: defer fasting to a separate feature spec. In onboarding, a simple yes/no toggle + plan picker is enough if we build it.

2. **Body scan:** Welmi uses this as a marketing splash. We have phase photos which are more practical. Skip for now.

3. **Onboarding state persistence:** Currently stored in localStorage which is fragile. Should we store an `onboarding_completed_at` timestamp on the user record instead? This would survive browser data clears and work across devices.

4. **Re-onboarding:** If we add new fields later, should users who completed onboarding before those fields existed see a mini-onboarding for just the new fields? Consider a `onboarding_version` field.

5. **A/B testing:** Should we test the compact (proposed) vs. Welmi-style (one per screen) approaches? The compact approach is more respectful of user time, but the one-per-screen approach may have higher completion rates due to the sunk cost effect.
