# apps/web — Social, Friends, Challenges, Referrals, Notifications

## Grade
**B+.** The dominant pattern across this scope is genuinely good: almost every page (Friends, ActivityFeed, Challenges, ChallengeDetail, Leaderboard, Referrals, Notifications, NotificationSettings, BlockedUsers) is a thin presentational layer over a `packages/core` hook, with real accessibility work (ARIA tabs, keyboard nav, live regions) and thoughtful UX details (distinct empty vs. error states, retry flows). It's pulled down by one page (`InviteLandingPage`) that breaks every one of those conventions at once, a genuinely broken (empty) medal-emoji constant shipped to two files, and a handful of small duplication/i18n leaks that recur enough to be a pattern rather than one-offs.

## Top 3 refactors
1. **Give `InviteLandingPage` a core hook and full i18n.** It's the only file in scope with raw `pb.collection`/`fetch` calls, embedded business rules (own-link redirect, challenge-vs-program preview), and ~30 lines of hardcoded Spanish UI copy that never touch `t()` — i.e., it would silently pass the `#444`/`#445` i18n usage guard while remaining untranslated.
2. **Fix and centralize the `MEDALS` constant.** `LeaderboardPage.tsx` and `LeaderboardWidget.tsx` both define `MEDALS = ['', '', '']` (empty strings) — the medal-emoji UI is silently broken in both — while `ChallengeDetailPage.tsx`, `ChallengesVisuals.tsx`, and both mobile leaderboard/challenge-detail screens correctly have `['🥇','🥈','🥉']`. One shared export (e.g. in `packages/core/lib/style-tokens`) would have made this bug impossible.
3. **Consolidate the `BASE_URL`/`relativeTime` duplication.** `https://gym.guille.tech` is hardcoded as a local `const BASE_URL` in 4 files in scope (plus one more inline), and a local `relativeTime()` is reimplemented twice even though a shared `timeAgo` already exists in `core/lib/dateUtils` and is used by sibling files in the same scope.

## Findings

### High

1. **Broken medal emojis (dead/wrong constant), duplicated 6x app-wide** — `apps/web/src/pages/LeaderboardPage.tsx:12`, `apps/web/src/components/friends/LeaderboardWidget.tsx:5`
   ```
   const MEDALS = ['', '', '']
   ```
   vs. the correct definition duplicated separately at `apps/web/src/pages/ChallengeDetailPage.tsx:23` (`['🥇', '🥈', '🥉']`), `apps/web/src/pages/features/ChallengesVisuals.tsx:34`, `apps/mobile/src/app/leaderboard.tsx:17`, `apps/mobile/src/app/challenges/[id].tsx:42`. Because the array is empty, `medal ? <span>{medal}</span> : <span>{position}</span>` (LeaderboardPage.tsx:167, LeaderboardWidget.tsx:34) always falls through to the plain number — top-3 users on the web Leaderboard page and the Home leaderboard widget never see a medal.
   Category: Correctness-smell / DRY. Fix: restore the emoji array and export a single `MEDALS` (or `RANK_MEDALS`) constant from `packages/core` that every consumer imports.

2. **`InviteLandingPage` embeds all data-fetching and business rules directly in the page** — `apps/web/src/pages/InviteLandingPage.tsx:60-156`
   Raw `fetch(pb.baseUrl + '/api/public/...')` calls, three separate `pb.collection(...).getFirstListItem` try/catches, and business rules (own-link detection, challenge-vs-program preview selection, redirect logic) all live inline in the component — the only file in this scope that does this. Every sibling page (Friends, ActivityFeed, Challenges, ChallengeDetail, Referrals, …) delegates this to a `packages/core` hook.
   Category: Separation-of-concerns / SOLID-SRP. Fix: extract a `useInviteLanding(code, challengeId)` core hook.

