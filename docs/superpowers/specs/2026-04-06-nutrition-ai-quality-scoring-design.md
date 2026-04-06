# AI Nutrition Quality Scoring & Coach

**Date:** 2026-04-06
**Status:** Approved
**Approach:** AI-First (Enfoque 1)

## Overview

Add an AI-powered nutrition intelligence layer on top of the existing meal logging system. Every logged meal receives a quality score (A-E), contextual feedback, and personalized suggestions. Scores aggregate into daily and weekly views. A Coach panel provides insights, pattern detection, and gamification to guide users toward better eating habits.

## 1. AI Scoring per Meal

### Expanded AI Response Schema

When a meal is logged (photo, manual, or barcode), the AI analysis prompt is expanded so Claude also returns:

```typescript
{
  // ...existing foods[], totalCalories, etc.
  quality: {
    score: "A" | "B" | "C" | "D" | "E",
    breakdown: {
      positives: string[],    // "Alto en proteina", "Buena fuente de fibra"
      negatives: string[],    // "Exceso de azucares simples", "Bajo en micronutrientes"
      summary: string         // "Comida equilibrada pero alta en sodio"
    },
    message: string,           // Contextual: hora + goal + patron
    suggestion: {
      text: string,            // "Prueba cambiar las papas fritas por batata al horno"
      alternatives: { name: string, portionNote: string }[]  // Simplified, not full FoodItem
    } | null                   // null if score >= B
  }
}
```

The score is for the **complete meal**, not per ingredient. The breakdown explains why.

**Implementation note:** The existing `MealAnalysisSchema` Zod object in `mcp-server/src/api/schemas.ts` must be extended with the `quality` block. The `analyzeMealImage()` function in `meal-analyzer.ts` must be updated to fetch the additional context (recent scores, remaining macros, food history) before making the AI call.

### Context Provided to Claude for Scoring

1. **The complete meal** — all foods + total macros
2. **Log hour** — to evaluate time appropriateness
3. **User goal** — muscle_gain, fat_loss, recomp, maintain
4. **Remaining daily macros** — whether this meal unbalances the day
5. **Recent patterns** — last 5-7 meals with their scores (from DB)
6. **User food history** — top 10 frequent foods, for realistic alternative suggestions

### Scoring Criteria (Prompt Guide)

| Score | Meaning | Example |
|---|---|---|
| **A** | Excellent — nutrient-dense, well-balanced for goal and time | Chicken breast with brown rice and vegetables at lunch |
| **B** | Good — solid with minor improvement areas | Oatmeal bowl with fruit, could use more protein |
| **C** | Acceptable — neutral, neither good nor bad | Ham and cheese sandwich, functional but processed |
| **D** | Poor — low nutritional quality or bad timing | Frozen pizza at 11pm |
| **E** | Bad — junk food, ultra-processed, zero nutritional value | Doritos with soda as dinner |

### Manual/Barcode Entries

When there's no photo (manual entry or barcode scan), a new `scoreMealQuality()` function in `mcp-server/src/api/meal-analyzer.ts` makes a text-only AI call with the nutritional data + context. This function is called from the same hooks that handle meal saving (`useNutrition.ts`) — after the meal is persisted, the scoring call fires and updates the entry with quality fields.

The call receives: food names, macros, meal type, log hour, user goal, remaining daily macros, recent meal scores, and top frequent foods. Cheaper in tokens than image analysis but produces the same quality output.

## 2. Adaptive Tone Escalation

The system starts soft and escalates based on detected patterns. The AI receives recent meals with scores and decides the tone naturally.

### Tone Levels

| Level | Trigger | Example |
|---|---|---|
| **1 - Soft** | Isolated case or first occurrence | "Esta comida es alta en grasas saturadas. Para la cena, opciones mas ligeras ayudan al descanso." |
| **2 - Direct** | 2-3 D/E meals in the week | "Llevas varias comidas con score bajo esta semana. Que tal si en tu proximo snack pruebas yogur griego con fruta en vez de galletas?" |
| **3 - Insistent** | 4+ D/E meals in the week or repeated pattern (e.g. late-night junk 3+ times) | "Esta es la tercera noche seguida con comida ultra-procesada tarde. Esto afecta tu descanso y tus resultados en el entreno. Tu food history muestra que te gusta el huevo — unos huevos revueltos serian mucho mejor opcion a esta hora." |

