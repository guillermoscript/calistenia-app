# Welmi Competitive Analysis: Adaptive Pacing & Progress Projections

## Current State

### What We Have
- **Calorie/TDEE logic** (`src/hooks/useNutrition.ts`): Mifflin-St Jeor with hardcoded adjustments: -500 (fat loss), +300 (muscle gain). No pace customization.
- **Weight tracking** (`src/hooks/useWeight.ts` + `WeightTracker.tsx`): `weight_entries` collection with basic stats (current, min, max, trend) but **no projections or goal weight**.
- **Onboarding** (`OnboardingFlow.tsx`): Collects weight/height/age/sex/level/goal but does not calculate BMI or suggest a healthy weight.
- **NutritionGoalSetup** (`NutritionGoalSetup.tsx`): 6-step wizard that collects body data — natural place to add goal weight + pace.
- **Dashboard PR goals**: Fixed goal cards for pull-ups, push-ups, L-sit, etc. — pattern could extend to weight goals.
- **No `goal_weight`, `target_weight`, or `pace` fields** anywhere in codebase.
- **No weight projections or check-in scheduling** exists.
- **Body measurements tracker** and **phase photo timeline** exist and can integrate with check-ins.

### What Welmi Does

**5 onboarding screens dedicated to pacing/projections:**

1. **Goal weight picker**: Same horizontal ruler as current weight, shows current (88.8kg) with arrow to selected (88.6kg). Smart suggestion: "Un objetivo saludable es alrededor de 80 kg" based on BMI, with explanation about healthy BMI range.

2. **Pace slider**: "Elige un ritmo que se adapte a ti"
   - Slider: Facil ← Equilibrado → Estricto
   - Shows: "Progreso esperado por semana: 0.8 kg"
   - Shows: "Alcanza tu objetivo para 1 abril de 2026"
   - Shows: "Meta diaria de calorias: 1819 kcal"
   - Calculates projected completion date in real time as slider moves

3. **First check-in scheduling**: "Configura tu primer control de progreso"
   - Day picker (scroll wheel, 5-14 days)
   - Shows: "Caida esperada: 800 g"
   - Motivational text about adapting to healthier habits

4. **"Personalizing your program" loading**: Animated progress bars:
   - "Analizando perfil: 191 cm, 88.8 kg" ✓
   - "Calculando el metabolismo: 1819 kcal" 57%
   - "Generando plan de comidas: Facil"
   - "Condicion de salud: Sin condiciones especiales"
   (This is purely theatrical — creates perceived personalization value)

5. **Progress timeline**: "Mira lo que viene"
   - Today: 88.8 kg → "Quieres perder 200 g"
   - In 7 days: 88 kg → first results milestone
   - In 2 days: 88.6 kg → goal reached
   - Motivational copy for each milestone

## Proposed Implementation

### Feature 1: Smart Goal Weight Suggestion

When user enters current weight + height, calculate and suggest:

```typescript
// BMI-based healthy weight suggestion
const suggestHealthyWeight = (heightCm: number): { min: number; max: number; ideal: number } => {
  const heightM = heightCm / 100;
  return {
    min: Math.round(18.5 * heightM * heightM),   // BMI 18.5
    max: Math.round(24.9 * heightM * heightM),    // BMI 24.9
    ideal: Math.round(22 * heightM * heightM),    // BMI 22 (middle of healthy range)
  };
};
```

Show as inline suggestion below goal weight picker: "Un objetivo saludable para tu altura esta entre X y Y kg"

### Feature 2: Pace Preference

| Pace | Label | Weekly loss | Calorie deficit | Safety |
|------|-------|-------------|-----------------|--------|
| Easy | "Facil" | ~0.25 kg/wk | -250 kcal/day | Very safe |
| Balanced | "Equilibrado" | ~0.5 kg/wk | -500 kcal/day | Safe (current default) |
| Strict | "Estricto" | ~0.75-1 kg/wk | -750 kcal/day | Needs floor guard |