3. **`UserProfilePage` embeds a large multi-request data-fetch-and-shape pipeline in the component** — `apps/web/src/pages/UserProfilePage.tsx:87-205`
   ~120 lines inside a single `useEffect`: 4 sequential `pb.collection(...)` calls each in their own try/catch, a day-of-month calendar-filling loop, session mapping/sorting/labeling logic — none of it delegated to a hook, unlike every other stats-bearing page in scope which uses a core hook (`useLeaderboard`, `useChallengeDetail`, `useReferrals`, etc.).
   Category: Separation-of-concerns / SOLID-SRP. Fix: extract a `useUserProfile(userId)` hook in `packages/core` (mirrors the pattern already used everywhere else in this scope).

4. **`InviteLandingPage` bypasses i18n almost entirely** — `apps/web/src/pages/InviteLandingPage.tsx:190,211,274,288,299,303,315,333,341,344,346,352`
   Only one `t()` call in the whole file (`t('common.loading')`, line 161). Everything else is hardcoded Spanish: `"TU LINK DE INVITACION"`, `"Comparte este link con tus amigos..."`, `"Volver al inicio"`, `"te invito a entrenar juntos"`, `"CHALLENGE EXPRESS"`, `"reps / dia"`, `"PROGRAMA ACTUAL"`, `"Unirme al challenge"`, `"Ya tienes cuenta? Inicia sesion"`, etc. Since the recently-shipped i18n usage guard (`#444`/`#445`, memory: `project_i18n_usage_guard_444.md`) scans `t('…')` call sites, a page that never calls `t()` for its copy is invisible to that guard — this is exactly the kind of gap it can't catch.
   Category: Separation-of-concerns / Correctness-smell (i18n coverage gap). Fix: route all copy through `t()` with proper keys, matching the rest of the app.

### Medium

5. **`BASE_URL` hardcoded as a separate literal in 4+ files instead of one shared export** — `apps/web/src/lib/share.ts:3`, `apps/web/src/pages/InviteLandingPage.tsx:12`, `apps/web/src/components/referrals/InviteButton.tsx:8`, `apps/web/src/components/referrals/ChallengeExpressForm.tsx:11`, plus an inline literal at `apps/web/src/pages/ReferralsPage.tsx:181`
   All five hold `'https://gym.guille.tech'` as their own local constant/literal. `lib/share.ts`'s `BASE_URL` isn't even exported, so the others can't reuse it even if they wanted to.
   Category: DRY. Fix: export `BASE_URL` from `lib/share.ts` (or a shared config module) and import it everywhere.

6. **`relativeTime()` reimplemented twice instead of reusing the shared `timeAgo` helper** — `apps/web/src/pages/NotificationsPage.tsx:21-35`, `apps/web/src/components/friends/ActivityFeedWidget.tsx:6-15`
   Both hand-roll a minute/hour/day formatter with different output shapes, while `apps/web/src/pages/ActivityFeedPage.tsx:5` and `apps/web/src/components/social/CommentsSheet.tsx:4` already import `timeAgo` from `@calistenia/core/lib/dateUtils` for the same purpose (session/comment timestamps) in the very same scope.
   Category: DRY. Fix: extend `core/lib/dateUtils.timeAgo` to cover both formats (or add a `compact` option) and drop the local reimplementations.

7. **`window.confirm()` used for consequential actions instead of the app's own dialog pattern** — `apps/web/src/pages/UserProfilePage.tsx:325` (block user), `apps/web/src/pages/ChallengesPage.tsx:57` (join a preset challenge)
   Both flows build the confirm message from `t()` strings, but present it via the blocking native `window.confirm` rather than the `Dialog`/`ReportDialog` component already used elsewhere in this same scope for comparable confirmations (see `ReportDialog.tsx`). Native `confirm()` can't be styled, isn't part of the app's a11y/animation system, and per project history has caused real interaction bugs (`window.confirm` freezing Chrome during automated joins — memory `project_epic_345_closeout.md`).
   Category: Composition / Correctness-smell. Fix: replace with the existing `Dialog` primitives (`components/ui/dialog`) for a consistent, non-blocking confirmation UI.

