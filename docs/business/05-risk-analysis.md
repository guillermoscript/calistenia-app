# Risk Analysis: What Kills Fitness Apps

## The Fitness App Graveyard

90% of fitness apps fail. Not because the product is bad — but because of predictable, avoidable mistakes. This document covers the killers and how to survive them.

---

## Risk #1: Nobody Knows You Exist

**Severity: CRITICAL**
**Status: This is you right now**

### The problem
You can build the best app in the world and get zero users. Discovery is the #1 killer of indie apps. You have no App Store listing (PWA), no SEO presence, no social following, no press coverage.

### What kills you
- Waiting for users to find you organically (they won't)
- Building more features instead of marketing
- Assuming the product sells itself

### How to survive
- Treat marketing as 50% of your job, not an afterthought
- Start with free channels (Instagram, TikTok, groups) before spending on ads
- The referral system is your built-in growth hack — activate it aggressively
- See: `01-growth-strategy.md`

---

## Risk #2: Retention Cliff (The Silent Killer)

**Severity: CRITICAL**

### The numbers
Industry average for fitness apps:
- Day 1 retention: ~25%
- Day 7 retention: ~12%
- Day 30 retention: ~4-6%

This means for every 100 signups, only 4-6 people are still using the app after a month. This is normal — but it means you need a massive top of funnel to maintain a user base.

### What kills you
- Focusing on acquisition when the bucket is leaking
- Not measuring retention at all
- Complicated onboarding that loses people before they start

### How to survive
- **Activation metric**: Get users to complete their FIRST workout within 24 hours of signup. This is the single strongest predictor of retention.
- **Streak mechanics**: You already have streaks. Make them more visible and rewarding.
- **Push notifications**: Gentle reminders on rest days ("Manana es dia de Push — preparate")
- **Social accountability**: Friends seeing your activity creates guilt/motivation to continue
- **Track cohort retention**: Don't just count total users. Track "Of people who signed up in Week X, how many are still active in Week X+4?"

---

## Risk #3: The "Gratis Para Siempre" Trap

**Severity: HIGH**
**Status: Active — your landing page makes this promise**

### The problem
You promised free forever. Now you need to charge money. Any price introduction risks:
- User backlash ("you promised it was free!")
- Negative reviews/social media posts
- Trust damage that's hard to repair

### What kills you
- Introducing a paywall with no warning
- Gating features that were previously free without explanation
- Being defensive about it

### How to survive
- Transparent communication: explain WHY (AI costs money, servers cost money, this is a one-person project that needs to be sustainable)
- Grandfather existing users generously (60 days premium, not 7)
- The free tier must still be genuinely useful — not crippled
- Frame it as "we're ADDING premium features" not "we're TAKING AWAY free features"
- See: `02-monetization-plan.md` for the messaging pivot

---

## Risk #4: Solo Developer Burnout

**Severity: HIGH**

### The math
Your app has:
- 198+ source files
- Workout tracking, nutrition with AI, GPS cardio, sleep tracking
- Social features (friends, feed, challenges, leaderboard)
- Referral system with points
- Admin panel, exercise editor
- Offline support, PWA, push notifications

This is the feature set of a 5-10 person team. You're one person. AND you need to do marketing, support, business development, and content creation.

### What kills you
- Trying to maintain everything at the same quality level
- Adding features instead of stabilizing what exists
- Responding to every user request
- Not taking breaks

### How to survive
- **Freeze feature development** for 2-3 months. Market what you have.
- **Decide what to neglect**: Sleep tracking? Leaderboard fine-tuning? Let non-critical features be "good enough."
- **Automate**: Use the existing push notification system for re-engagement instead of manual outreach.
- **Batch work**: Marketing on weekends, bug fixes on weekdays, features only when validated by user demand.
- **Set boundaries**: Response time for support is 48 hours, not instant. You're one person.

---

## Risk #5: AI Costs Eating Your Margin

**Severity: MEDIUM-HIGH**

### The problem
Every AI meal analysis, food lookup, and meal plan generation costs API tokens. With zero revenue:
- 100 active users × 3 AI requests/day = 300 requests/day
- At ~$0.01-0.05 per request = $3-15/day = $90-450/month
- This is BEFORE you make any money

### What kills you
- Free AI for everyone with no limits
- Users discovering they can get "free AI nutritionist" and hammering the API
- Not tracking per-user AI costs

### How to survive
- **Gate AI behind premium immediately** — This is the most justifiable paywall
- **Rate limit free tier**: 3 AI requests per day maximum for free users
- **Cache common queries**: If 50 people ask about "arroz con pollo", serve the same response
- **Use the cheapest model that works**: Haiku for food lookup, Sonnet for meal plans
- **Track costs per user**: Know your unit economics

---

## Risk #6: PWA Discovery Problem

**Severity: MEDIUM**

### The problem
PWAs don't appear in the App Store or Google Play. Users can't search "calistenia" and find you. You're invisible to the primary app discovery channel.

### What kills you
- Relying on app store organic discovery (you have none)
- Users not understanding how to "install" a PWA
- Browsers hiding the install prompt

### How to survive
- **All traffic must come from your channels** (social, ads, referrals, SEO)
- **Make PWA install prominent** in onboarding (you already have install prompts)
- **Consider a TWA wrapper** (Trusted Web Activity) to list on Google Play with zero code changes — this is a simple build step
- **Apple is the harder problem**: iOS PWAs have limitations. Accept this and focus on Android/web for now.
- **Long term**: Consider Capacitor wrapper for true native listing on both stores

---

## Risk #7: The Domain Problem

**Severity: MEDIUM**

### The problem
`gym.guille.tech` looks like a personal project, not a product. Perception matters:
- Users hesitate to enter payment info on personal domains
- It's not memorable or shareable
- It undermines the professional image of the app itself

### How to survive
- Buy a proper domain ($10-15/year)
- Good options: `calistenia.app`, `entrenarconproposito.com`, `caliste.app`
- Redirect old domain to new one
- Update all referral links, share cards, and email templates

---

## Risk #8: Payment Fraud / Chargebacks

**Severity: LOW (but plan for it)**

### The problem
Once you accept payments:
- Stolen credit cards used for signups
- Users requesting chargebacks after using the app
- Stripe can freeze your account if chargeback rate > 1%

### How to survive
- Use Stripe's built-in fraud detection (Radar)
- Implement easy cancellation (if users can cancel easily, they don't chargeback)
- Keep refund policy generous in year 1 — better to lose $7 than get a chargeback
- Monitor Stripe dashboard weekly

---

## Risk Matrix Summary

| Risk | Severity | Likelihood | Mitigation Status |
|------|----------|-----------|-------------------|
| No discovery/awareness | CRITICAL | Certain (current state) | Needs immediate action |
| Retention cliff | CRITICAL | Very high (industry norm) | Partially mitigated (streaks, social) |
| "Gratis para siempre" backlash | HIGH | High | Needs messaging pivot |
| Solo dev burnout | HIGH | High | Needs intentional scope management |
| AI costs eating margin | MEDIUM-HIGH | Medium | Needs rate limiting + premium gate |
| PWA discovery | MEDIUM | Certain | Needs alternative channels |
| Unprofessional domain | MEDIUM | Certain | Needs domain purchase |
| Payment fraud | LOW | Low | Handle when implementing Stripe |

---

## The #1 Thing That Will Actually Kill This

**Not marketing.**

You are a builder. You love building. The app proves it — 198 files, AI nutrition, GPS, social, challenges, referrals, admin panel. You've built a product that most companies would need $500K+ in funding to create.

But the app has (presumably) very few users. Because building feels productive and marketing feels uncomfortable. Every hour you spend adding a new feature is an hour you didn't spend getting someone to use the features you already have.

**The prescription:**
- For the next 3 months, spend 50% of your time on marketing
- No new features unless they directly drive acquisition or retention
- The app is good enough. The world just doesn't know it exists.

---

## What Success Looks Like (Milestones)

| Milestone | Signal | When |
|-----------|--------|------|
| First 100 users | You can get people to sign up | Month 1-2 |
| 20% Day-7 retention | People find value | Month 2-3 |
| First paying user | Someone values this enough to pay | Month 3-4 |
| 50 paying users | You have a real business | Month 6-7 |
| $500 MRR | Covers your costs | Month 7-8 |
| 100 paying users | $10K/year run rate | Month 10-12 |
| First organic referral conversion | Product-led growth is working | Anytime (celebrate this) |
