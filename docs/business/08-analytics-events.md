# Analytics & Tracking

> OpenPanel — self-hosted at https://openpanel.guille.tech
> SDK: @openpanel/web, initialized in src/lib/analytics.ts
> Dashboard: https://openpanel.guille.tech (login required)

---

## Architecture

```
Browser (React app)
  └─ @openpanel/web SDK (~2.3 KB)
       └─ sends events to → https://openpanel.guille.tech/api
                                └─ OpenPanel (self-hosted on Dokploy)
                                     ├─ ClickHouse (event storage)
                                     ├─ PostgreSQL (metadata)
                                     └─ Redis (queue)
```

### Configuration

| Setting | Value |
|---------|-------|
| API URL | `https://openpanel.guille.tech/api` |
| Client ID | `18cdafce-bf86-444d-8cd8-3490d9ba8dc7` |
| Project | Gym Guille |
| Track screen views | Yes (automatic) |
| Track outgoing links | Yes (automatic) |
| Track data-track attributes | Yes (automatic) |

**No env vars needed in Dokploy.** The client ID and API URL are hardcoded in `src/lib/analytics.ts`. They are public (client-side analytics, like Google Analytics). The `clientSecret` is only needed for server-side events, which we don't use.

### Code Entry Point

```typescript
// src/lib/analytics.ts
import { OpenPanel } from '@openpanel/web'

export const op = new OpenPanel({
  apiUrl: 'https://openpanel.guille.tech/api',
  clientId: '18cdafce-bf86-444d-8cd8-3490d9ba8dc7',
  trackScreenViews: true,
  trackOutgoingLinks: true,
  trackAttributes: true,
})
```

Usage anywhere in the app:
```typescript
import { op } from '../lib/analytics'
op.track('event_name', { key: 'value' })
```

---

## Events Tracked

| Event | File | Trigger | Properties |
|-------|------|---------|-----------|
| `cta_clicked` | LandingPage.tsx | User clicks any CTA button | `location` (nav / hero / bottom) |
| `signup_completed` | useAuth.ts | New user registers (email or Google) | `method` (email / google) |
| `referral_converted` | useAuth.ts | New user signed up via referral link | `referrer_id` |
| `workout_completed` | useProgress.ts | markWorkoutDone() fires | `workout_key`, `is_free_session` |
| `invite_sent` | InviteButton.tsx | User shares invite link | `method` (whatsapp / native / copy) |
| `invite_landing_viewed` | InviteLandingPage.tsx | Someone opens an invite link | `code`, `has_challenge` |
| `onboarding_completed` | OnboardingFlow.tsx | User finishes onboarding | `level`, `has_program` |
| `program_selected` | usePrograms.ts | User picks a training program | `program_id`, `program_name` |
| `app_installed` | InstallPrompt.tsx | User installs PWA via native prompt | `method` (native_prompt) |
| `share_card_shared` | WorkoutShareCard / PRShareCard / CardioShareCard / DailySummaryCard | User shares a card image | `card_type` (workout / pr / cardio / nutrition), `activity` (cardio only) |
| `streak_milestone` | StreakMilestone.tsx | User sees & dismisses a streak milestone | `days` (7 / 14 / 30 / 60 / 100) |
| `session_started` | ActiveSessionContext.tsx | User starts a workout session | `workout_key`, `source` (program / free) |
| `program_started` | useProgress.ts | First workout completed in a program | `program_id` |
| `login_completed` | useAuth.ts | Existing user logs in (email or Google) | `method` (email / google) |
| `onboarding_step_viewed` | OnboardingFlow.tsx | User navigates to an onboarding step | `step` (index), `step_name` (welcome / profile / program / orientation) |
| `workout_abandoned` | ActiveSessionContext.tsx | User closes tab/navigates away during active session | `workout_key`, `source`, `duration_seconds` |
| `pr_achieved` | useProgress.ts | User sets a new personal record | `exercise_id`, `pr_key`, `old_value`, `new_value` |
| `exercise_searched` | ExerciseLibraryPage.tsx | User types 2+ chars in exercise search (debounced 1.5s) | `query` |
| `notification_clicked` | main.tsx (via SW message) | User clicks a push notification | `url`, `title` |
| `page_error` | main.tsx | React error boundary catches an error | `error_type` (uncaught / caught / recoverable), `message` |
| `cardio_started` | CardioSessionPage.tsx | User starts a cardio session | `activity_type` (running / walking / cycling) |
| `cardio_completed` | CardioSessionPage.tsx | User finishes a cardio session | `activity_type`, `distance_km`, `duration_seconds` |
| `cardio_discarded` | CardioSessionPage.tsx | User discards a cardio session | `activity_type` |
| `meal_logged` | MealLoggerContent.tsx | User saves a meal entry | `meal_type`, `food_count`, `calories` |
| `meal_analyzed` | useNutrition.ts | AI photo analysis completes | `food_count`, `ai_model` |
| `water_logged` | useWater.ts | User logs water intake | `amount_ml` |
| `challenge_created` | useChallenges.ts | User creates a challenge | `metric`, `duration_days`, `participant_count` |
| `challenge_joined` | useChallengeDetail.ts | User is added to a challenge | `challenge_id` |
| `challenge_completed` | useChallenges.ts | Challenge auto-ends when expired | `challenge_id` |
| `user_followed` | useFollows.ts | User follows another user | `target_id` |
| `leaderboard_viewed` | LeaderboardPage.tsx | User opens the leaderboard | — |
| `sleep_logged` | SleepPage.tsx | User logs a new sleep entry | `quality` |

