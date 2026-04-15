# Welmi Competitive Analysis: Unit System Toggle (Metric/Imperial)

## Current State

### What We Have
- **100% metric with zero imperial support** — "kg" and "cm" are hardcoded across ~20 UI files
- Database stores: `weight_kg` (weight_entries), `weight`/`height` (users, nutrition_goals), `weight_kg` (sets_log), cardio in km/m
- i18n setup exists (es/en via react-i18next) but unit labels are hardcoded in translation strings (e.g., `"Weight (kg)"`)
- Cardio is fully metric: km, min/km, km/h, meters for elevation

### What Welmi Does
- During onboarding, weight/height pickers allow switching between metric (kg/cm) and imperial (lbs/ft-in)
- Toggle appears to be a simple unit switch at the top of each measurement screen
- Internal storage likely metric as well

## Proposed Implementation

### Core Principle
**Always store metric internally. Imperial is purely a UI/display conversion.**

### Data Model
Add to `users` collection:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `unit_system` | Text | `"metric"` | `"metric"` or `"imperial"` |

### Conversion Utilities — `src/lib/units.ts`

```typescript
// Weight
export const kgToLbs = (kg: number) => kg * 2.20462;
export const lbsToKg = (lbs: number) => lbs / 2.20462;

// Height
export const cmToFtIn = (cm: number) => {
  const totalInches = cm / 2.54;
  return { ft: Math.floor(totalInches / 12), in: Math.round(totalInches % 12) };
};
export const ftInToCm = (ft: number, inches: number) => (ft * 12 + inches) * 2.54;

// Distance (cardio)
export const kmToMi = (km: number) => km * 0.621371;
export const miToKm = (mi: number) => mi / 0.621371;

// Pace
export const minPerKmToMinPerMi = (pace: number) => pace * 1.60934;

// Formatting
export const formatWeight = (kg: number, system: UnitSystem) =>
  system === 'imperial' ? `${kgToLbs(kg).toFixed(1)} lbs` : `${kg.toFixed(1)} kg`;
export const formatHeight = (cm: number, system: UnitSystem) =>
  system === 'imperial' ? `${cmToFtIn(cm).ft}'${cmToFtIn(cm).in}"` : `${cm} cm`;
```

### React Hook — `useUnitSystem()`

```typescript
export function useUnitSystem() {
  const { user } = useAuth();
  const system = user?.unit_system || 'metric';
  return { system, formatWeight, formatHeight, formatDistance, ... };
}
```

### UI Touchpoints (21+ files)

| Area | Files | Changes |
|------|-------|---------|
| Onboarding | `OnboardingFlow.tsx` | Add unit toggle to profile step |
| Profile/Settings | `ProfilePage.tsx` | Unit preference selector |
| Weight tracking | `WeightTracker.tsx`, `WeightEntryModal.tsx` | Display + input conversion |
| Nutrition goals | `NutritionGoalSetup.tsx` | Weight display |
| Workout session | `WorkoutSessionPage.tsx` | Weight on sets (kg/lbs) |
| 1RM calculator | `OneRMCalculator.tsx` | Weight input/output |
| Weight progression | `WeightProgressionChart.tsx` | Chart labels |
| Volume load | Workout stats components | kg/lbs display |
| Cardio session | `CardioSessionPage.tsx` | km/mi, pace |
| Cardio history | `CardioHistoryPage.tsx` | Distance/pace |
| Body measurements | `BodyMeasurementsTracker.tsx` | cm/in |
| Export/sharing | Any share/export features | Formatted output |

### Rollout Phases

1. **Phase 1 — Core** (1 day): Migration + `units.ts` + `useUnitSystem()` + onboarding toggle + profile setting + weight tracker
2. **Phase 2 — Workouts** (0.5 day): Sets weight display, 1RM calculator, volume load
3. **Phase 3 — Cardio** (0.5 day): Distance, pace, elevation
4. **Phase 4 — Polish** (0.5 day): Body measurements, exports, edge cases

## What They Do Well vs What We Do Better

| Aspect | Welmi | Us (Proposed) |
|--------|-------|---------------|
| Unit selection | Per-screen during onboarding | Single toggle in profile, applies everywhere |
| UX | Separate picker screens for each measurement | Compact form with inline toggle |
| Coverage | Weight + height only (from screenshots) | Weight + height + workout weights + cardio + measurements |
| Implementation | Unknown | Clean separation: metric storage + display-only conversion |

## Priority & Effort

- **Priority**: Medium-High — important for international users (especially US/UK market), but current Spanish-speaking audience is mostly metric
- **Effort**: **M** (~2.5 days, ~20 files to touch)
- **Risk**: Low — purely additive, no existing data changes
- **Recommendation**: Do this when targeting English-speaking markets. Not urgent for current Spanish-first launch.
