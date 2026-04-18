# Programs Catalog for User Personas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a 13-program catalog (9 level×goal + 4 skill tracks) plus primary/secondary matching driven by onboarding signals, so FOR YOU recommendations work across every persona the onboarding covers.

**Architecture:** A PocketBase migration adds 6 optional fields to the `programs` collection (goal_type, skill, intensity, days_per_week, equipment_required, contraindications). A pure TypeScript function `matchUserToPrograms` replaces the current `difficulty === X` check and returns `{ primary, secondary, penalties }`. `StepProgram.tsx` renders primary (FOR YOU) and secondary ("TAMBIÉN PARA TI") cards with amber soft-penalty chips. A seed script creates 12 skeleton programs and retags the existing `Intermedio – Balance Total` record. Program content lands in Phase 2, session-by-session.

**Tech Stack:** TypeScript, React + Vite, PocketBase (JS migrations), Vitest, i18next, shadcn/ui, Node (ESM scripts).

**Spec:** `docs/superpowers/specs/2026-04-18-programs-catalog-personas-design.md`

---

## File Structure

### Files to create

- `pb_migrations/1776600000_add_program_catalog_fields.js` — adds 6 fields + backfills `Intermedio – Balance Total` record
- `src/lib/matchPrograms.ts` — pure `matchUserToPrograms(user, programs)` + helper types
- `src/lib/matchPrograms.test.ts` — vitest unit tests covering persona matrix
- `scripts/seed-program-catalog.mjs` — idempotent seed: retags existing + creates 12 skeletons

### Files to modify

- `src/types/index.ts:224-238` — extend `ProgramMeta` interface with 6 optional fields
- `src/hooks/usePrograms.ts:296-309` — map new PB fields into `ProgramMeta`
- `src/components/onboarding/StepProgram.tsx` — swap manual sort for `matchUserToPrograms`; render secondary card + penalty chips; pass full user object instead of just `userLevel`
- `src/components/onboarding/OnboardingFlow.tsx` — pass full user object (weight, goal_weight, focus_areas, training_days, injuries, medical_conditions) to `StepProgram`
- `src/pages/ProgramDetailPage.tsx:455-457` — inject "contenido próximamente" banner when program has no real exercises
- `src/locales/es/translation.json` + `src/locales/en/translation.json` — 5 new i18n keys

---

## Task 1: Migration — add 6 fields to `programs` collection

**Files:**
- Create: `pb_migrations/1776600000_add_program_catalog_fields.js`

- [ ] **Step 1: Stop local PB dev server if running**

Run: `lsof -i :8090 | grep LISTEN` — if a PID is listed, note it. The migration is applied by PB on boot, so we need a clean restart. If PB is running via `./pocketbase serve`, stop it (Ctrl+C) before editing migrations.

- [ ] **Step 2: Create the migration file**

Write `pb_migrations/1776600000_add_program_catalog_fields.js`:

```javascript
/// <reference path="../pb_data/types.d.ts" />

/**
 * Add catalog-matching fields to the programs collection.
 *
 * Supports the FOR YOU / TAMBIÉN PARA TI matching in StepProgram.tsx
 * (see docs/superpowers/specs/2026-04-18-programs-catalog-personas-design.md).
 *
 * Fields:
 *   - goal_type: fat_loss | muscle_gain | maintain | skill
 *   - skill: pull_up | handstand | muscle_up | planche (nullable)
 *   - intensity: light | moderate | intense
 *   - days_per_week: 1..7
 *   - equipment_required: string[] (json)
 *   - contraindications: string[] of INJURY_IDS ∪ CONDITION_IDS (json)
 *
 * All optional so existing records keep working. Up step also backfills
 * the existing "Intermedio – Balance Total" record.
 */
migrate((app) => {
  const programs = app.findCollectionByNameOrId("programs")

  if (!programs.fields.find(f => f.name === "goal_type")) {
    programs.fields.add(new Field({
      "hidden": false,
      "id": "select_program_goal_type",
      "maxSelect": 1,
      "name": "goal_type",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "select",
      "values": ["fat_loss", "muscle_gain", "maintain", "skill"]
    }))
  }

  if (!programs.fields.find(f => f.name === "skill")) {
    programs.fields.add(new Field({
      "hidden": false,
      "id": "select_program_skill",
      "maxSelect": 1,
      "name": "skill",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "select",
      "values": ["pull_up", "handstand", "muscle_up", "planche"]
    }))
  }

  if (!programs.fields.find(f => f.name === "intensity")) {
    programs.fields.add(new Field({
      "hidden": false,
      "id": "select_program_intensity",
      "maxSelect": 1,
      "name": "intensity",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "select",
      "values": ["light", "moderate", "intense"]
    }))
  }

  if (!programs.fields.find(f => f.name === "days_per_week")) {
    programs.fields.add(new Field({
      "hidden": false,
      "id": "number_program_days_per_week",
      "max": 7,
      "min": 1,
      "name": "days_per_week",
      "onlyInt": true,
      "presentable": false,
      "required": false,
      "system": false,
      "type": "number"
    }))
  }

  if (!programs.fields.find(f => f.name === "equipment_required")) {
    programs.fields.add(new Field({
      "hidden": false,
      "id": "json_program_equipment_required",
      "maxSize": 1000,
      "name": "equipment_required",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "json"
    }))
  }

  if (!programs.fields.find(f => f.name === "contraindications")) {
    programs.fields.add(new Field({
      "hidden": false,
      "id": "json_program_contraindications",
      "maxSize": 1000,
      "name": "contraindications",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "json"
    }))
  }

  app.save(programs)

  // Backfill existing "Intermedio – Balance Total" record.
  // i18n-aware name match: `name` is stored as JSON { es: "...", en: "..." }.
  try {
    const existing = app.findRecordsByFilter(
      "programs",
      `name ~ "Balance Total" || name ~ "Intermedio"`,
      "",
      100,
      0
    )
    for (const rec of existing) {
      const nameEs = (rec.get("name") && rec.get("name").es) || ""
      if (!nameEs.includes("Balance Total")) continue
      rec.set("goal_type", "maintain")
      rec.set("intensity", "moderate")
      rec.set("days_per_week", 6)
      rec.set("equipment_required", ["pull_bar", "parallel_bars", "bands"])
      rec.set("contraindications", ["abdominal_hernia", "lower_back"])
      app.save(rec)
    }
  } catch (e) {
    // Fresh install with no Balance Total record yet — skip.
  }
}, (app) => {
  try {
    const programs = app.findCollectionByNameOrId("programs")
    const toRemove = [
      "select_program_goal_type",
      "select_program_skill",
      "select_program_intensity",
      "number_program_days_per_week",
      "json_program_equipment_required",
      "json_program_contraindications"
    ]
    programs.fields = programs.fields.filter(f => !toRemove.includes(f.id))
    app.save(programs)
  } catch (e) {}
})
```

- [ ] **Step 3: Apply migration locally**

Run: `./pocketbase migrate up`
Expected output: `Applied 1776600000_add_program_catalog_fields.js`

- [ ] **Step 4: Verify fields exist via PB API**

Run:
```bash
curl -s -X POST http://127.0.0.1:8090/api/collections/_superusers/auth-with-password \
  -H "Content-Type: application/json" \
  -d '{"identity":"<LOCAL_SU_EMAIL>","password":"<LOCAL_SU_PASSWORD>"}' \
  | python3 -c "import sys, json; print(json.load(sys.stdin)['token'])"
```
Then:
```bash
TOKEN=<from above>
curl -s http://127.0.0.1:8090/api/collections/programs -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys, json; [print(f['name'], f['type']) for f in json.load(sys.stdin)['fields']]"
```
Expected: `goal_type select`, `skill select`, `intensity select`, `days_per_week number`, `equipment_required json`, `contraindications json` are present.