### Implementation

No separate rules engine. The prompt instructs Claude:

> "Adjust your tone based on the pattern: if it's an isolated case, be soft and informative. If you detect a repeated pattern (3+ D/E meals in the week, or the same bad habit repeated), be more direct and insistent. Always suggest alternatives from the user's food history."

### Positive Feedback — Same Logic Inverted

| Pattern | Example |
|---|---|
| Good isolated meal | "Excelente eleccion! Alto en proteina y perfecto para tu objetivo de ganancia muscular." |
| 3+ day streak of A/B | "Llevas 3 dias con alimentacion de calidad. Se nota el compromiso, sigue asi!" |
| Improving trend | "Tu score semanal paso de C a B. El cambio se nota, especialmente en tus cenas." |

## 3. Aggregated Scores

### Daily Score

Calculated **locally** (no extra AI call) when the user has 2+ meals logged:

- **Weighted average** by calories: an 800cal meal with score D weighs more than a 150cal snack with score A
- Numeric mapping: A=5, B=4, C=3, D=2, E=1 → average → round to nearest score
- Displayed in the NutritionDashboard alongside the calorie gauge

### Weekly Score

Generated via **AI call** when the user opens the weekly tab. The app checks if a `nutrition_coach_insights` record with `type: "weekly"` and matching `periodStart` already exists — if so, it loads the cached result. If not, it generates one and saves it. This avoids duplicate calls on repeat visits.

- Overall week score
- Detected patterns (positive and negative)
- Highlights ("tu mejor dia fue el miercoles")
- Concerns ("3 de 7 cenas fueron score D o peor")
- Comparison with previous week (if exists)
- Motivational or alert message based on trend

Saved to `nutrition_coach_insights` with `type: "weekly"`. A unique index on `(user, type, periodStart)` prevents duplicates.

### Daily Score Persistence

The daily score is calculated locally in the frontend, but **also persisted** to `nutrition_coach_insights` with `type: "daily"`. When the user views the NutritionDashboard and has 2+ scored meals, the app:
1. Calculates the weighted average locally
2. Checks if a daily insight record exists for today
3. If not, creates one with the score and updated streak counts
4. If it exists, updates the score (in case new meals were logged)

This ensures streaks and badge checks have persistent data to work with.

## 4. Data Model

### Changes to `nutrition_entries`

New fields added to the existing collection. **All fields are optional** (`required: false`) to preserve compatibility with existing records.

| Field | Type | Required | Description |
|---|---|---|---|
| `qualityScore` | text | no | A, B, C, D, E |
| `qualityBreakdown` | json | no | `{ positives: string[], negatives: string[], summary: string }` |
| `qualityMessage` | text | no | Contextual AI message |
| `qualitySuggestion` | json | no | `{ text: string, alternatives: { name: string, portionNote: string }[] }` — simplified food references, not full FoodItem objects |

Note: `loggedHour` is not needed as a separate field — the hour can be derived from the existing `loggedAt` autodate field at query time or in application code.

### New Collection: `nutrition_coach_insights`

| Field | Type | Description |
|---|---|---|
| `user` | relation | User |
| `type` | select | `daily`, `weekly` |
| `periodStart` | date | Period start date |
| `overallScore` | text | A-E weighted average |
| `insights` | json | `{ patterns: Pattern[], highlights: string[], concerns: string[] }` |
| `coachMessage` | text | Main coach message |
| `streaks` | json | `{ currentGood: number, bestGood: number, currentBad: number }` |
| `generatedAt` | autodate | When generated |

**Unique index:** `idx_nci_user_type_period` on `(user, type, periodStart)` — prevents duplicate records. Upsert logic: if record exists for the same user+type+period, update it instead of creating a new one.

### New Collection: `nutrition_badges`