### Automatic Events (no code needed)

| Event | How |
|-------|-----|
| **Screen views** | `trackScreenViews: true` — every route change fires a `screen_view` event |
| **Outgoing links** | `trackOutgoingLinks: true` — clicks on external links are tracked |
| **data-track attributes** | Any HTML element with `data-track="event_name"` fires automatically without importing `op` |

### User Identification

| Moment | What Happens | File |
|--------|-------------|------|
| **Login** (existing user) | `op.identify({ profileId, firstName, email, properties: { tier, role } })` | useAuth.ts |
| **Signup** (new user) | Same `op.identify()` + `op.track('signup_completed')` | useAuth.ts |
| **Sign out** | `op.clear()` — resets the anonymous profile | useAuth.ts |

This means every event after identify is tied to a specific user. You can see per-user funnels, not just aggregates.

---

## Reports & Dashboards

All reports are created in OpenPanel at **Reports** → chart type selector → pick events → Save.

### Status Legend

- [x] = Created in OpenPanel
- [ ] = Not yet created (create when events have data)

---

### Funnel Reports

| # | Report Name | Chart Type | Events (in order) | Dashboard | Status |
|---|------------|------------|-------------------|-----------|--------|
| F1 | **Acquisition Funnel** | Funnel | `screen_view` → `cta_clicked` → `signup_completed` → `onboarding_completed` → `workout_completed` | Main | [x] |
| F2 | **Referral Funnel** | Funnel | `invite_sent` → `invite_landing_viewed` → `signup_completed` | Referral | [ ] |
| F3 | **Activation Funnel** | Funnel | `signup_completed` → `onboarding_completed` → `program_selected` → `session_started` → `workout_completed` | Main | [ ] |
| F4 | **Session Completion** | Funnel | `session_started` → `workout_completed` | Main | [ ] |
| F5 | **Retention Funnel** | Funnel | `login_completed` → `session_started` → `workout_completed` | Main | [ ] |
| F6 | **Onboarding Steps** | Funnel | `onboarding_step_viewed` (welcome) → (profile) → (program) → (orientation) → `onboarding_completed` | Main | [ ] |
| F7 | **Cardio Session Completion** | Funnel | `cardio_started` → `cardio_completed` | Feature Adoption | [ ] |
| F8 | **Nutrition Flow** | Funnel | `meal_analyzed` → `meal_logged` | Feature Adoption | [ ] |
| F9 | **Challenge Lifecycle** | Funnel | `challenge_created` → `challenge_joined` → `challenge_completed` | Social | [ ] |

### Trend Reports (Line/Area Charts)