8. **Widespread hardcoded Spanish strings mixed into otherwise-i18n'd files** — representative sample: `apps/web/src/pages/FriendsPage.tsx:87` (`'Calistenia App'`), `apps/web/src/pages/ActivityFeedPage.tsx:224-225,264` (`'Hizo cardio'`, hardcoded share text), `apps/web/src/pages/CreateChallengePage.tsx:421,430,438` (`"Sigue a alguien primero..."`, `"BUSCAR AMIGOS"`, `"INVITAR POR WHATSAPP"`), `apps/web/src/pages/ChallengeDetailPage.tsx:422,463` (`"(tu)"`), `apps/web/src/pages/AddFriendPage.tsx:28` (`"Siguiendo..."`), `apps/web/src/components/referrals/ChallengeExpressForm.tsx:85` (`"CHALLENGE EXPRESS"`), `apps/web/src/lib/share.ts:102,109` (`shareRace`/`shareApp` hardcode Spanish text and `'Calistenia App'` while every sibling function in the same file routes through `i18n.t(...)`)
   Every one of these files otherwise uses `useTranslation()`/`t()` correctly, but has a handful of leftover raw strings — the pattern is broad enough (9+ files) to be worth a guardrail rather than one-off fixes.
   Category: Correctness-smell (i18n consistency). Fix: sweep for JSX text nodes / string literals not wrapped in `t()` in this scope; consider extending the `#444` usage-guard test to flag suspicious hardcoded Spanish text (e.g. via a lint rule on raw non-ASCII string literals in JSX).

9. **Two independent "search and pick an exercise" implementations in the same scope** — `apps/web/src/pages/CreateChallengePage.tsx:143-158` (uses `getAllCatalogEntries()`/`stripAccents` from `packages/core`, local in-memory filter) vs. `apps/web/src/components/referrals/ChallengeExpressForm.tsx:42-58` (fetches `pb.collection('exercises_catalog')` directly and filters client-side against a different data source/shape)
   Both solve "type to search, pick an exercise, show a dropdown" for challenge creation, but neither reuses the other, and they don't even query the same source (local catalog constant vs. live PocketBase collection) — they can drift.
   Category: DRY / Separation-of-concerns. Fix: extract one shared `ExercisePicker` component (or hook) backed by one data source.

### Low

10. **Two parallel hook instances just to compare "me" vs. "them"** — `apps/web/src/pages/UserProfilePage.tsx:84-85`
    ```
    const { stats: otherCompareStats, ... } = useProfileCompare()
    const { stats: myCompareStats, ... } = useProfileCompare()
    ```
    Works, but duplicates loading/error state plumbing for what's conceptually one compare operation. A hook shaped like `useProfileCompare(otherId, myId)` returning both sides would remove the duplication.
    Category: KISS / SOLID-ISP.

11. **Hardcoded `'es'` locale for date formatting instead of the active language** — `apps/web/src/pages/UserProfilePage.tsx:547`
    ```
    const formattedDate = dateObj.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })
    ```
    `apps/web/src/pages/ActivityFeedPage.tsx:204` does the equivalent formatting correctly with `i18n.language`. Non-Spanish users get Spanish weekday/month names on their own recent-sessions list.
    Category: Correctness-smell.

12. **Deprecated `document.execCommand('copy')` fallback left in one file after being deliberately removed from its sibling** — `apps/web/src/pages/ReferralsPage.tsx:188-198`
    `apps/web/src/pages/FriendsPage.tsx:94-104` has a comment `// [M1 fix] Removed deprecated document.execCommand fallback — just show feedback`, i.e. this exact issue was already identified and fixed once in this scope, but the fix didn't propagate to `ReferralsPage.tsx`'s own copy-link implementation.
    Category: DRY / Spaghetti (missed fix propagation).