| Field | Type | Description |
|---|---|---|
| `user` | relation | User |
| `badgeType` | text | Badge identifier |
| `earnedAt` | autodate | When earned |
| `metadata` | json | Extra badge data (see per-badge metadata below) |

**Badge metadata by type:**
- `first_a`: `{}` (no extra data)
- `streak_3`, `streak_7`, `streak_30`: `{ startDate: string, endDate: string }`
- `weekly_improvement`: `{ fromScore: string, toScore: string, week: string }`
- `no_e_week`: `{ week: string }`
- `balanced_day`: `{ date: string, mealCount: number }`
- `comeback`: `{ fromScore: string, toScore: string }`

**Deduplication:** No unique index on the collection. One-time badges (`first_a`) are deduplicated in application code (check before insert). Repeatable badges (`streak_3`, `weekly_improvement`) can have multiple records.

## 5. Gamification

### Streaks

Tracked in `nutrition_coach_insights` (field `streaks`), updated when daily score is calculated:

- **Good streak** — consecutive days with daily score A or B
- **Bad streak** — consecutive days with score D or E (shown as alert in Coach, not as achievement)
- **Best streak** — user's historical record

### Badges

Defined in code, unlocked and saved to `nutrition_badges`:

| Badge | Trigger |
|---|---|
| `first_a` | First meal with score A |
| `streak_3` | 3 consecutive days A/B |
| `streak_7` | 7 consecutive days A/B |
| `streak_30` | 30 consecutive days A/B |
| `weekly_improvement` | Weekly score better than previous |
| `no_e_week` | Full week without any E meal |
| `balanced_day` | A day with all meals A or B |
| `comeback` | Go from D/E week to A/B/C week |

### Display

- **On unlock** — toast notification with badge and message
- **In Coach panel** — compact section with recent badges and current streak
- **No separate badges page** — everything lives inside the Coach

## 6. UI Integration

### Inline on Meal Cards

Each meal card in NutritionDashboard shows:

**Score badge** — circle with letter A-E and background color:
- A: green (#22c55e)
- B: light green (#84cc16)
- C: yellow (#eab308)
- D: orange (#f97316)
- E: red (#ef4444)

Position: top-right corner of meal card, next to meal type tag.

**Expandable** — tapping the badge or card expands a block below with:
- Breakdown: positives and negatives as green/red chips
- One-line summary
- Coach message (contextual to hour/goal/pattern)
- Suggestion with alternative (only if score < B)

### Daily Score Inline

In the NutritionDashboard header, alongside the circular calorie gauge, the daily score shows as a large badge with letter and color. Only appears with 2+ logged meals.

### Coach Panel

Lives inside the existing collapsible Insights section in NutritionPage, as a new sub-section at the top:

**Daily tab content:**
- Day score with color and breakdown
- Chronological feed of coach messages from each meal
- Active patterns ("Llevas 3 dias comiendo tarde" or "Racha de 5 dias con score B+")
- Streaks and badges — current streak, last earned badge

**Weekly tab content:**
- Full weekly summary with score + insights + comparison
- Chart of daily scores for the week (7 colored bars A-E)
- Trend vs previous week

### States

- **No score** — Meal logged before feature existed → no badge shown, doesn't affect averages. The feature builds up over time; no backfill of historical meals.
- **Processing** — While AI analyzes (especially background jobs) → grey badge with spinner
- **Error** — AI scoring call failed (timeout, rate limit, malformed response) → meal is saved without score (same as "No score" visually). No retry — the user can trigger a re-score by editing the meal.
- **Scored** — Badge with color and letter, expandable

## 7. AI Cost Considerations

| Scenario | Cost |
|---|---|
| Photo meal log | ~300-500 extra input tokens for context (patterns, food history, remaining macros) added to existing vision prompt |
| Manual/barcode log | Lightweight text-only call (~500 input tokens + context) |
| Weekly insights | One call per week (~2000 input tokens with all meals) |
| Daily score | Zero — calculated locally |

The main cost increase is the additional context sent per meal (recent patterns, food history, remaining macros). Estimated ~300-500 extra input tokens per meal log.