| # | Report Name | Chart Type | Event | Breakdown | Dashboard | Status |
|---|------------|------------|-------|-----------|-----------|--------|
| T1 | **Signups Over Time** | Linear | `signup_completed` | `method` | Main | [ ] |
| T2 | **Logins Over Time** | Linear | `login_completed` | `method` | Main | [ ] |
| T3 | **Workouts Over Time** | Linear | `workout_completed` | — | Main | [ ] |
| T4 | **Cardio Over Time** | Linear | `cardio_completed` | `activity_type` | Feature Adoption | [ ] |
| T5 | **Meals Logged Over Time** | Linear | `meal_logged` | `meal_type` | Feature Adoption | [ ] |
| T6 | **Water Logged Over Time** | Linear | `water_logged` | — | Feature Adoption | [ ] |
| T7 | **Sleep Entries Over Time** | Linear | `sleep_logged` | — | Feature Adoption | [ ] |
| T8 | **Sessions Started vs Completed** | Linear | `session_started` + `workout_completed` | — | Main | [ ] |
| T9 | **Invites Over Time** | Linear | `invite_sent` | `method` | Referral | [ ] |
| T10 | **Errors Over Time** | Linear | `page_error` | `error_type` | Health | [ ] |

### Breakdown Reports (Bar/Pie Charts)

| # | Report Name | Chart Type | Event | Breakdown By | Dashboard | Status |
|---|------------|------------|-------|-------------|-----------|--------|
| B1 | **CTA Performance** | Bar | `cta_clicked` | `location` | Main | [ ] |
| B2 | **Share Card Types** | Pie | `share_card_shared` | `card_type` | Engagement | [ ] |
| B3 | **Cardio Activities** | Pie | `cardio_completed` | `activity_type` | Feature Adoption | [ ] |
| B4 | **Meal Types** | Pie | `meal_logged` | `meal_type` | Feature Adoption | [ ] |
| B5 | **Auth Methods** | Pie | `signup_completed` | `method` | Main | [ ] |
| B6 | **Challenge Metrics** | Bar | `challenge_created` | `metric` | Social | [ ] |
| B7 | **Notification Clicks** | Bar | `notification_clicked` | `url` | Engagement | [ ] |
| B8 | **Exercise Search Queries** | Bar | `exercise_searched` | `query` | Engagement | [ ] |
| B9 | **Streak Milestones** | Bar | `streak_milestone` | `days` | Engagement | [ ] |
| B10 | **Workout Abandoned Duration** | Histogram | `workout_abandoned` | `duration_seconds` | Health | [ ] |

### Metric Reports (Single Number Widgets)

| # | Report Name | Chart Type | Event | Dashboard | Status |
|---|------------|------------|-------|-----------|--------|
| M1 | **Total Signups (30d)** | Metric | `signup_completed` | Main | [ ] |
| M2 | **Total Workouts (30d)** | Metric | `workout_completed` | Main | [ ] |
| M3 | **Total Meals Logged (30d)** | Metric | `meal_logged` | Feature Adoption | [ ] |
| M4 | **PWA Installs (30d)** | Metric | `app_installed` | Main | [ ] |
| M5 | **PRs Achieved (30d)** | Metric | `pr_achieved` | Engagement | [ ] |
| M6 | **Active Challenges** | Metric | `challenge_created` | Social | [ ] |
| M7 | **Leaderboard Views (30d)** | Metric | `leaderboard_viewed` | Social | [ ] |
| M8 | **AI Meal Analyses (30d)** | Metric | `meal_analyzed` | Feature Adoption | [ ] |

---

### Dashboards

| Dashboard | Reports | Check Frequency |
|-----------|---------|-----------------|
| **Main** | F1, F3, F4, F5, F6, T1, T2, T3, T8, B1, B5, M1, M2, M4 | Daily |
| **Feature Adoption** | F7, F8, T4, T5, T6, T7, B3, B4, M3, M8 | Weekly |
| **Engagement** | B2, B7, B8, B9, M5 | Weekly |
| **Referral** | F2, T9 | Weekly |
| **Social** | F9, B6, M6, M7 | Weekly |
| **Health** | T10, B10 | When issues arise |

### Alerts (Notifications)