13. **Check-then-create race in push subscription dedup** — `apps/web/src/lib/push-subscription.ts:64-79`
    `getFirstListItem(...)` followed by a `create()` in the `catch` branch is a classic TOCTOU; two concurrent calls could both miss and both create. Low risk in practice (subscribe is user-gesture-triggered, roughly once), but the same pattern recurs (`unsubscribeFromPush` too).
    Category: Correctness-smell.

## Done well

- **Hooks-first architecture is the norm, not the exception.** Friends, ActivityFeed, Challenges, ChallengeDetail, CreateChallenge, Leaderboard, Referrals, Notifications, NotificationSettings, and BlockedUsers all delegate fetching/mutation/derivation entirely to `packages/core` hooks and stay presentational — this is exactly the separation the audit brief asks for, applied consistently.
- **`FriendsPage.tsx` accessibility work is genuinely thorough**: WAI-ARIA tabs pattern with roving `tabIndex`/arrow-key navigation (`handleTabKeyDown`), 44px touch targets called out explicitly, `aria-live` regions scoped only to status text (not the whole list), `noopener,noreferrer` on `window.open`. Comments (`[H1 fix]`, `[H2 fix]`, `[C1 fix]`...) show these were deliberate audit fixes, not accidents.
- **`ReferralErrorState.tsx`** correctly distinguishes "no data yet" from "couldn't load data" instead of collapsing both into a fake empty state — the comment explicitly calls out *why* ("mostrar 0 referidos cuando PocketBase está caído sería mentir sobre el dato").
- **`ReferralHowItWorks.tsx`** pulls its point-value copy from the same core constants (`REFERRAL_SIGNUP_POINTS`, `REFERRAL_BONUS_POINTS`) that the server hook uses, with an explicit comment explaining this is to prevent the UI from promising a number the server won't actually credit.
- **`ChallengeDetailPage.tsx`** cleanly branches goal-vs-ranking layout via `getChallengeLayout`/`getGoalProgress` from `packages/core`, keeping the web/mobile layout decision in one shared place rather than reimplementing the branch logic per platform.

## Files reviewed
Read fully: `pages/UserProfilePage.tsx`, `pages/FriendsPage.tsx`, `pages/ActivityFeedPage.tsx`, `pages/ChallengeDetailPage.tsx`, `pages/CreateChallengePage.tsx`, `pages/ChallengesPage.tsx`, `pages/ReferralsPage.tsx`, `pages/InviteLandingPage.tsx`, `pages/NotificationsPage.tsx`, `pages/LeaderboardPage.tsx`, `pages/BattleInviteLandingPage.tsx`, `pages/NotificationSettingsPage.tsx`, `pages/BlockedUsersPage.tsx`, `pages/AddFriendPage.tsx`, `components/social/CommentsSheet.tsx`, `components/social/ReportDialog.tsx`, `components/social/EmojiPicker.tsx`, `components/social/NotificationBadge.tsx`, `components/friends/LeaderboardWidget.tsx`, `components/friends/ActivityFeedWidget.tsx`, `components/referrals/*.tsx` (all 7), `components/FeaturedChallengeCard.tsx`, `components/ShareButton.tsx`, `contexts/NotificationsContext.tsx`, `lib/share.ts`, `lib/notifications.ts`, `lib/push-subscription.ts`.

Skimmed (grep only, for DRY cross-checks against out-of-scope files): `components/PRShareCard.tsx`, `components/StreakMilestone.tsx`, `components/WorkoutShareCard.tsx`, `components/cardio/CardioShareCard.tsx`, `pages/features/ChallengesVisuals.tsx`, `components/insights/*.tsx`, `apps/mobile/src/app/leaderboard.tsx`, `apps/mobile/src/app/challenges/[id].tsx`.

Not skimmed / not touched: `components/social/EmojiPicker.tsx` mobile counterpart and other mobile files (out of scope per assignment, referenced only for duplication confirmation).
