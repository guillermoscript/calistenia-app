# Welmi Competitive Analysis: Health Conditions & Injuries

## Current State

### What We Have
- **Onboarding** (`OnboardingFlow.tsx`): 3-4 steps — welcome, profile (weight/height/age/sex/level/goal), program selection, orientation. All skippable.
- **User profile** (PocketBase `users` collection): `display_name`, `weight`, `height`, `level`, `goal`, `avatar`, `referral_code`, `timezone`, `age`, `sex`. **No health or injury data.**
- **Programs**: Manually selected from a catalog — no personalization based on user health attributes.
- **Nutrition**: Uses Mifflin-St Jeor formula (weight, height, age, sex, activity level) with no medical condition adjustments.
- **Exercises**: Have a `muscles` text field and optional equipment, but no injury-aware filtering.

### What Welmi Does
**Medical Conditions** (full-page screen):
- Multi-select from: gastric disease, high cholesterol, thyroid disease, diabetes, GLP-1 therapy
- "Algo mas? Cuentanos!" free-text option
- "Sin problemas de salud" skip button at bottom
- Followed by a health disclaimer splash screen ("Guiandote con cuidado" — our app doesn't replace medical advice)

**Injuries** (full-page screen):
- Grid of body parts with photos: shoulder, elbow, wrist, back, ankle, knee, leg
- "Ninguno" (none) option
- Multi-select supported
- Visual: real photos of each body area

**Key observation**: Welmi uses 2 full screens + 1 disclaimer = 3 screens for this data.

## Proposed Implementation

### Data Model Changes (PocketBase)

Add 3 fields to `users` collection:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `medical_conditions` | JSON | `[]` | Array of condition IDs: `["gastric", "cholesterol", "thyroid", "diabetes", "glp1"]` |
| `medical_conditions_other` | Text | `""` | Free-text for conditions not in the list |
| `injuries` | JSON | `[]` | Array of body area IDs: `["shoulder", "elbow", "wrist", "back", "ankle", "knee", "leg"]` |

### UI: Onboarding Integration

**Our advantage: Single compact section within existing profile step**, not 2+ separate full-page screens.

Add a collapsible section to the existing onboarding profile step:

```
[Existing fields: age, weight, height, sex, level, goal]

--- Health & Safety (optional) ---

Medical conditions (select all that apply):
[ ] Enfermedad gastrica    [ ] Colesterol alto
[ ] Tiroides               [ ] Diabetes
[ ] Terapia con GLP-1      [ ] Otro: [________]
[x] Sin condiciones especiales  ← pre-selected default

Injuries (select affected areas):
[ ] Hombro    [ ] Codo      [ ] Muneca
[ ] Espalda   [ ] Tobillo   [ ] Rodilla
[ ] Pierna
[x] Ninguna   ← pre-selected default
```

**UX rules:**
- "No issues" / "Ninguna" pre-selected as default → zero-friction happy path
- Selecting any condition auto-deselects "no issues" and vice-versa
- Compact chip/tag layout, not full cards with images
- Section is optional and clearly marked as such

### Health Disclaimer
- Add a brief inline disclaimer below the health section: "Nuestra app no sustituye el asesoramiento medico profesional."
- No separate full-page splash like Welmi — keeps the flow compact

### Post-Onboarding: Settings
- Editable in Profile/Settings page under a "Salud y Seguridad" section
- Same UI as onboarding but always expanded

### Phase 2: Functional Impact

Once data is captured, these follow-up features become possible:

**Exercise Safety (Phase 2a):**
- Flag exercises that stress injured areas (e.g., shoulder injury → warning on push-ups, handstands)
- Suggest alternatives automatically
- Requires mapping exercises → muscle groups → injury areas

**Nutrition Adjustments (Phase 2b):**
- Medical conditions could trigger recipe/meal filtering or macro adjustments
- Diabetes → lower glycemic index suggestions
- Gastric → smaller, more frequent meals
- Cholesterol → flag high-cholesterol recipes

**Program Recommendations (Phase 2c):**
- Auto-suggest programs that avoid injured areas
- Intensity recommendations based on medical conditions

## What They Do Well vs What We Do Better

| Aspect | Welmi | Us (Proposed) |
|--------|-------|---------------|
| Data captured | Same set | Same + free text for "other" |
| # of screens | 3 (conditions + disclaimer + injuries) | 1 (compact section in profile) |
| UX friction | Higher — forced through pages | Lower — optional, pre-defaults to "none" |
| Visual quality | Photos of body parts | Chip/tag layout (faster, cleaner) |
| Post-capture use | Unknown (likely minimal) | Phase 2 roadmap for real personalization |

## Priority & Effort

- **Priority**: Medium — captures valuable data for personalization, but Phase 1 is just data capture
- **Effort**: **M** (~6h for data capture UI + migration)
  - Migration: 1h (add 3 fields to users)
  - Onboarding UI section: 3h
  - Settings UI: 1.5h
  - Testing: 0.5h
- **Phase 2** (functional impact): L (~20-30h across exercise filtering, nutrition adjustment, program recommendations)
