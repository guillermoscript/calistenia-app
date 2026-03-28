# Business Docs Update — Design Spec

**Date**: 2026-03-28
**Goal**: Update all 5 business strategy docs to reflect the current state of the product.

## Context

The business docs were written before several features were built. Four features now exist that the docs either don't mention or incorrectly classify:

1. **Sleep tracking** — Built and live. Docs list it as a future premium feature.
2. **Lumbar health page** — Built and live. Not mentioned anywhere in docs.
3. **i18n (English + Spanish)** — Built and live. Docs assume Spanish-only throughout.
4. **App tour system** (Driver.js) — Built and live. Not mentioned in docs.

Additionally, the exercise count is 157 (docs say "150+"), and the feature surface area has grown since the docs were written.

## Changes Per Document

### 01-growth-strategy.md

- Update "150+ exercises" → "157 exercises with video"
- Channel #1 (Content): Note bilingual capability — content strategy can target English-speaking communities too, not just Spanish
- Channel #2 (WhatsApp Referrals): Note app tours improve referral-to-activated-user conversion
- Channel #3 (Facebook/Reddit Groups): Elevate r/bodyweightfitness and English calisthenics communities from secondary to primary targets now that i18n exists
- Phase 3 (Challenges): Confirm challenge system is fully built and functional
- Add lumbar health as a unique content marketing angle ("Cuida tu espalda baja" niche)

### 02-monetization-plan.md

- Free tier table: Add sleep tracking, lumbar health, app tours/guided onboarding, bilingual support
- Premium tier table: Remove sleep tracking
- Strengthen "genuinely useful free tier" messaging — the free tier is now even more generous
- Update exercise count references

### 03-marketing-funnel.md

- Funnel landing page feature grid: Add sleep tracking, lumbar health, bilingual support
- Ad creative section: Add sleep + lumbar health as ad hooks
- Targeting section: Expand to include English-speaking markets and communities

### 04-competitive-analysis.md

- Update exercise count to 157
- Competitive comparison tables: Add bilingual support, sleep tracking, and lumbar health as advantages
- "Where Competitors Are Weak" table: Add sleep tracking integration row and specialized rehab/prehab (lumbar) row
- Positioning map: Update feature description
- "Your Moat" section: Add bilingual support and guided onboarding as differentiators
- Positioning statement: Update to reflect bilingual capability
- One-liner versions: Update to reflect broader language support

### 05-risk-analysis.md

- Risk #1 (Discovery): Note that English support opens new discovery channels
- Risk #2 (Retention Cliff): Add app tours as a direct mitigation for onboarding drop-off
- Risk #4 (Solo Dev Burnout): Update source file count, note expanded feature surface reinforces "freeze features" advice
- Risk #6 (PWA Discovery): Note that bilingual support makes TWA/Play Store listing more viable (broader audience)

## Out of Scope

- No strategy changes — this is a factual alignment pass with section-level rewrites where new features shift assumptions
- No new documents created
- No changes to pricing, timelines, or revenue projections
