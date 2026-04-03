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

## OpenPanel Dashboard Setup

### Funnels to Create

Go to **Insights** → **+ Create report** → **Funnel**

#### 1. Acquisition Funnel
```
screen_view (path = /) → cta_clicked → signup_completed → onboarding_completed → workout_completed
```
Shows: How many landing page visitors become active users. Where do they drop off?

#### 2. Referral Funnel
```
invite_sent → invite_landing_viewed → signup_completed
```
Shows: How effective is the referral system? What % of invite links convert?

#### 3. Activation Funnel
```
signup_completed → onboarding_completed → program_selected → session_started → workout_completed
```
Shows: Do new users actually complete their first workout? Where do they get stuck?

#### 4. Session Completion Funnel
```
session_started → workout_completed
```
Shows: How many started sessions get completed? High drop-off = UX friction in session flow.

#### 5. Retention Funnel
```
login_completed → session_started → workout_completed
```
Shows: Are returning users still completing workouts?

#### 6. Onboarding Step Funnel
```
onboarding_step_viewed (welcome) → onboarding_step_viewed (profile) → onboarding_step_viewed (program) → onboarding_step_viewed (orientation) → onboarding_completed
```
Shows: Which onboarding step has the biggest drop-off?

### Dashboards to Build

Go to **Dashboards** → **+ Create dashboard** → pin reports

**Main Dashboard (check daily):**
- Unique visitors (widget)
- Signups over time (Events → filter `signup_completed`)
- Workouts over time (Events → filter `workout_completed`)
- CTA performance (Events → filter `cta_clicked`, break down by `location` property)
- Acquisition funnel (pin the funnel report)

**Referral Dashboard (check weekly):**
- Invites sent over time (Events → filter `invite_sent`, break down by `method`)
- Invite landing views (Events → filter `invite_landing_viewed`)
- Referral conversions (Events → filter `referral_converted`)
- Referral funnel (pin the funnel report)

### Key Sections in OpenPanel

| Section | What It Shows | When to Check |
|---------|--------------|---------------|
| **Overview** | Visitors, sessions, bounce rate, pageviews | Daily |
| **Events** | All custom events with properties | Daily |
| **Pages** | Which pages get traffic (landing, blog, invite) | Weekly |
| **Profiles** | Identified users with name, email, tier | When investigating specific users |
| **Sessions** | Individual session replays (if enabled) | When debugging UX issues |
| **Realtime** | Live visitors on the site right now | During launches/campaigns |
| **Insights** | Funnels, retention, custom reports | Weekly |
| **Refs / Source / Medium / Campaign** | UTM attribution | After running ads |

### Alerts to Set Up

Go to **Notifications** → create alerts:

- **Zero signups in 48h** → Something is broken (landing page, auth, deploy)
- **Spike in screen_view but no signups** → Funnel is broken (CTA or auth page issue)
- **invite_sent spike** → A user is actively sharing (reach out and thank them)

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
| `challenge_created` | After 50 users | User creates a challenge | Medium |
| `challenge_joined` | After 50 users | User joins a challenge | Medium |
| `friend_added` | After 50 users | User adds a friend | Medium |
| `meal_logged` | When nutrition is prioritized | AI meal analysis completed | High |
| `sleep_logged` | When sleep is prioritized | Sleep entry saved | Low |
| `feature_used` | After 100 users | First use of secondary features | Low |
| `upgrade_started` | When payments are built | User initiates upgrade flow | High |
| `payment_completed` | When payments are built | User completes payment | High |
| `subscription_cancelled` | When payments are built | User cancels subscription | High |

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
