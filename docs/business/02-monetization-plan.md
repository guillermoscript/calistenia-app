# Monetization Plan

## The Goal

$10,000 in revenue within 12 months. This document covers what to charge, who pays, and how the money flows.

---

## Revenue Model: Hybrid (Subscriptions + One-Time Purchases)

Pure subscriptions won't hit $10K in year 1. The hybrid model captures two buyer types:
- **"I want ongoing value"** → monthly/annual subscription
- **"I just want a program to follow"** → one-time purchase

### Revenue Streams

| Stream | Price | Expected % of revenue |
|--------|-------|----------------------|
| Monthly subscription | $6.99/mo | ~30% |
| Annual subscription | $49.99/yr (~$4.17/mo) | ~35% |
| One-time program purchases | $19.99-29.99 each | ~25% |
| Seasonal promotions | Discounted annual | ~10% |

---

## Pricing

### Why $6.99/month

- **Too low ($2.99-3.99)**: Signals low value. Doesn't cover costs. Need too many users.
- **Sweet spot ($5.99-7.99)**: Affordable for Spain AND LATAM. Comparable to a coffee. Sustainable.
- **Too high ($9.99+)**: Price-sensitive LATAM market drops off. Need to justify against big apps.

$6.99 works across purchasing power in both Spain and Latin America. It's less than Freeletics ($12.99), less than a gym membership, and feels fair for what you offer.

### Price Table

| Plan | Price | Savings | Notes |
|------|-------|---------|-------|
| Monthly | $6.99/mo | — | Low commitment entry |
| Annual | $49.99/yr | 40% off monthly | Push this as default |
| Lifetime | $89.99 | — | Only during launch or Black Friday |

### One-Time Programs

| Program Type | Price | Examples |
|-------------|-------|---------|
| 4-week starter | $9.99 | "Calistenia desde cero" |
| 12-week structured | $19.99 | "Fuerza fundamental", "Primer muscle-up" |
| 6-month complete | $29.99 | "Transformacion completa" |

Users who buy a program get access to that program forever but don't get other premium features (AI nutrition, GPS, etc.). This creates an upsell path to full subscription.

---

## Free vs Premium Feature Split

### The Principle

Free tier must be **genuinely useful** — not a crippled demo. Users should be able to train effectively for free. Premium should feel like a significant upgrade, not a hostage situation.

### Free Tier (Forever)

| Feature | Details |
|---------|---------|
| Workout tracking | Log sets, reps, weight, notes |
| Exercise library | All 150+ exercises with videos |
| 1 starter program | The beginner program with full phases |
| Basic progress | Session history, current streak |
| Calendar view | Activity heatmap |
| Manual food logging | Add meals without AI (type food, enter macros) |
| Water tracking | Daily water intake |
| Friends | Add friends, see their profiles |
| Activity feed | See friends' workouts |
| Join challenges | Participate in challenges others create |
| Referrals | Invite friends, earn points |
| Reminders | Set workout/meal reminders |
| Offline mode | Full offline functionality |

### Premium Tier

| Feature | Why it's premium |
|---------|-----------------|
| AI meal analysis (photo) | Costs API money per request |
| AI food lookup | Costs API money per request |
| AI meal plan generation | Costs API money per request |
| Barcode scanner | Differentiator, uses external API |
| All official programs | Content has creation cost |
| Program editor (create your own) | Power user feature |
| GPS cardio tracking | Uses device resources, premium experience |
| Advanced analytics | Muscle volume charts, 1RM calculator |
| Photo progress comparator | Side-by-side before/after |
| Data export | Power user feature |
| Sleep tracking | Additional tracking vertical |
| Create challenges | Free users join, premium users create |
| Priority support | Direct line to you |

### The Soft Gate Approach

Don't hard-block features with an error. Instead:
- Free user taps "AI Meal Plan" → Show 3-second preview of what it does → "Desbloquea con Premium"
- Free user opens GPS cardio → Let them try ONE session → Then gate
- Free user hits the barcode scanner → Show it working once → Then gate

