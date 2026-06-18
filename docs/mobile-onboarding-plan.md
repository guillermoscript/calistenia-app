# Mobile Onboarding — Implementation Plan

Goal: full sign-up + onboarding parity in the Expo mobile app so a new user can
create an account and complete onboarding entirely without the web app.

## Source of truth (web)
- Sign-up: `apps/web/src/pages/AuthPage.tsx` (login/signup toggle, `displayName`).
- Onboarding orchestrator: `apps/web/src/components/onboarding/OnboardingFlow.tsx`.
- Steps: `StepWelcome`, `StepBasics`, `StepGoals`, `StepHealth`, `StepTraining`,
  `StepProgram`, `StepPersonalizing`, `OnboardingProgress`.
- Completion flag (web): `apps/web/src/components/onboarding/state.ts` →
  `localStorage["calistenia_onboarding_done_<userId>"] = "true"`.

## Data model (unchanged — all writes go to the `users` auth record)
| Step | Fields written via `pb.collection('users').update(userId, …)` |
|---|---|
| Basics | `weight`, `height`, `age`, `sex` |
| Goals | `goal_weight`, `activity_level`, `pace` |
| Health | `medical_conditions[]`, `injuries[]` |
| Training | `level`, `focus_areas[]`, `training_days[]`, `intensity`, `goal` |
| Program | (not users) → `selectProgram(programId)` writes `user_programs` |

Profile detection: `needsProfile = !user.weight && !user.height && !user.level`
→ 7 steps; else short flow (Welcome → Program → Personalizing).

## Mobile integration points (confirmed)
- Program enroll: `selectProgram(id)` from `useWorkoutActions()` (`apps/mobile/src/contexts/WorkoutContext.tsx`).
- Catalog: `useWorkoutState().programs` → `ProgramMeta[]`.
- Match: `matchUserToPrograms` from `@calistenia/core/lib/matchPrograms`.
- Types: `@calistenia/core/types/onboarding` (CONDITION_IDS, INJURY_IDS, FOCUS_AREA_IDS, DAY_IDS, …).
- Storage: `storage` from `@calistenia/core/platform` (sync getItem/setItem/removeItem).
- Current user: `useAuthUser()` (`apps/mobile/src/lib/use-auth-user.ts`).
- Update profile: `pb.collection('users').update(userId, {...})` direct.
- Design system: NativeWind; `Chip`, `Button`, `Input`, `Textarea`, `Card`, `Text` in `apps/mobile/src/components/ui/`. Fonts: `font-bebas`/`font-sans*`/`font-mono*` (never `font-bold` with custom fonts). Accent `lime`.

## Build plan

### Part A — Foundation (core + gate + signup)
1. NEW `packages/core/lib/onboarding-state.ts`:
   - `isOnboardingDone(userId: string): boolean`
   - `markOnboardingDone(userId: string): void`
   - `resetOnboarding(userId: string): void`
   Uses `storage` from `../platform`, key `calistenia_onboarding_done_${userId}`.
2. `packages/core/lib/storage-keys.ts` → add the onboarding key (prefix) to user-scoped keys cleared on logout.
3. `apps/mobile/src/app/index.tsx` gate:
   - `!pb.authStore.isValid` → `/login`
   - valid && `!isOnboardingDone(uid)` → `/onboarding`
   - else → `/(tabs)`
4. `apps/mobile/src/app/(tabs)/_layout.tsx`: after authValid check, `!isOnboardingDone(uid)` → redirect `/onboarding`.
5. `apps/mobile/src/app/_layout.tsx`: register `onboarding` Stack screen (full-screen, no header, gesture disabled).
6. `apps/mobile/src/app/login.tsx`: refactor to `useAuth()` from `@calistenia/core/hooks/useAuth`; add login/signup mode toggle + `displayName` field (signup). Keep Google OAuth via existing `loginWithGoogle()`. On success `router.replace('/')` (gate routes to onboarding for new users).

### Part B — Onboarding screens (`apps/mobile/src/components/onboarding/`)
Port web components 1:1 to RN/NativeWind:
- `OnboardingFlow.tsx` — step state, per-step `users.update`, progress, needsProfile branch, recovery (activeProgram → markDone), final `markOnboardingDone` + `router.replace('/(tabs)')`.
- `StepWelcome`, `StepBasics`, `StepGoals`, `StepHealth`, `StepTraining`, `StepProgram`, `StepPersonalizing`, `OnboardingProgress`.
- `apps/mobile/src/app/onboarding.tsx` route → renders `<OnboardingFlow/>` inside Screen + SafeArea.
- Reuse i18n keys already present in `packages/core/locales/{en,es}/translation.json`.

## Verification
- `tsc` clean in mobile + core.
- Manual: new signup → onboarding 7 steps → lands on tabs; flag persists across relaunch; logout clears flag.
