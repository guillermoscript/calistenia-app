# Welmi Competitive Analysis: AI Body Composition Analysis

## Current State

### What We Have
1. **Body Measurements Tracker** (`src/components/progress/BodyMeasurementsTracker.tsx`):
   - Manual input for: chest, waist, hips, arm_left, arm_right, thigh_left, thigh_right
   - Stored in PocketBase `body_measurements` collection
   - Shows latest vs previous delta
   - **Missing: neck measurement** (needed for Navy method body fat calculation)

2. **Weight Tracker** (`src/components/progress/WeightTracker.tsx`):
   - Weight logging in kg with line chart
   - Stats: current/min/max/trend

3. **Phase Photo System** (`PhasePhotoTimeline.tsx`, `PhasePhotoUploadModal.tsx`, `PhotoRevealAnimation.tsx`):
   - 4-phase timeline, front/side/back uploads per phase
   - Before/after crossfade animation
   - Dashboard nudge banner

4. **Photo Comparator** (`src/components/progress/PhotoComparator.tsx`):
   - Slider-based before/after comparison by category

5. **AI Infrastructure** (`src/lib/ai-api.ts`, `src/lib/ai-jobs-api.ts`):
   - Existing background job pattern for meal photo analysis via vision models
   - JWT auth forwarding to AI API

6. **User Tier** (`UserTier` type = `'free' | 'premium'`) exists in types but not enforced yet

**What's missing**: No body composition calculations (body fat %, lean mass), no neck measurement, no derived metrics, no visual composition dashboard.

### What Welmi Does
- **Onboarding splash**: Phone scanning a person's body with AR-style overlay showing "Masa muscular: 18.0 kg/m" and "Masa grasa: 21.6%"
- **Post-onboarding upsell**: Modal offering "body scan IA e informe de bienestar" at **$19.99 lifetime** one-time purchase
- **Results display**: "Masa Magra: Optimo" and "Grasa Corporal: Bueno" with color-coded status bars (blue-green-orange scale)
- Likely uses standard formulas behind theatrical AI presentation — actual photo-based body composition is notoriously inaccurate

## Accuracy Assessment

| Method | Accuracy (body fat %) | Cost | Effort |
|--------|----------------------|------|--------|
| DEXA scan | +/- 1-2% | $50-150 per scan | Requires clinic visit |
| Navy method (tape measure) | +/- 3-4% | Free | 2 measurements (neck + waist, + hip for women) |
| AI from photos | +/- 5-8% | API costs | Just a photo |
| Bioimpedance (smart scale) | +/- 3-5% | $30-100 hardware | Step on scale |

**Honest take**: Welmi's "AI body scan" is likely just applying standard formulas (with height/weight/age/sex from onboarding) behind a fancy UI. Real photo-based body composition requires sophisticated ML and is still not very accurate. The value is in engagement and premium monetization, not accuracy.

## Proposed Implementation

### Option A: Navy Method Calculator (Recommended for V1)

Add neck measurement to existing body measurements → compute body fat % client-side using the US Navy method.

**Formula:**
- Men: BF% = 86.010 * log10(waist - neck) - 70.041 * log10(height) + 36.76
- Women: BF% = 163.205 * log10(waist + hip - neck) - 97.684 * log10(height) - 78.387

**Changes needed:**
- Add `neck` field to `body_measurements` collection (migration)
- Add neck input to `BodyMeasurementsTracker.tsx`
- New `calculateBodyFat()` utility in `src/lib/body-composition.ts`
- New visualization component showing:
  - Body fat % with color-coded status (essential/athletic/fit/average/obese ranges)
  - Lean mass estimate (weight - fat mass)
  - Trend over time (chart)

**Effort: S (2-3 days)**, **Cost: Zero**

### Option B: AI Visual Assessment (Phase 2)

Use existing AI API infrastructure with vision model for qualitative assessment from phase photos.

- Send front/side photos to vision model with body stats context
- Get back qualitative assessment: "Based on your photos, you appear to have a lean/average/above-average body composition"
- **Not a number** — avoid false precision. Qualitative labels + color indicators (like Welmi's "Optimo"/"Bueno")

**Effort: M (~1 week)**, **Cost: API calls per assessment**

### Option C: Smart Scale Integration (Backlog)

HealthKit / Health Connect integration to pull body composition from smart scales.

**Effort: L (2-4 weeks)**, **Cost: None but requires native capabilities**

### Phase Photo Integration

Combine phase photo checkpoints into a unified "Body Check-in":
1. Take photos (existing)
2. Record weight (existing)
3. Record measurements including neck (enhanced)
4. Auto-calculate body fat % (new)
5. Show combined progress report: photos + weight + measurements + composition

This makes each checkpoint more valuable and creates a data-rich progress story.

### Monetization Angle

| Feature | Tier |
|---------|------|
| Basic Navy calculation (single reading) | Free |
| Body composition dashboard with history & charts | Premium |
| AI visual assessment from photos | Premium |
| Combined progress report (photos + measurements + composition) | Premium |

## What They Do Well vs What We Do Better

| Aspect | Welmi | Us (Proposed) |
|--------|-------|---------------|
| Wow factor | High — "AI scan" with AR overlay | Lower but honest — tape measure method |
| Accuracy | Likely poor (formula behind AI theater) | Better — Navy method is validated science |
| Monetization | $19.99 one-time upsell | Tier-gated dashboard (recurring value) |
| Integration | Standalone feature | Integrated with phase photos + measurements |
| User trust | Questionable ("AI" claims) | Honest — tells you what method is used |
| Data richness | Single snapshot | Trend over time with multiple data points |

## Priority & Effort

- **Priority**: Medium — good premium differentiator, builds on existing measurements
- **Effort (V1 Navy method)**: **S** (2-3 days)
  - Migration (add neck field): 0.5h
  - `body-composition.ts` calculations: 2h
  - UI component (result display + status indicator): 4h
  - Integration with measurements tracker: 2h
  - Chart for composition trend: 3h
  - Testing: 1h
- **Phase 2 (AI assessment)**: M (~5 days)
- **Phase 3 (smart scale)**: L (~2-4 weeks), backlog
- **Dependencies**: Existing body measurements feature (already have waist, just need neck)