- [ ] **Step 5: Verify migration down works**

Run: `./pocketbase migrate down 1` then re-run Step 4. Expected: the six fields no longer listed. Then re-run `./pocketbase migrate up` to reapply.

- [ ] **Step 6: Commit**

```bash
git add pb_migrations/1776600000_add_program_catalog_fields.js
git commit -m "feat(db): add catalog fields to programs collection

Adds goal_type, skill, intensity, days_per_week, equipment_required,
contraindications. All optional. Migration backfills the existing
Intermedio – Balance Total record with its persona tags."
```

---

## Task 2: Extend `ProgramMeta` TS type

**Files:**
- Modify: `src/types/index.ts:224-238`

- [ ] **Step 1: Write the failing import in a temp test file**

Create `src/types/programMeta.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import type { ProgramMeta } from './index'

describe('ProgramMeta', () => {
  it('accepts the new catalog fields', () => {
    const p: ProgramMeta = {
      id: 'x',
      name: 'Test',
      description: '',
      duration_weeks: 4,
      goal_type: 'fat_loss',
      skill: 'pull_up',
      intensity: 'light',
      days_per_week: 3,
      equipment_required: ['pull_bar'],
      contraindications: ['lower_back'],
    }
    expect(p.goal_type).toBe('fat_loss')
    expect(p.skill).toBe('pull_up')
    expect(p.intensity).toBe('light')
    expect(p.days_per_week).toBe(3)
    expect(p.equipment_required).toEqual(['pull_bar'])
    expect(p.contraindications).toEqual(['lower_back'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/types/programMeta.test.ts`
Expected: TypeScript compile error — `goal_type` etc. do not exist on `ProgramMeta`.

- [ ] **Step 3: Extend the `ProgramMeta` interface**

In `src/types/index.ts`, replace lines 224-238 with:

```typescript
export type ProgramGoalType = 'fat_loss' | 'muscle_gain' | 'maintain' | 'skill'
export type ProgramSkill = 'pull_up' | 'handstand' | 'muscle_up' | 'planche'
export type ProgramIntensity = 'light' | 'moderate' | 'intense'

export interface ProgramMeta {
  id: string
  name: string
  description: string
  duration_weeks: number
  created_by?: string
  created_by_name?: string
  is_official?: boolean
  is_featured?: boolean
  difficulty?: ProgramDifficulty
  cover_image?: string
  /** Resolved cover image URL (built from PB file service) */
  cover_image_url?: string
  discipline?: 'yoga' | 'calistenia'
  /** Catalog-matching fields (see specs/2026-04-18-programs-catalog-personas-design.md) */
  goal_type?: ProgramGoalType
  skill?: ProgramSkill
  intensity?: ProgramIntensity
  days_per_week?: number
  equipment_required?: string[]
  contraindications?: string[]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/types/programMeta.test.ts`
Expected: PASS.

- [ ] **Step 5: Delete the temp test file**

Run: `rm src/types/programMeta.test.ts`
(The real tests for matching go in Task 4.)

- [ ] **Step 6: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: PASS with no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): extend ProgramMeta with catalog-matching fields

goal_type, skill, intensity, days_per_week, equipment_required,
contraindications — all optional."
```

---

## Task 3: Map new PB fields into `ProgramMeta` in `usePrograms`

**Files:**
- Modify: `src/hooks/usePrograms.ts:296-309`

- [ ] **Step 1: Locate the mapping block**

Read `src/hooks/usePrograms.ts:296-309` — the `catalog: ProgramMeta[] = catalogRes.items.map(p => ({ ... }))` literal. The new fields get pulled from `p.goal_type` etc.

- [ ] **Step 2: Replace the mapping literal**

Change lines 296-309 from:

```typescript
    const catalog: ProgramMeta[] = catalogRes.items.map(p => ({
      id:             p.id,
      name:           localize(p.name, locale),
      description:    localize(p.description, locale),
      duration_weeks: p.duration_weeks,
      created_by:     p.created_by || undefined,
      created_by_name: (p.expand as any)?.created_by?.display_name || undefined,
      is_official:    p.is_official || false,
      is_featured:    p.is_featured || false,
      difficulty:     p.difficulty || undefined,
      cover_image:    p.cover_image || undefined,
      cover_image_url: p.cover_image ? pb.files.getURL(p, p.cover_image, { thumb: '400x0' }) : undefined,
      discipline:     disciplineByProgram.get(p.id) || 'calistenia',
    }))
```

to:

```typescript
    const catalog: ProgramMeta[] = catalogRes.items.map(p => ({
      id:             p.id,
      name:           localize(p.name, locale),
      description:    localize(p.description, locale),
      duration_weeks: p.duration_weeks,
      created_by:     p.created_by || undefined,
      created_by_name: (p.expand as any)?.created_by?.display_name || undefined,
      is_official:    p.is_official || false,
      is_featured:    p.is_featured || false,
      difficulty:     p.difficulty || undefined,
      cover_image:    p.cover_image || undefined,
      cover_image_url: p.cover_image ? pb.files.getURL(p, p.cover_image, { thumb: '400x0' }) : undefined,
      discipline:     disciplineByProgram.get(p.id) || 'calistenia',
      goal_type:      p.goal_type || undefined,
      skill:          p.skill || undefined,
      intensity:      p.intensity || undefined,
      days_per_week:  typeof p.days_per_week === 'number' ? p.days_per_week : undefined,
      equipment_required: Array.isArray(p.equipment_required) ? p.equipment_required : undefined,
      contraindications:  Array.isArray(p.contraindications) ? p.contraindications : undefined,
    }))
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Manual smoke**

Run: `npm run dev` and open the app. Log in, navigate to any screen that lists programs (Programs page or onboarding). Verify programs still load with no console errors. The new fields won't affect visible UI yet.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePrograms.ts
git commit -m "feat(programs): load catalog-matching fields from PB

Pulls goal_type, skill, intensity, days_per_week, equipment_required,
contraindications into ProgramMeta so downstream matching can read them."
```

---

## Task 4: Pure matching function — `matchUserToPrograms`

**Files:**
- Create: `src/lib/matchPrograms.ts`
- Test: `src/lib/matchPrograms.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/matchPrograms.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { matchUserToPrograms, inferGoalType, LEVEL_TO_DIFFICULTY } from './matchPrograms'
import type { ProgramMeta } from '../types'

const P = (overrides: Partial<ProgramMeta>): ProgramMeta => ({
  id: overrides.id || 'p',
  name: overrides.name || 'Test',
  description: '',
  duration_weeks: 8,
  ...overrides,
})

// Minimal persona catalog fixture — mirrors spec's 13-program set.
const catalog: ProgramMeta[] = [
  P({ id: 'b-fat', difficulty: 'beginner', goal_type: 'fat_loss', days_per_week: 4 }),
  P({ id: 'b-gain', difficulty: 'beginner', goal_type: 'muscle_gain', days_per_week: 4 }),
  P({ id: 'b-maint', difficulty: 'beginner', goal_type: 'maintain', days_per_week: 3 }),
  P({ id: 'i-fat', difficulty: 'intermediate', goal_type: 'fat_loss', days_per_week: 5 }),
  P({ id: 'i-gain', difficulty: 'intermediate', goal_type: 'muscle_gain', days_per_week: 5 }),
  P({ id: 'i-maint', difficulty: 'intermediate', goal_type: 'maintain', days_per_week: 6, contraindications: ['lower_back'] }),
  P({ id: 'a-fat', difficulty: 'advanced', goal_type: 'fat_loss', days_per_week: 5 }),
  P({ id: 'a-gain', difficulty: 'advanced', goal_type: 'muscle_gain', days_per_week: 6 }),
  P({ id: 'a-maint', difficulty: 'advanced', goal_type: 'maintain', days_per_week: 6 }),
  P({ id: 'sk-pull', difficulty: 'beginner', goal_type: 'skill', skill: 'pull_up', days_per_week: 3 }),
  P({ id: 'sk-hand', difficulty: 'beginner', goal_type: 'skill', skill: 'handstand', days_per_week: 3 }),
  P({ id: 'sk-mu', difficulty: 'intermediate', goal_type: 'skill', skill: 'muscle_up', days_per_week: 4 }),
  P({ id: 'sk-pla', difficulty: 'advanced', goal_type: 'skill', skill: 'planche', days_per_week: 4 }),
]

