# Calistenia App — SaaS MVP Design Spec

## Overview

Transform the calistenia app from a personal training tool into a multi-user SaaS platform with role-based access, official curated programs, user profiles, and a foundation for future monetization.

**Target audience:** Calisthenics beginners → intermediate pipeline. The app guides people from zero to skills over months, then retains them as power users.

**Business model:** Hybrid freemium. Free core workout tracking for growth. Revenue (Phase 3+) from premium AI features and premium programs published by editors/coaches.

**Reference:** Calisteniapp.com as UX/pricing benchmark. We differentiate with coach/editor ecosystem, AI nutrition, social comparison, and open program creation.

---

## Phase Roadmap

### Phase 1 — MVP (this spec)
- Role system: admin / editor / user
- Official & featured programs
- Onboarding with program selection (already built)
- Core workout tracking (already built)
- Progress & streaks (already built)
- PWA with notifications (already built)
- User profiles with PR showcase and friend comparison

### Phase 2 — Engagement
- AI nutrition gated as premium
- Editor dashboard with program stats (views, enrollments, completions)
- Program ratings & reviews
- Profile privacy toggle

### Phase 3 — Monetization
- Stripe subscription (free / premium tiers)
- Premium programs (paid one-time or included in subscription)
- Coach profiles with bio, certifications, social links
- Program recommendations based on user level/goals
- Advanced analytics (volume charts, exercise progression graphs)

### Phase 4 — Scale
- Social features (follow coaches, activity feed)
- In-app messaging (coach → client)
- Custom branding for coaches
- API for third-party integrations
- Adaptive EVO-style routines (AI-driven progression)

---

## 1. Role System

### Roles

| Role | Value | Capabilities |
|------|-------|-------------|
| Admin | `admin` | Everything. Manage users, assign roles, feature programs, publish official programs, unpublish anything |
| Editor | `editor` | Create & publish official programs. Edit/delete own official programs. View own program stats |
| User | `user` | Create personal programs (1 free, unlimited premium). Duplicate any program. Share personal programs |

### Assignment Flow

Admin-only, invite-based:
1. Admin opens admin panel (`/admin`)
2. Searches user by email
3. Changes role from `user` to `editor` (or back)
4. No public "become an editor" flow — editors are personally invited

### Data Model

**`users` collection — new fields:**
- `role`: text, values `user` | `editor` | `admin`, default `user`
- `tier`: text, values `free` | `premium`, default `free` (for future monetization, not enforced in MVP)

---

## 2. Official & Featured Programs

### Program Tiers

| Tier | Who creates | Badge | Visibility |
|------|------------|-------|-----------|
| Featured | Admin marks `is_featured = true` | Star + "RECOMENDADO" | First in listings, shown in onboarding |
| Official | Editor/admin sets `is_official = true` | Checkmark + "OFICIAL" | Default view on Programs page |
| Community | Any user creates | Creator name shown | Behind "Comunidad" toggle |

### Data Model

**`programs` collection — new fields:**
- `is_official`: boolean, default `false`
- `is_featured`: boolean, default `false`
- `difficulty`: text, values `beginner` | `intermediate` | `advanced`, default `beginner`

### PocketBase Rules

```
programs.is_official:
  writable when @request.auth.role = "admin" || @request.auth.role = "editor"

programs.is_featured:
  writable when @request.auth.role = "admin"

users.role:
  writable when @request.auth.role = "admin"

users.tier:
  writable when @request.auth.role = "admin"
  (future: writable by payment webhook)
```

### Programs Page UX

- Default view: official programs only, sorted: featured first, then alphabetical
- Toggle tabs: "Oficiales" (default) | "Comunidad"
- Featured programs: star badge, subtle highlight card background
- Official programs: checkmark "OFICIAL" badge
- Community programs: show creator display name, no official badge
- All programs show difficulty badge (beginner/intermediate/advanced)

### Onboarding Integration

Step 2 (program selection) updated:
- Only shows official programs (`is_official = true`)
- Featured programs appear first with "RECOMENDADO" tag
- Difficulty badge on each card
- "Crear mi propio programa" link remains at bottom

### Editor Publishing Flow

1. Editor opens `/programs/new` (same UI as users)
2. Sees extra toggle: "Publicar como programa oficial" (only visible to editor/admin roles)
3. Sees difficulty selector: beginner / intermediate / advanced
4. On save, sets `is_official = true` if toggled
5. Admin can later mark `is_featured = true` from admin panel

---

## 3. User Profiles

### Public Profile Page

**Route:** `/profile/:userId`

**Content:**
- Display name + avatar
- Member since date
- Current active program name + phase
- Key stats row: total sessions, longest streak, current streak, weekly average
- PR showcase: pull-ups, push-ups, L-sit, pistol squat, handstand (from existing settings goals)
- Monthly activity calendar (green grid, read-only)
- Programs completed list