**Safety guards:**
- Never go below 1200 kcal/day (women) or 1500 kcal/day (men)
- If strict pace would go below floor → auto-cap and show warning
- Max recommended loss: 1% of body weight per week

**Integration point**: Modify the hardcoded -500 in `useNutrition.ts` to use pace-based deficit.

### Feature 3: Progress Projections

```typescript
const projectWeight = (current: number, goal: number, weeklyLoss: number) => {
  const totalToLose = current - goal;
  const weeksNeeded = Math.ceil(totalToLose / weeklyLoss);
  const targetDate = addWeeks(new Date(), weeksNeeded);

  // Generate milestones
  const milestones = [
    { date: new Date(), weight: current, label: 'Hoy' },
    { date: addWeeks(new Date(), 1), weight: current - weeklyLoss, label: 'Primeros resultados' },
    { date: targetDate, weight: goal, label: 'Objetivo alcanzado' },
  ];

  return { weeksNeeded, targetDate, milestones };
};
```

**Our advantage over Welmi**: Be honest. Welmi showed "lose 200g in 2 days" which is unrealistic and misleading. We should show realistic weekly projections with a disclaimer that actual results vary.

### Feature 4: Check-in Scheduling

- User picks check-in frequency: every 7 / 10 / 14 days
- System creates recurring prompts to weigh in + take measurements
- After check-in: compare actual vs projected, adjust recommendations if needed
- Integrates with existing phase photo system (combine weight check-in + photo checkpoint)

### Feature 5: "Personalizing" Loading Screen

- Purely engagement theater — but effective for perceived value
- Show animated progress bars while "calculating" (actually just a 3-5 second delay)
- Display the data being used: height, weight, metabolism, pace, conditions
- Transitions to the dashboard or program recommendation

### Data Model Changes

**Add fields to `nutrition_goals` or `users`:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `goal_weight` | Number | null | Target weight in kg |
| `pace` | Text | `"balanced"` | `"easy"`, `"balanced"`, `"strict"` |
| `calorie_deficit` | Number | -500 | Derived from pace, stored for reference |
| `projected_target_date` | Date | null | Calculated from goal + pace |
| `checkin_frequency_days` | Number | 7 | Days between progress check-ins |
| `next_checkin_date` | Date | null | Next scheduled check-in |

### Integration Points

- **`useNutrition.ts`**: Replace hardcoded -500 with pace-based deficit
- **`NutritionGoalSetup.tsx`**: Add goal weight step + pace slider + projection preview
- **`DashboardPage.tsx`**: Add weight goal progress card (current → goal with % complete)
- **`WeightTracker.tsx`**: Overlay projection line on weight chart
- **Onboarding**: Add compact goal + pace section

## What They Do Well vs What We Do Better

| Aspect | Welmi | Us (Proposed) |
|--------|-------|---------------|
| Goal suggestion | Smart BMI-based suggestion | Same approach, inline |
| Pace options | 3-level slider with real-time updates | Same, with safety guards |
| Projections | Aggressive/misleading ("200g in 2 days") | Honest, science-backed weekly projections |
| Check-ins | Configurable frequency | Same + integrated with phase photos |
| Loading screen | Fancy animated "personalizing" | Optional engagement moment |
| # of screens | 5 separate pages | 1-2 compact sections |
| Post-onboarding | Unknown adaptation | Check-in → actual vs projected → adjust |

## Priority & Effort

- **Priority**: **High** — directly impacts retention (users with goals + projections stay engaged)
- **Effort**: **M-L** (~5-8 days total across 3 phases)
  - **Phase A** (3 days): Goal weight + pace preference + calorie adjustment (modify useNutrition.ts)
  - **Phase B** (2 days): Projections timeline + dashboard widget + check-in scheduling
  - **Phase C** (1-2 days): "Personalizing" loading screen + onboarding integration
- **Dependencies**: None for Phase A. Phase B benefits from weight tracker existing (already does).
- **Quick win**: Just replacing the hardcoded -500 with a pace selector is a 2-hour change with immediate user value.