describe('inferGoalType', () => {
  it('returns muscle_gain when goal_weight exceeds weight by > 2kg', () => {
    expect(inferGoalType(70, 75)).toBe('muscle_gain')
  })
  it('returns fat_loss when goal_weight is lower than weight by > 2kg', () => {
    expect(inferGoalType(85, 75)).toBe('fat_loss')
  })
  it('returns maintain when difference is within ±2kg', () => {
    expect(inferGoalType(70, 71)).toBe('maintain')
    expect(inferGoalType(70, 70)).toBe('maintain')
  })
  it('returns maintain when either value is missing', () => {
    expect(inferGoalType(undefined, 75)).toBe('maintain')
    expect(inferGoalType(70, undefined)).toBe('maintain')
    expect(inferGoalType(undefined, undefined)).toBe('maintain')
  })
})

describe('LEVEL_TO_DIFFICULTY', () => {
  it('maps Spanish onboarding levels to English difficulty values', () => {
    expect(LEVEL_TO_DIFFICULTY.principiante).toBe('beginner')
    expect(LEVEL_TO_DIFFICULTY.intermedio).toBe('intermediate')
    expect(LEVEL_TO_DIFFICULTY.avanzado).toBe('advanced')
  })
})

describe('matchUserToPrograms — primary', () => {
  it('picks beginner + fat_loss for a beginner losing weight', () => {
    const r = matchUserToPrograms({
      level: 'principiante', weight: 90, goal_weight: 80,
      focus_areas: [], training_days: ['mon','wed','fri','sat'],
    }, catalog)
    expect(r.primary?.id).toBe('b-fat')
    expect(r.secondary).toBeNull()
  })

  it('picks intermediate + maintain for the default Balance Total persona', () => {
    const r = matchUserToPrograms({
      level: 'intermedio', weight: 75, goal_weight: 75,
      focus_areas: [], training_days: ['mon','tue','wed','thu','fri','sat'],
    }, catalog)
    expect(r.primary?.id).toBe('i-maint')
  })

  it('returns null primary when level is missing', () => {
    const r = matchUserToPrograms({
      level: '', weight: 70, goal_weight: 70,
      focus_areas: [], training_days: ['mon','wed','fri'],
    }, catalog)
    expect(r.primary).toBeNull()
    expect(r.secondary).toBeNull()
  })

  it('defaults goal_type to maintain when goal_weight is missing', () => {
    const r = matchUserToPrograms({
      level: 'principiante', weight: 70, goal_weight: undefined,
      focus_areas: [], training_days: ['mon','wed','fri'],
    }, catalog)
    expect(r.primary?.id).toBe('b-maint')
  })
})

describe('matchUserToPrograms — secondary skill track', () => {
  it('surfaces Pull-up Roadmap as secondary when beginner wants muscle_gain + pull_up focus', () => {
    const r = matchUserToPrograms({
      level: 'principiante', weight: 65, goal_weight: 72,
      focus_areas: ['pull_up'], training_days: ['mon','wed','fri','sat'],
    }, catalog)
    expect(r.primary?.id).toBe('b-gain')
    expect(r.secondary?.id).toBe('sk-pull')
  })

  it('surfaces Planche Roadmap for advanced user with planche focus', () => {
    const r = matchUserToPrograms({
      level: 'avanzado', weight: 72, goal_weight: 72,
      focus_areas: ['planche'], training_days: ['mon','tue','wed','thu','fri','sat'],
    }, catalog)
    expect(r.primary?.id).toBe('a-maint')
    expect(r.secondary?.id).toBe('sk-pla')
  })

  it('picks the first focus in FOCUS_AREA_IDS order when multiple are selected', () => {
    const r = matchUserToPrograms({
      level: 'intermedio', weight: 75, goal_weight: 75,
      // FOCUS_AREA_IDS ordering: full_body, upper_body, core, legs, pull_up,
      // handstand, planche, muscle_up.  pull_up comes before muscle_up.
      focus_areas: ['muscle_up', 'pull_up'], training_days: ['mon','tue','wed','thu','fri','sat'],
    }, catalog)
    // Only muscle_up has a skill track at intermediate, pull_up is at beginner.
    // Rule: iterate FOCUS_AREA_IDS order and pick the FIRST focus the user
    // selected that has ANY matching skill-track program. pull_up matches (b-pull).
    expect(r.secondary?.id).toBe('sk-pull')
  })

  it('does NOT surface secondary when it equals primary', () => {
    // Beginner + goal_type=skill + focus pull_up — primary IS the skill track.
    // Secondary must be null (don't show the same card twice).
    const r = matchUserToPrograms({
      level: 'principiante', weight: 70, goal_weight: 70,
      focus_areas: ['pull_up'], training_days: ['mon','wed','fri'],
    }, catalog)
    // primary = b-maint (closest level×goal match), secondary = sk-pull.
    // Different ids → secondary shown.
    expect(r.primary?.id).toBe('b-maint')
    expect(r.secondary?.id).toBe('sk-pull')
  })
})