### Comparison View

- When viewing another user's profile: "COMPARAR" button
- Side-by-side display:
  - Your streak vs theirs
  - Your PRs vs theirs (winner highlighted per metric)
  - Your weekly average vs theirs
- Lightweight — no follower system, just shareable profile URLs (`/profile/{userId}`)

### Privacy

- All profiles public by default in MVP
- Phase 2: "Profile visible" toggle in user settings

---

## 4. Admin Panel

### Route: `/admin`

**Visible only to `admin` role in sidebar (shield icon).**

#### Overview Tab
- Total registered users
- Active users this week (users with at least 1 session)
- Total sessions logged (all time)
- Official programs published count

#### Users Tab
- Searchable user list (by email or display name)
- Each row shows: display name, email, role, tier, member since, total sessions
- Action: change role (user ↔ editor). Confirmation dialog before change.
- No user deletion from this panel (use PB admin for destructive ops)

#### Programs Tab
- Lists all official programs
- Each row shows: name, creator, difficulty, enrollment count, is_featured toggle
- Toggle `is_featured` on/off per program
- "Unpublish" action: sets `is_official = false` (program reverts to community)

### Route: `/editor`

**Visible only to `editor` role in sidebar (pencil icon).**

#### My Programs Tab
- Lists editor's own official programs
- Each shows: name, difficulty, enrollment count, completion count
- Edit / unpublish actions

#### Quick Actions
- "Nuevo Programa Oficial" button → `/programs/new` with official toggle pre-enabled

---

## 5. Sidebar Changes

Conditional nav items based on `user.role`:

```
admin  → shows "Admin" item (shield icon) at /admin
editor → shows "Editor" item (pencil icon) at /editor
user   → neither shown
```

All other nav items remain the same for all roles.

---

## 6. Free vs Premium Split (designed now, enforced later)

### Free Tier (MVP — everything is free)
- Full workout tracking with guided sessions
- Access to all official programs
- Create 1 personal program
- Basic progress: streaks, session history, calendar
- Public user profile with PR showcase
- Profile comparison
- Onboarding flow

### Premium Tier (Phase 3 — Stripe integration)
- AI nutrition tracking (photo → macros) — has real API costs
- Unlimited personal program creation
- Advanced analytics (volume charts, exercise progression)
- Priority access to new featured programs
- Export workout data

### Implementation Note
The `tier` field on users exists from MVP but is not enforced. All features are accessible. When Stripe is added in Phase 3, premium gates check `user.tier === 'premium'` and show upgrade prompts for gated features.

---

## 7. Migration Plan

### PocketBase Migrations Needed

1. **Add `role` field to `users`**
   - Type: text, default `user`
   - Options: `user`, `editor`, `admin`

2. **Add `tier` field to `users`**
   - Type: text, default `free`
   - Options: `free`, `premium`

3. **Add `is_official` to `programs`**
   - Type: boolean, default `false`

4. **Add `is_featured` to `programs`**
   - Type: boolean, default `false`

5. **Add `difficulty` to `programs`**
   - Type: text, default `beginner`
   - Options: `beginner`, `intermediate`, `advanced`

6. **Update PB API rules** for role-based write access on new fields

7. **Set your user as `admin`** — direct PB admin update for the initial admin account

---

## 8. New Files to Create

| File | Purpose |
|------|---------|
| `src/pages/AdminPage.tsx` | Admin panel with users/programs/overview tabs |
| `src/pages/EditorPage.tsx` | Editor dashboard with own programs |
| `src/pages/UserProfilePage.tsx` | Public profile with stats + comparison |
| `src/hooks/useAdmin.ts` | Fetch users, update roles, program stats |
| `src/hooks/useUserProfile.ts` | Fetch public profile data for any user |
| `pb_migrations/XXXX_add_roles_and_program_flags.js` | Schema migration |

## 9. Files to Modify

| File | Change |
|------|--------|
| `src/App.tsx` | Add admin/editor/profile routes, pass role to sidebar |
| `src/hooks/useAuth.ts` | Expose `user.role` and `user.tier` |
| `src/hooks/usePrograms.ts` | Support filtering by `is_official`, `is_featured` |
| `src/hooks/useProgramEditor.ts` | Add `is_official` + `difficulty` fields for editors |
| `src/pages/ProgramsPage.tsx` | Official/community tabs, featured badges, difficulty tags |
| `src/pages/ProfilePage.tsx` | Link to public profile or redirect |
| `src/components/OnboardingFlow.tsx` | Filter to official programs, show featured first |
| `src/components/ui/sidebar.tsx` or `src/App.tsx` | Conditional admin/editor nav items |