Let people taste the value before asking them to pay.

---

## Revenue Math

### Scenario: Conservative

| Month | Free Users | Paid Subs | Program Sales | MRR |
|-------|-----------|-----------|---------------|-----|
| 1-2 | 100 | 0 | 0 | $0 |
| 3 | 200 | 5 | 3 | $95 |
| 4 | 350 | 12 | 5 | $184 |
| 5 | 500 | 22 | 8 | $314 |
| 6 | 700 | 35 | 10 | $445 |
| 7 | 900 | 45 | 12 | $554 |
| 8 | 1,100 | 55 | 15 | $685 |
| 9 | 1,300 | 65 | 15 | $754 |
| 10 | 1,500 | 75 | 18 | $884 |
| 11 | 1,700 | 85 | 20 | $994 |
| 12 | 2,000 | 95 | 20 | $1,064 |
| **Year total** | | | | **~$5,900 subs + ~$2,800 programs = ~$8,700** |

### Scenario: Optimistic (viral moment or successful ad campaign)

Double the user numbers → ~$14,000-17,000

### Scenario: Pessimistic (slow organic growth only)

Half the user numbers → ~$4,000-5,000

---

## The "Gratis Para Siempre" Problem

The current landing page promises free forever. This is a real constraint.

### How to handle it:

1. **Honor the promise for existing features** — Everything that's free today stays free
2. **Premium is NEW features on top** — AI nutrition, GPS, programs didn't exist when the promise was made (or frame new premium features as additions)
3. **Communicate transparently** — "Para que la app siga mejorando, estamos lanzando un plan premium. Todo lo que usas hoy sigue siendo gratis."
4. **Grandfather existing users** — Give them 60 days of premium free, then they decide
5. **Change the landing page messaging** — Remove "gratis para siempre" before launching premium. Replace with "Empieza gratis" / "Plan gratuito generoso"

### The messaging pivot:

| Before | After |
|--------|-------|
| "Gratis para siempre. Sin tarjeta." | "Empieza gratis. Sin tarjeta." |
| "Sin suscripciones ocultas" | "Plan gratuito que realmente sirve" |
| "0 Costo — siempre gratis" | "Gratis para empezar — premium para ir mas lejos" |

---

## Costs to Consider

| Cost | Monthly | Notes |
|------|---------|-------|
| AI API (Anthropic/OpenAI) | $50-200 | Scales with premium users |
| Domain | ~$1 | Annual cost amortized |
| PocketBase hosting | $5-20 | Depends on provider |
| Stripe fees | 2.9% + $0.30 per transaction | ~$30-50 at scale |
| Facebook ads (month 5+) | $300-600 | Optional, scales with budget |
| **Total overhead** | **~$100-300/mo** | Before ads |

### Break-even point:
At $6.99/mo per subscriber, you break even on overhead at ~15-40 paying subscribers (depending on AI usage). Everything after that is profit (minus ad spend).

---

## Referral Points Economy

Make the existing points system drive revenue:

| Action | Points Earned |
|--------|--------------|
| Refer a friend who signs up | 100 points |
| Referred friend completes first workout | 50 points |
| Complete a challenge | 25 points |

| Redemption | Points Cost |
|-----------|-------------|
| 1 week premium | 200 points |
| 1 month premium | 500 points |
| Unlock 1 program permanently | 800 points |

This makes every referral worth real money to the user and costs you nothing (they're earning premium time by bringing you new users who might also convert).

---

## When to Launch Pricing

**Not on day 1 of having the infrastructure.** Follow this sequence:

1. **Week 1-3**: Build Stripe + gates (no one sees it)
2. **Week 4**: Change landing page messaging (remove "gratis para siempre")
3. **Week 5**: Announce to existing users via in-app banner + email
4. **Week 6**: 60-day grandfather period starts
5. **Week 8**: Premium officially live for new users (new signups get 7-day trial)
6. **Week 14**: Grandfather period ends, existing users choose free or premium

This gives you 3+ months of runway before anyone feels "switched."