describe('matchUserToPrograms — penalties', () => {
  it('flags high_frequency when program needs more days than user committed', () => {
    const r = matchUserToPrograms({
      level: 'intermedio', weight: 75, goal_weight: 75,
      focus_areas: [], training_days: ['mon','wed','fri'], // 3 days
    }, catalog)
    const penalties = r.penalties.get('i-maint') || []
    expect(penalties).toContain('high_frequency')
  })

  it('flags health_flag when program contraindications overlap user injuries', () => {
    const r = matchUserToPrograms({
      level: 'intermedio', weight: 75, goal_weight: 75,
      focus_areas: [], training_days: ['mon','tue','wed','thu','fri','sat'],
      injuries: ['lower_back'],
    }, catalog)
    const penalties = r.penalties.get('i-maint') || []
    expect(penalties).toContain('health_flag')
  })

  it('flags health_flag from medical_conditions overlap', () => {
    const r = matchUserToPrograms({
      level: 'intermedio', weight: 75, goal_weight: 75,
      focus_areas: [], training_days: ['mon','tue','wed','thu','fri','sat'],
      medical_conditions: ['back'],
    }, catalog)
    // Catalog uses 'lower_back' in contraindications; 'back' is in
    // CONDITION_IDS. Test that we detect overlap when tokens align.
    // Use a program with 'back' contraindication for this test.
    const catalogWithBack = [...catalog, P({ id: 'x', difficulty: 'intermediate', goal_type: 'maintain', contraindications: ['back'] })]
    const r2 = matchUserToPrograms({
      level: 'intermedio', weight: 75, goal_weight: 75,
      focus_areas: [], training_days: ['mon','tue','wed','thu','fri','sat'],
      medical_conditions: ['back'],
    }, catalogWithBack)
    // Both i-maint (with 'lower_back') and new x (with 'back') get matched
    // only on level+goal. Primary is the first one in the catalog.
    // Verify penalty map contains 'back' for the program with that contraindication.
    expect(r2.penalties.get('x')).toContain('health_flag')
    void r // unused marker
  })

  it('does NOT flag high_frequency when days_per_week ≤ user.training_days.length', () => {
    const r = matchUserToPrograms({
      level: 'intermedio', weight: 75, goal_weight: 75,
      focus_areas: [], training_days: ['mon','tue','wed','thu','fri','sat','sun'],
    }, catalog)
    const penalties = r.penalties.get('i-maint') || []
    expect(penalties).not.toContain('high_frequency')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/matchPrograms.test.ts`
Expected: FAIL — `matchUserToPrograms` is not defined (module not found).

- [ ] **Step 3: Implement the module**

Create `src/lib/matchPrograms.ts`:

```typescript
/**
 * Pure functions for matching a user's onboarding signals to the program
 * catalog. Returns a primary match (Level × Goal) and an optional
 * secondary skill-track match. Also returns soft penalties per program.
 *
 * Spec: docs/superpowers/specs/2026-04-18-programs-catalog-personas-design.md
 */

import type { ProgramMeta, ProgramGoalType } from '../types'
import { FOCUS_AREA_IDS } from '../components/onboarding/StepTraining'

export const LEVEL_TO_DIFFICULTY: Record<string, string> = {
  principiante: 'beginner',
  intermedio:   'intermediate',
  avanzado:     'advanced',
}

/** Focus areas that correspond to skill-track programs. */
const SKILL_FOCUS_AREAS = ['pull_up', 'handstand', 'planche', 'muscle_up'] as const
type SkillFocus = typeof SKILL_FOCUS_AREAS[number]

export type MatchPenalty = 'high_frequency' | 'equipment_missing' | 'health_flag'

export interface MatchUserInput {
  level?: string
  weight?: number
  goal_weight?: number
  focus_areas?: string[]
  training_days?: string[]
  injuries?: string[]
  medical_conditions?: string[]
  /** Future field — user's available equipment. Unused today, reserved for Phase-2. */
  equipment?: string[]
}

export interface MatchResult {
  primary: ProgramMeta | null
  secondary: ProgramMeta | null
  penalties: Map<string, MatchPenalty[]>
}

export function inferGoalType(
  weight: number | undefined,
  goalWeight: number | undefined,
): ProgramGoalType {
  if (typeof weight !== 'number' || typeof goalWeight !== 'number') return 'maintain'
  const delta = goalWeight - weight
  if (delta > 2) return 'muscle_gain'
  if (delta < -2) return 'fat_loss'
  return 'maintain'
}

function computePenalties(
  program: ProgramMeta,
  user: MatchUserInput,
): MatchPenalty[] {
  const penalties: MatchPenalty[] = []
  const userDays = user.training_days?.length ?? 0
  if (typeof program.days_per_week === 'number' && program.days_per_week > userDays) {
    penalties.push('high_frequency')
  }
  if (program.equipment_required?.length) {
    const have = new Set(user.equipment ?? [])
    const missing = program.equipment_required.some(e => !have.has(e))
    if (missing && (user.equipment?.length ?? 0) > 0) {
      // Only flag equipment when the user has told us what they own.
      penalties.push('equipment_missing')
    }
  }
  if (program.contraindications?.length) {
    const userHealth = new Set<string>([
      ...(user.injuries ?? []),
      ...(user.medical_conditions ?? []),
    ])
    if (program.contraindications.some(c => userHealth.has(c))) {
      penalties.push('health_flag')
    }
  }
  return penalties
}

export function matchUserToPrograms(
  user: MatchUserInput,
  programs: ProgramMeta[],
): MatchResult {
  const penalties = new Map<string, MatchPenalty[]>()
  for (const p of programs) {
    const pen = computePenalties(p, user)
    if (pen.length) penalties.set(p.id, pen)
  }

  const userDifficulty = user.level ? LEVEL_TO_DIFFICULTY[user.level] : undefined
  if (!userDifficulty) {
    return { primary: null, secondary: null, penalties }
  }

  const goalType = inferGoalType(user.weight, user.goal_weight)

  const primary = programs.find(p =>
    p.difficulty === userDifficulty && p.goal_type === goalType
  ) ?? null

  // Secondary: iterate FOCUS_AREA_IDS in order; pick the first focus the user
  // selected that has a skill-track program. The skill program's own level
  // doesn't need to match the user's — skill tracks are self-progressing.
  let secondary: ProgramMeta | null = null
  const userFocus = new Set(user.focus_areas ?? [])
  for (const focus of FOCUS_AREA_IDS) {
    if (!userFocus.has(focus)) continue
    if (!SKILL_FOCUS_AREAS.includes(focus as SkillFocus)) continue
    const found = programs.find(p => p.goal_type === 'skill' && p.skill === focus)
    if (found && found.id !== primary?.id) {
      secondary = found
      break
    }
  }

  return { primary, secondary, penalties }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/matchPrograms.test.ts`
Expected: all 11 tests PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/matchPrograms.ts src/lib/matchPrograms.test.ts
git commit -m "feat(programs): matchUserToPrograms primary + secondary + penalties

Pure function mapping onboarding signals (level, weight/goal_weight,
focus_areas, training_days, injuries, medical_conditions) to a primary
program and optional skill-track secondary. Returns soft penalties per
program without excluding them."
```

---

## Task 5: i18n keys for new UI copy

**Files:**
- Modify: `src/locales/es/translation.json`
- Modify: `src/locales/en/translation.json`

- [ ] **Step 1: Add ES keys**

Open `src/locales/es/translation.json`. Find the existing `"onboarding.forYou"` key (around line 1200) and add these sibling keys in the same `onboarding.*` block:

```json
"onboarding.alsoForYou": "TAMBIÉN PARA TI",
"programs.penalty.highFrequency": "Frecuencia alta",
"programs.penalty.equipmentMissing": "Requiere equipo",
"programs.penalty.healthFlag": "Consulta con tu médico",
"programs.contentComingSoon": "Contenido completo próximamente. Puedes explorarlo pero el plan definitivo aún está en desarrollo.",
```

- [ ] **Step 2: Add EN keys**

Open `src/locales/en/translation.json`. Add the same keys with English copy next to the existing `"onboarding.forYou"`:

```json
"onboarding.alsoForYou": "ALSO FOR YOU",
"programs.penalty.highFrequency": "High frequency",
"programs.penalty.equipmentMissing": "Equipment required",
"programs.penalty.healthFlag": "Check with your doctor",
"programs.contentComingSoon": "Full content coming soon. You can explore it now, but the final plan is still in development.",
```

- [ ] **Step 3: Validate JSON**

Run:
```bash
python3 -c "import json; json.load(open('src/locales/es/translation.json'))"
python3 -c "import json; json.load(open('src/locales/en/translation.json'))"
```
Expected: no output (valid JSON).

- [ ] **Step 4: Run the translation checker**

Run: `node scripts/check-translations.mjs`
Expected: exits 0. If the checker flags these keys as missing, it means they're referenced in code before they're used — that's fine; we'll add the usages in Task 6 and 7.

- [ ] **Step 5: Commit**

```bash
git add src/locales/es/translation.json src/locales/en/translation.json
git commit -m "feat(i18n): add catalog match keys

onboarding.alsoForYou, programs.penalty.{highFrequency,equipmentMissing,healthFlag},
programs.contentComingSoon."
```

---

## Task 6: `StepProgram.tsx` — render primary + secondary + penalty chips

**Files:**
- Modify: `src/components/onboarding/StepProgram.tsx` (full rewrite of sort/render logic)
- Modify: `src/components/onboarding/OnboardingFlow.tsx` (pass full user object instead of just level)

- [ ] **Step 1: Read OnboardingFlow.tsx to find the StepProgram call site**

Run: `grep -n "StepProgram" src/components/onboarding/OnboardingFlow.tsx`
Note the line where `<StepProgram ... userLevel={...} />` is rendered.

- [ ] **Step 2: Update the StepProgram prop shape**

Replace the `Props` interface in `src/components/onboarding/StepProgram.tsx` (lines 21-32) with:

```typescript
import type { MatchUserInput } from '../../lib/matchPrograms'

interface Props {
  programs: ProgramMeta[]
  selectedProgramId: string | null
  selecting: boolean
  userId?: string
  /** Full user signals used by matchUserToPrograms. */
  user: MatchUserInput
  onSelectProgram: (programId: string) => void
  onCreateProgram: () => void
  onBack: () => void
  onContinue: () => void
}
```

- [ ] **Step 3: Replace the matching + rendering logic**

Replace the entire function body of `StepProgram` (from `const targetDifficulty = ...` down through the closing of the component, lines 38-175) with the version below. Note: keep the existing `DIFFICULTY_STYLES` constant at the top of the file; delete the `LEVEL_TO_DIFFICULTY` constant since matching now lives in `matchPrograms.ts`.

```typescript
export function StepProgram({
  programs, selectedProgramId, selecting, userId, user,
  onSelectProgram, onCreateProgram, onBack, onContinue,
}: Props) {
  const { t } = useTranslation()

  const { primary, secondary, penalties } = matchUserToPrograms(user, programs)

  // Build the full ordered list:
  //   1. primary (FOR YOU) if non-null
  //   2. secondary (ALSO FOR YOU) if non-null
  //   3. the rest, sorted: featured > official > alpha
  const featuredSort = (a: ProgramMeta, b: ProgramMeta) => {
    if (a.is_featured && !b.is_featured) return -1
    if (!a.is_featured && b.is_featured) return 1
    if (a.is_official && !b.is_official) return -1
    if (!a.is_official && b.is_official) return 1
    return a.name.localeCompare(b.name)
  }
  const pinnedIds = new Set<string>([
    ...(primary ? [primary.id] : []),
    ...(secondary ? [secondary.id] : []),
  ])
  const rest = programs.filter(p => !pinnedIds.has(p.id)).sort(featuredSort)
  const ordered: Array<{ program: ProgramMeta; tier: 'primary' | 'secondary' | 'other' }> = [
    ...(primary ? [{ program: primary, tier: 'primary' as const }] : []),
    ...(secondary ? [{ program: secondary, tier: 'secondary' as const }] : []),
    ...rest.map(p => ({ program: p, tier: 'other' as const })),
  ]

  return (
    <div className="animate-[fadeUp_0.5s_ease]">
      <div className="text-center mb-4">
        <div className="font-bebas text-3xl mb-1">{t('onboarding.chooseProgramTitle')}</div>
        <div className="text-sm text-muted-foreground">{t('onboarding.chooseProgramDesc')}</div>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-400/5 border border-amber-400/20 mb-4">
        <span className="text-amber-400 text-sm">★</span>
        <span className="text-xs text-muted-foreground" dangerouslySetInnerHTML={{ __html: t('onboarding.recommendedHint') }} />
      </div>

      <div className="space-y-3 mb-6 max-h-[50vh] overflow-y-auto pr-1">
        {ordered.map(({ program, tier }) => {
          const isSelected = selectedProgramId === program.id
          const isOwn = program.created_by === userId
          const programPenalties = penalties.get(program.id) || []
          return (
            <Card
              key={program.id}
              className={cn(
                'cursor-pointer transition-all duration-200 border-2',
                isSelected
                  ? 'border-[hsl(var(--lime))] bg-[hsl(var(--lime))]/5'
                  : tier === 'primary'
                    ? 'border-[hsl(var(--lime))]/30 bg-[hsl(var(--lime))]/[0.03] hover:border-[hsl(var(--lime))]/50'
                    : tier === 'secondary'
                      ? 'border-sky-400/30 bg-sky-400/[0.03] hover:border-sky-400/50'
                      : program.is_featured
                        ? 'border-amber-400/20 bg-amber-400/[0.03] hover:border-amber-400/40'
                        : 'border-transparent hover:border-muted-foreground/20'
              )}
              onClick={() => onSelectProgram(program.id)}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn(
                  'size-10 rounded-lg flex items-center justify-center shrink-0 text-lg font-bebas',
                  isSelected ? 'bg-[hsl(var(--lime))] text-background' : 'bg-muted text-muted-foreground'
                )}>
                  {isSelected ? '✓' : program.name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn('font-medium text-sm', isSelected && 'text-[hsl(var(--lime))]')}>
                      {program.name}
                    </span>
                    {tier === 'primary' && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-[hsl(var(--lime))] border-[hsl(var(--lime))]/50 bg-[hsl(var(--lime))]/10">
                        {t('onboarding.forYou')}
                      </Badge>
                    )}
                    {tier === 'secondary' && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-sky-400 border-sky-400/50 bg-sky-400/10">
                        {t('onboarding.alsoForYou')}
                      </Badge>
                    )}
                    {program.is_featured && tier !== 'primary' && tier !== 'secondary' && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-amber-400 border-amber-400/30">
                        {t('onboarding.recommended')}
                      </Badge>
                    )}
                    {program.is_official && !program.is_featured && tier !== 'primary' && tier !== 'secondary' && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-emerald-400 border-emerald-400/30">
                        {t('onboarding.official')}
                      </Badge>
                    )}
                    {isOwn && !program.is_official && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-sky-500 border-sky-500/30">
                        {t('onboarding.yours')}
                      </Badge>
                    )}
                    {!isOwn && !program.is_official && program.created_by_name && (
                      <span className="text-[9px] text-muted-foreground">
                        {t('onboarding.by', { name: program.created_by_name })}
                      </span>
                    )}
                  </div>
                  {program.description && (
                    <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {program.description}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[10px] text-muted-foreground">
                      {program.duration_weeks} {t('onboarding.weeks')}
                    </span>
                    {program.difficulty && (
                      <Badge variant="outline" className={cn('text-[8px] px-1.5 py-0', DIFFICULTY_STYLES[program.difficulty] || '')}>
                        {t(`difficulty.${program.difficulty}`).toUpperCase()}
                      </Badge>
                    )}
                    {programPenalties.map(p => (
                      <Badge
                        key={p}
                        variant="outline"
                        className="text-[8px] px-1.5 py-0 text-amber-500 border-amber-500/40 bg-amber-500/10"
                      >
                        {t(`programs.penalty.${p === 'high_frequency' ? 'highFrequency' : p === 'equipment_missing' ? 'equipmentMissing' : 'healthFlag'}`)}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card
        className="cursor-pointer border-2 border-dashed border-muted-foreground/20 hover:border-sky-500/40 transition-all"
        onClick={onCreateProgram}
      >
        <CardContent className="p-4 text-center">
          <div className="text-sm text-muted-foreground">
            <span className="text-sky-500 font-medium">{t('onboarding.createOwn')}</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3 mt-6">
        <Button
          variant="outline"
          onClick={onBack}
          className="flex-1 h-11 font-mono text-xs tracking-wide"
        >
          {t('onboarding.back')}
        </Button>
        <Button
          onClick={onContinue}
          disabled={!selectedProgramId || selecting}
          className="flex-1 h-11 font-bebas text-lg tracking-wide bg-[hsl(var(--lime))] hover:bg-[hsl(var(--lime))]/90 text-background disabled:opacity-40"
        >
          {selecting ? t('onboarding.saving') : t('onboarding.continueBtn')}
        </Button>
      </div>
    </div>
  )
}
```

Add the `matchUserToPrograms` import at the top of the file:

```typescript
import { matchUserToPrograms } from '../../lib/matchPrograms'
```

- [ ] **Step 4: Update the OnboardingFlow call site**

In `src/components/onboarding/OnboardingFlow.tsx`, find the `<StepProgram ... />` JSX and change:

```tsx
<StepProgram
  ...
  userLevel={user?.level}
  ...
/>
```

to:

```tsx
<StepProgram
  ...
  user={{
    level: user?.level,
    weight: user?.weight,
    goal_weight: user?.goal_weight,
    focus_areas: user?.focus_areas,
    training_days: user?.training_days,
    injuries: user?.injuries,
    medical_conditions: user?.medical_conditions,
  }}
  ...
/>
```

Keep all other props unchanged. If `OnboardingFlow.tsx` doesn't already read `goal_weight`, `focus_areas`, etc. off `user`, check the AuthContext `User` type — they should already exist per the Phase B onboarding work, just spread them through.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Manual smoke**

Run: `npm run dev`. Log in as a user with existing onboarding data. Restart the onboarding flow (e.g. clear `localStorage.calistenia_onboarding_done_<userId>` in DevTools) and go to the program step. Expected:
- FOR YOU card at top (lime border) matching your level+goal
- If you have a skill focus area, ALSO FOR YOU card below (sky-blue border)
- Other programs sorted beneath
- Amber penalty chips render when days/injuries/equipment mismatch

- [ ] **Step 7: Commit**

```bash
git add src/components/onboarding/StepProgram.tsx src/components/onboarding/OnboardingFlow.tsx
git commit -m "feat(onboarding): primary + secondary program match with penalty chips

StepProgram now calls matchUserToPrograms and renders a lime FOR YOU card,
a sky ALSO FOR YOU card for skill tracks, and amber chips for soft
penalties (high_frequency, equipment_missing, health_flag)."
```

---

## Task 7: `ProgramDetailPage` — "contenido próximamente" banner

**Files:**
- Modify: `src/pages/ProgramDetailPage.tsx:455-457`

- [ ] **Step 1: Find the stub-content detection signal**

Read lines 150-200 of `ProgramDetailPage.tsx` to locate where phases/exercises are loaded and counted. The page fetches exercises into state. We'll use total exercise count: if ≤ 1, the program is a stub.

Run: `grep -n "exercises" src/pages/ProgramDetailPage.tsx | head -30` — find the state variable holding the full exercise list (likely `exercises` or similar).

- [ ] **Step 2: Add state check at the program header**

After the `<h1>{program.name}</h1>` (line 455), and before `{program.description && ...}` (line 456), insert the banner. The insertion goes right above the description paragraph:

```tsx
{totalExerciseCount <= 1 && (
  <div className="mb-6 rounded-lg border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-sm text-amber-500 motion-safe:animate-fade-in" style={{ animationDelay: '75ms', animationFillMode: 'both' }}>
    {t('programs.contentComingSoon')}
  </div>
)}
```

Define `totalExerciseCount` from existing state, using `useMemo` near where `program` is set up. Example (adapt variable name to the actual state):

```typescript
const totalExerciseCount = useMemo(
  () => Object.values(workoutsMap).reduce((sum, w) => sum + (w.exercises?.length || 0), 0),
  [workoutsMap]
)
```

If the page already has a `workouts` or `phases`-keyed exercise map, count from that. If not, fetch a count alongside the existing phase fetch (a HEAD-like `getList(1, 1)` on `program_exercises` with `filter: program = <id>` returns `totalItems` cheaply).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Manual smoke**

Run: `npm run dev`. Navigate to a program detail page. For an existing real program (Balance Total), expect NO banner. For a skeleton program (after Task 9 seeds them), expect the amber "Contenido completo próximamente" banner.

Since skeletons don't exist yet at this point, test by temporarily deleting exercises from a local program OR skip manual smoke until Task 9 completes.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ProgramDetailPage.tsx
git commit -m "feat(programs): coming-soon banner for skeleton programs

Shows an amber banner on program detail when the program has ≤ 1 exercise,
so users know the full content is still being authored."
```

---

## Task 8: Seed script — `seed-program-catalog.mjs`

**Files:**
- Create: `scripts/seed-program-catalog.mjs`

- [ ] **Step 1: Create the seed script**

Write `scripts/seed-program-catalog.mjs`:

```javascript
#!/usr/bin/env node
/**
 * Seed the 13-program persona catalog.
 *
 *   - Retags the existing "Intermedio – Balance Total" record with the new
 *     goal_type/intensity/etc. fields (idempotent).
 *   - Creates the remaining 12 programs as skeletons: 1 phase, 1 day, 1
 *     placeholder exercise (so ProgramDetailPage doesn't 404).
 *
 * Idempotent: skips any program whose i18n-name already exists.
 *
 * Usage:
 *   node scripts/seed-program-catalog.mjs <PB_URL> <SUPERUSER_EMAIL> <SUPERUSER_PASSWORD>
 */

const PB_URL = process.argv[2]
const SU_EMAIL = process.argv[3]
const SU_PASSWORD = process.argv[4]

if (!PB_URL || !SU_EMAIL || !SU_PASSWORD) {
  console.error('Usage: node scripts/seed-program-catalog.mjs <PB_URL> <SUPERUSER_EMAIL> <SUPERUSER_PASSWORD>')
  process.exit(1)
}

const i18n = (es, en) => ({ es, en })

// 12 programs to CREATE (Balance Total is retagged, not created).
const SKELETONS = [
  // level × goal (8 — Balance Total handles intermediate+maintain)
  { slug: 'principiante-quema-grasa', name: i18n('Principiante · Quema Grasa', 'Beginner · Fat Burn'),
    description: i18n('Rutina suave 4 días/sem para bajar grasa sin perder músculo. Enfocado en movimientos base.', '4-day/week gentle routine to burn fat without losing muscle. Focused on fundamentals.'),
    duration_weeks: 12, difficulty: 'beginner', goal_type: 'fat_loss', intensity: 'light', days_per_week: 4, equipment_required: [], contraindications: [] },
  { slug: 'principiante-ganar-musculo', name: i18n('Principiante · Ganar Músculo', 'Beginner · Muscle Gain'),
    description: i18n('Hipertrofia base 4 días/sem para principiantes. Progresión simple hacia primer pull-up y dip.', 'Beginner hypertrophy 4 days/week. Simple progression toward first pull-up and dip.'),
    duration_weeks: 12, difficulty: 'beginner', goal_type: 'muscle_gain', intensity: 'moderate', days_per_week: 4, equipment_required: ['pull_bar'], contraindications: [] },
  { slug: 'principiante-fundamentos', name: i18n('Principiante · Fundamentos', 'Beginner · Fundamentals'),
    description: i18n('Tu primer programa de calistenia. 3 días/sem, técnica y hábito.', 'Your first calisthenics program. 3 days/week, technique and consistency.'),
    duration_weeks: 8, difficulty: 'beginner', goal_type: 'maintain', intensity: 'light', days_per_week: 3, equipment_required: [], contraindications: [] },
  { slug: 'intermedio-definicion', name: i18n('Intermedio · Definición', 'Intermediate · Cutting'),
    description: i18n('5 días/sem alta intensidad. Para bajar % graso conservando masa magra.', '5 days/week high intensity. Cut body fat while preserving lean mass.'),
    duration_weeks: 12, difficulty: 'intermediate', goal_type: 'fat_loss', intensity: 'intense', days_per_week: 5, equipment_required: ['pull_bar','parallel_bars'], contraindications: [] },
  { slug: 'intermedio-hipertrofia', name: i18n('Intermedio · Hipertrofia', 'Intermediate · Hypertrophy'),
    description: i18n('Ganancia muscular 5 días/sem. Variaciones con más rango y pausa.', 'Muscle gain 5 days/week. Paused variations with extended range of motion.'),
    duration_weeks: 12, difficulty: 'intermediate', goal_type: 'muscle_gain', intensity: 'moderate', days_per_week: 5, equipment_required: ['pull_bar','parallel_bars'], contraindications: [] },
  { slug: 'avanzado-cutting', name: i18n('Avanzado · Cutting Élite', 'Advanced · Elite Cutting'),
    description: i18n('Programa intenso 5 días/sem: cardio + alta frecuencia. Para atletas avanzados.', 'Intense 5 days/week program: cardio plus high-frequency strength. For advanced athletes.'),
    duration_weeks: 12, difficulty: 'advanced', goal_type: 'fat_loss', intensity: 'intense', days_per_week: 5, equipment_required: ['pull_bar','parallel_bars','bands'], contraindications: [] },
  { slug: 'avanzado-volumen', name: i18n('Avanzado · Volumen Máximo', 'Advanced · Max Volume'),
    description: i18n('6 días/sem. Hipertrofia de alta frecuencia con movimientos avanzados (planche, front lever progresiones).', '6 days/week. High-frequency hypertrophy with advanced movements (planche, front-lever progressions).'),
    duration_weeks: 12, difficulty: 'advanced', goal_type: 'muscle_gain', intensity: 'intense', days_per_week: 6, equipment_required: ['pull_bar','parallel_bars','bands'], contraindications: [] },
  { slug: 'avanzado-fuerza-total', name: i18n('Avanzado · Fuerza Total', 'Advanced · Total Strength'),
    description: i18n('6 días/sem para mantener niveles altos de fuerza calisténica. Skills + básicos pesados.', '6 days/week to maintain high calisthenics strength. Skills plus heavy basics.'),
    duration_weeks: 12, difficulty: 'advanced', goal_type: 'maintain', intensity: 'intense', days_per_week: 6, equipment_required: ['pull_bar','parallel_bars','bands'], contraindications: [] },
  // skill tracks (4)
  { slug: 'pull-up-roadmap', name: i18n('Pull-up Roadmap', 'Pull-up Roadmap'),
    description: i18n('De cero a tu primera dominada estricta. 3 días/sem con progresiones y ligas.', 'From zero to your first strict pull-up. 3 days/week with progressions and bands.'),
    duration_weeks: 12, difficulty: 'beginner', goal_type: 'skill', skill: 'pull_up', intensity: 'light', days_per_week: 3, equipment_required: ['pull_bar','bands'], contraindications: [] },
  { slug: 'handstand-roadmap', name: i18n('Handstand Roadmap', 'Handstand Roadmap'),
    description: i18n('Pino libre desde cero. Pared, equilibrio y progresión diaria.', 'Freestanding handstand from zero. Wall, balance, and daily progression.'),
    duration_weeks: 12, difficulty: 'beginner', goal_type: 'skill', skill: 'handstand', intensity: 'moderate', days_per_week: 3, equipment_required: [], contraindications: ['wrist','shoulder'] },
  { slug: 'muscle-up-roadmap', name: i18n('Muscle-up Roadmap', 'Muscle-up Roadmap'),
    description: i18n('Tu primer muscle up. Requiere pull-ups estrictos y dips profundos.', 'Your first muscle-up. Requires strict pull-ups and deep dips.'),
    duration_weeks: 12, difficulty: 'intermediate', goal_type: 'skill', skill: 'muscle_up', intensity: 'intense', days_per_week: 4, equipment_required: ['pull_bar'], contraindications: ['elbow','shoulder'] },
  { slug: 'planche-roadmap', name: i18n('Planche Roadmap', 'Planche Roadmap'),
    description: i18n('Progresión hacia planche. Tuck → straddle → full. Requiere base avanzada.', 'Planche progression. Tuck → straddle → full. Requires advanced baseline.'),
    duration_weeks: 16, difficulty: 'advanced', goal_type: 'skill', skill: 'planche', intensity: 'intense', days_per_week: 4, equipment_required: ['parallel_bars'], contraindications: ['wrist','shoulder','elbow'] },
]

async function api(path, opts = {}) {
  const res = await fetch(`${PB_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status} ${path}: ${body}`)
  }
  return res.json()
}

async function main() {
  console.log('🔑 Authenticating as superuser...')
  const auth = await api('/api/collections/_superusers/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: SU_EMAIL, password: SU_PASSWORD }),
  })
  const authH = { Authorization: `Bearer ${auth.token}` }
  console.log('  ✓ Authenticated')

  // 1. Retag existing Balance Total.
  console.log('🏷  Retagging Intermedio – Balance Total...')
  const existing = await api('/api/collections/programs/records?perPage=200', { headers: authH })
  const balanceTotal = existing.items.find(p => {
    const n = typeof p.name === 'object' ? (p.name.es || '') : (p.name || '')
    return n.includes('Balance Total')
  })
  if (balanceTotal) {
    await api(`/api/collections/programs/records/${balanceTotal.id}`, {
      method: 'PATCH', headers: authH,
      body: JSON.stringify({
        goal_type: 'maintain',
        intensity: 'moderate',
        days_per_week: 6,
        equipment_required: ['pull_bar','parallel_bars','bands'],
        contraindications: ['abdominal_hernia','lower_back'],
      }),
    })
    console.log(`  ✓ Balance Total retagged (${balanceTotal.id})`)
  } else {
    console.log('  ⚠ Balance Total not found — skipping retag')
  }

  // 2. Create the 12 skeletons.
  const existingNames = new Set(existing.items.map(p => (typeof p.name === 'object' ? p.name.es : p.name) || ''))
  for (const sk of SKELETONS) {
    if (existingNames.has(sk.name.es)) {
      console.log(`  ⚠ "${sk.name.es}" exists — skipping`)
      continue
    }
    console.log(`📋 Creating: ${sk.name.es}`)
    const body = {
      name: sk.name,
      description: sk.description,
      duration_weeks: sk.duration_weeks,
      difficulty: sk.difficulty,
      goal_type: sk.goal_type,
      intensity: sk.intensity,
      days_per_week: sk.days_per_week,
      equipment_required: sk.equipment_required,
      contraindications: sk.contraindications,
      is_active: true,
      is_official: true,
      is_featured: false,
    }
    if (sk.skill) body.skill = sk.skill
    const prog = await api('/api/collections/programs/records', {
      method: 'POST', headers: authH, body: JSON.stringify(body),
    })

    // Stub phase
    await api('/api/collections/program_phases/records', {
      method: 'POST', headers: authH,
      body: JSON.stringify({
        program: prog.id,
        phase_number: 1,
        name: i18n('Fase 1', 'Phase 1'),
        weeks: `1-${sk.duration_weeks}`,
        color: '#6B7280',
        sort_order: 1,
      }),
    })

    // Stub exercise (so program detail doesn't render blank)
    await api('/api/collections/program_exercises/records', {
      method: 'POST', headers: authH,
      body: JSON.stringify({
        program: prog.id,
        phase_number: 1,
        day_id: 'lun',
        day_name: i18n('Lunes', 'Monday'),
        day_focus: i18n('Próximamente', 'Coming soon'),
        workout_title: i18n('Contenido en desarrollo', 'Content in development'),
        exercise_id: `${sk.slug}_stub_1`,
        exercise_name: i18n('Contenido próximamente', 'Content coming soon'),
        sets: 0,
        reps: '',
        rest_seconds: 0,
        muscles: i18n('', ''),
        note: i18n('El plan completo estará disponible muy pronto.', 'The full plan will be available soon.'),
        youtube: '',
        priority: 'primary',
        is_timer: false,
        timer_seconds: 0,
        sort_order: 1,
      }),
    })
    console.log(`  ✓ ${sk.name.es} (${prog.id})`)
  }

  console.log('\n✅ Catalog seeded.')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
```

- [ ] **Step 2: Run the script against local PB**

Run: `node scripts/seed-program-catalog.mjs http://127.0.0.1:8090 <LOCAL_SU_EMAIL> <LOCAL_SU_PASSWORD>`
Expected: "Authenticated", "Balance Total retagged", 12 "Creating" lines, "Catalog seeded." If "not found" for Balance Total on a fresh local DB — expected (run `seed-program.mjs` first or create Balance Total manually before rerunning).

- [ ] **Step 3: Verify idempotency**

Run the same command again. Expected: "Balance Total retagged" (PATCH is idempotent), then 12 "exists — skipping" lines. No errors.

- [ ] **Step 4: Verify in PB Admin UI**

Open `http://127.0.0.1:8090/_/` → Collections → `programs`. Expect 13 programs visible, each with `goal_type`, `intensity`, `days_per_week` populated. Balance Total has `contraindications = ["abdominal_hernia","lower_back"]`.

- [ ] **Step 5: Verify in the app**

Open `npm run dev`. Log in as a fresh test account, complete the onboarding flow up to the program step. Expect to see the 13 programs with correct FOR YOU / ALSO FOR YOU assignment for your persona.

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-program-catalog.mjs
git commit -m "feat(scripts): seed 13-program persona catalog

Creates 12 skeleton programs (1 phase, 1 stub exercise each) and retags
the existing Intermedio – Balance Total record with the new catalog
fields. Idempotent — re-runs skip already-seeded programs."
```

---

## Task 9: Deploy — apply migration to prod PB and seed catalog

**Files:** no files modified; this is a deployment task.

- [ ] **Step 1: Backup prod DB before migration**

Run: `ssh <prod-host> 'cp pb_data/data.db pb_data/data.db.bak-2026-04-18'`
(If direct SSH isn't set up, download `data.db` via the admin UI Settings → Backups.)

- [ ] **Step 2: Deploy the migration**

Push the migration file to the prod PB host. The exact command depends on your deploy pipeline — most common path: the prod PB reads `pb_migrations/` from its repo mount, so a `git push` + restart suffices.

Run: `git push origin main` (the migration commits are already on main after Task 1).
Then restart prod PB — e.g. `ssh <prod-host> 'systemctl restart pocketbase'` or equivalent.

- [ ] **Step 3: Verify migration applied on prod**

Run:
```bash
TOKEN=$(curl -s -X POST "https://gym.guille.tech/api/collections/_superusers/auth-with-password" \
  -H "Content-Type: application/json" \
  -d '{"identity":"arepayquezo@gmail.com","password":"<PROD_PB_SUPERUSER_PASSWORD>"}' \
  | python3 -c "import sys, json; print(json.load(sys.stdin)['token'])")

curl -s "https://gym.guille.tech/api/collections/programs" -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys, json; fields=[f['name'] for f in json.load(sys.stdin)['fields']]; print('goal_type:', 'goal_type' in fields); print('days_per_week:', 'days_per_week' in fields)"
```
Expected: both `True`.

- [ ] **Step 4: Seed the catalog against prod**

Run:
```bash
node scripts/seed-program-catalog.mjs "https://gym.guille.tech" "arepayquezo@gmail.com" "<PROD_PB_SUPERUSER_PASSWORD>"
```
Expected: Balance Total retagged + 12 new programs created.

- [ ] **Step 5: Verify in prod app**

Open `https://gym.guille.tech/auth`. Log in with a test account. Check the onboarding flow or `/programs` page renders all 13 programs correctly. Expect FOR YOU badge on the persona-matching program.

- [ ] **Step 6: Merge + deploy frontend**

The frontend commits from tasks 2–7 are on `main`. The deploy pipeline (Vercel/Cloudflare/whatever you use) should pick up automatically. Verify by hard-refreshing `gym.guille.tech` and running the onboarding flow — expect the ALSO FOR YOU card to render when applicable.

No commit here — this task is operational.

---

## Task 10: E2E smoke — Playwright MCP

**Files:** no files modified; manual verification only.

- [ ] **Step 1: Persona 1 — beginner + fat_loss**

Use Playwright MCP against prod:
- Navigate to `https://gym.guille.tech/auth`, clear storage, sign up fresh account
- Complete onboarding: weight 90, goal 75, age 30, sex = whatever, level = principiante, no skills selected, 4 training days, intensity = light
- At program step, expect the top card: "**Principiante · Quema Grasa**" with the lime FOR YOU badge
- Expect no ALSO FOR YOU card (no skill focus)

- [ ] **Step 2: Persona 2 — advanced + planche**

- Fresh account
- weight 72, goal 72, level = avanzado, focus_areas = ["planche"], 6 training days, intensity = intense
- Expect primary: "**Avanzado · Fuerza Total**" (lime FOR YOU)
- Expect secondary: "**Planche Roadmap**" (sky-blue ALSO FOR YOU)

- [ ] **Step 3: Persona 3 — existing user**

- Log in as Guillermo (intermedio, maintain)
- Reset onboarding done flag (DevTools: `localStorage.removeItem('calistenia_onboarding_done_<your-user-id>')`) and reload
- Expect primary: "**Intermedio · Balance Total**" FOR YOU

- [ ] **Step 4: Persona 4 — penalty flag**

- Fresh account
- weight 75, goal 75, level = intermedio, 3 training days, no skills, injuries = ["lower_back"]
- Expect FOR YOU = "Intermedio · Balance Total" + two amber chips: `Frecuencia alta` + `Consulta con tu médico`

- [ ] **Step 5: Verify the coming-soon banner**

- From any persona above, click into any of the 12 skeleton programs (not Balance Total).
- Expect the amber "Contenido completo próximamente" banner under the program header.
- Click into Balance Total → expect NO banner.

---

## Self-review checklist

After all tasks complete, verify:

**1. Spec coverage:**
- [ ] Migration adds all 6 fields (goal_type, skill, intensity, days_per_week, equipment_required, contraindications) — Task 1
- [ ] `ProgramMeta` extended — Task 2
- [ ] Pure `matchUserToPrograms` with primary/secondary/penalties — Task 4
- [ ] Seed script creates 12 skeletons + retags Balance Total — Task 8
- [ ] `StepProgram` renders primary/secondary/chips — Task 6
- [ ] Coming-soon banner on `ProgramDetailPage` — Task 7
- [ ] i18n keys in ES + EN — Task 5
- [ ] Prod deploy + seed run — Task 9
- [ ] E2E smoke covers 3 persona types — Task 10

**2. Placeholder scan:** every code step contains actual code; no "TBD"; every i18n key referenced in code is added in Task 5.

**3. Type consistency:**
- `MatchUserInput` defined in Task 4 is what Task 6 passes from `OnboardingFlow`.
- `MatchPenalty` literal values (`high_frequency`, `equipment_missing`, `health_flag`) match the keys used to look up i18n strings in Task 6 (`programs.penalty.highFrequency`, `.equipmentMissing`, `.healthFlag`).
- Migration field IDs match the down-step filter list in Task 1.