| Alert | Condition | Action |
|-------|-----------|--------|
| **Zero signups in 48h** | `signup_completed` = 0 for 2 days | Something is broken (landing page, auth, deploy) |
| **Spike in screen_view but no signups** | High `screen_view`, zero `signup_completed` | Funnel is broken (CTA or auth page issue) |
| **invite_sent spike** | Sudden increase in `invite_sent` | A user is actively sharing (reach out and thank them) |
| **page_error spike** | `page_error` count > 10 in 1 hour | Check Sentry for details |
| **Zero workouts in 48h** | `workout_completed` = 0 for 2 days | Engagement drop — check if deploy broke something |

---

## Key Metrics & Targets

| Metric | How to Measure | Target | Red Flag |
|--------|---------------|--------|----------|
| Landing → CTA click | `cta_clicked` / `screen_view (/)` | >15% | <8% |
| CTA → Signup | `signup_completed` / `cta_clicked` | >50% | <30% |
| Signup → Onboarding | `onboarding_completed` / `signup_completed` | >60% | <40% |
| Signup → First Workout | `workout_completed` / `signup_completed` | >40% within 48h | <20% |
| Invite Conversion | `referral_converted` / `invite_landing_viewed` | >15% | <5% |
| Referral K-factor | (invite_sent per user) × (conversion rate) | >0.3 | <0.1 |
| Invite Share Rate | `invite_sent` / active users | >10% | <3% |

### How to Calculate K-Factor

```
K = (avg invites per user) × (invite-to-signup rate)

Example: 50 active users sent 30 invites → 0.6 invites/user
         30 invite landings → 5 signups → 16.7% conversion
         K = 0.6 × 0.167 = 0.10

K > 1.0 = viral (each user brings more than 1 new user)
K > 0.3 = healthy organic growth
K < 0.1 = referral system needs work
```

---

## UTM Tracking for Campaigns

OpenPanel automatically captures UTM parameters. Use them on all links:

### Referral Links (already implemented)
```
https://gym.guille.tech/invite/{code}
```
Tracked via `invite_landing_viewed` event with `code` property.

### Ad Campaign Links
```
https://gym.guille.tech/?utm_source=google&utm_medium=cpc&utm_campaign=calistenia_es
https://gym.guille.tech/?utm_source=instagram&utm_medium=social&utm_campaign=reel_demo
https://gym.guille.tech/?utm_source=producthunt&utm_medium=launch&utm_campaign=march2026
```

### Social / Content Links
```
https://gym.guille.tech/?utm_source=instagram&utm_medium=bio
https://gym.guille.tech/?utm_source=tiktok&utm_medium=bio
https://gym.guille.tech/?utm_source=reddit&utm_medium=post&utm_campaign=bwf_launch
```

View attribution in OpenPanel → **Source**, **Medium**, **Campaign** tabs on the Overview page.

---

## Adding data-track to HTML Elements

For quick event tracking without importing `op`, add `data-track` to any element:

```html
<button data-track="share_workout_card">COMPARTIR</button>
<a data-track="blog_cta_clicked" href="/auth">Empieza gratis</a>
```

These fire automatically thanks to `trackAttributes: true`. Use for one-off tracking without modifying component logic.

---

## Events to Add Later

| Event | When to Add | Trigger | Priority |
|-------|------------|---------|----------|
| `upgrade_started` | When payments are built | User initiates upgrade flow | High |
| `payment_completed` | When payments are built | User completes payment | High |
| `subscription_cancelled` | When payments are built | User cancels subscription | High |
| `feature_used` | After 100 users | First use of secondary features | Low |

### How to Add a New Event

1. Import `op` in the relevant file:
   ```typescript
   import { op } from '../lib/analytics'
   ```

2. Track at the right moment:
   ```typescript
   op.track('event_name', { property: 'value' })
   ```

3. Add the event to this doc.

4. Create a report or add to a dashboard in OpenPanel.

---

## Debugging

### Verify Events Are Flowing

1. Open the app in browser
2. Open OpenPanel → **Realtime** — you should see yourself
3. Click a CTA, complete a workout, etc.
4. Check **Events** tab — your events should appear within seconds

### Events Not Showing?

- Check browser console for errors from `@openpanel/web`
- Verify `https://openpanel.guille.tech/api` is reachable
- Check if an ad blocker is blocking the request
- Try incognito mode

### Check User Profiles

Go to **Profiles** to see identified users. Each profile shows:
- All events from that user
- Properties (tier, role)
- First seen / last seen
- Session history
