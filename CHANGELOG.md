# Changelog — Calistenia (mobile)

All notable changes to the Calistenia mobile app are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> Generated from curated, AI-assisted release notes — do not edit by hand. Source: `packages/core/data/changelog.mobile.json` · regenerate with `pnpm changelog:md`. A Spanish version lives in [`CHANGELOG.es.md`](./CHANGELOG.es.md).

## [Unreleased]

_Nothing yet._

## [1.10.0] - 2026-08-15

_Real battle results with rematch and a share card, profile photo from your phone, workouts without signal that no longer get lost, and the Push-up Builder challenge switched on._

### Added

- **Battle results, rematch and share card** — When a battle ends you get a results screen written for you: whether you won, tied (ties now share a rank instead of crowning a random winner) or left. Ask for a rematch with one tap — your rival gets the invite as a notification — and share the result as a card with names and scores, with no links into the battle.
- **Profile photo from the app** — Tap the circle on your profile to set a photo from the camera or your gallery, square crop included, or remove it. Until now this was web-only.
- **Push-up Builder challenge switched on** — The beginner preset that was greyed out can now be started: it adds up every standard push-up you log over 30 days until you hit 100. Challenge details also adapt to their shape: with a goal, your progress comes first; without one, the leaderboard fills the screen and your row stays in view while you scroll.

### Fixed

- **Training without signal no longer gets lost** — Sets and completed workouts logged with no connection used to stay only on your phone and vanish on the next load. They now go through the retry queue and upload themselves when you are back online, with no duplicates even if the first attempt actually made it.
- **The scoreboard counts plank time** — Holding a 30 s plank in a battle left your row at 0: the data was saved but never shown. The live leaderboard, the result, the history and the waiting screen now show your work seconds. The "you're done" screen now leads with your rank ("1st of 2") and puts the live scoreboard first.
- **Small fixes** — Collapsible section chevrons now rotate instead of vanishing (in Nutrition they were not visible at all). Push notifications reach the right account when you switch users on the same phone. Labels that showed up raw (like "workout.skip") are translated, and "1 awakening" no longer reads as a plural.

## [1.9.0] - 2026-08-14

_Community programs with weekly milestones so you can follow a real plan, profile stats that finally count every workout you do, and battles that now use the same training screen as a regular session._

### Added

- **Community programs** — Join "30 days of calisthenics" and follow a plan with weekly milestones. Your week 1 starts the day you join — no waiting for a Monday — and progress is worked out from what you actually train: edit or delete a session and the milestone corrects itself. You can leave and come back without losing your place.
- **Battles with the real training screen** — Circuit battles now use the same rest screen and timer as a regular session, with the same cues and haptics, instead of a half-built screen of their own. On top of that, anyone you have blocked can no longer join your battle or watch the live scoreboard.
- **Your route on the results card** — When you finish a race, the results card now draws the route you ran. And if you hit save before the route has loaded, the workout is no longer saved without it.
- **Creating and following challenges, simpler** — The metric picker shows the four common ones and tucks the rest behind "More metrics", so creating a challenge is no longer a wall of options. Challenge dates read as dates instead of stray times, the empty state no longer kicks you out to the browser, and express challenges work end to end.
- **A bit more privacy** — The GPS track of your races is now yours alone: other people see your position and your result, but not the streets you ran. And your account’s private data no longer travels to other people when your name and photo show up on a wall or a leaderboard.
- **Referrals: status and reward in plain sight** — You can now see who you invited, what state each invitation is in and which reward you have earned, both in the app and on the web.

### Fixed

- **Your stats count again** — Your profile and the Leaderboard showed 0 sessions and a 0-day streak if you trained with strength sessions, even when the calendar on that same screen had your data. All three session types — strength, circuit and cardio — now count towards your total and your streak.

## [1.8.0] - 2026-08-12

_Real-time circuit battles against your friends, plus a thorough privacy pass: your health data is no longer visible to anyone else._

### Added

- **Circuit battles** — Challenge your friends to a circuit and race them live, seeing where everyone is in real time. Floating bar while it runs, alerts when someone joins or it starts, rest between exercises, and a history with head-to-head comparison in Progress.
- **Your health data stays yours** — The heart rate and calories your watch measures, your water and weekly training goals, and your food and weight logs are no longer visible to other people. The wall and the ranking work exactly as before: only what you see on screen is shared.
- **Blocking now really blocks** — When you block someone, they can no longer see your profile, your workouts or your live position in a race, and none of their notifications reach you. Before, they were only stopped from interacting.
- **Easier challenges to start** — Ready-made challenges you can join from zero with one tap, cumulative scoring that adds up everything you do during the challenge, and a featured challenge on the home screen.
- **Free sessions** — Train without following a program: build the session as you go and it gets logged like any other, in your history and your calendar.

### Fixed

- **Friend search works now** — Searching for someone by name never returned anything, because of a bug in the search itself. It finds people now.

## [1.7.1] - 2026-08-07

_Fixes 1.7.0: the app rendered completely broken, with no styles or fonts. It now looks the way it should._

### Fixed

- **The app looks right again** — If the app looked broken after updating to 1.7.0 — text stuck to the edge, no fonts — it is fixed now. Nothing for you to do: your data and session are untouched.

## [1.7.0] - 2026-08-05

_Edit each food portion and macros recalculate automatically, a tidier AI suggestion, in-app account deletion, and more privacy for your cardio routes._

### Added

- **Editable portion** — Adjust each food amount right on its card and calories and macros recalculate instantly.
- **Collapsible AI suggestion** — The coach suggestion when logging a meal now starts collapsed: open it only when you want it.
- **Account deletion** — Delete your account and all your data right from the app, no external steps.

### Fixed

- **Challenge-ended alert** — The challenge-ended notification now arrives at the right moment, when the challenge actually ends.
- **Private cardio routes** — Your cardio GPS routes are now visible only to you: no one else can look them up.
- **Cleaner meal analysis** — Meal photo analysis texts no longer show odd citations or URLs from web search.

## [1.6.0] - 2026-07-20

_Build your own programs on mobile, log your sleep with an AI summary, change your nutrition goal anytime, and celebrate your achievements properly._

### Added

- **Program editor** — Create and edit your own programs on mobile: phases, days (strength, cardio or circuit) and catalog exercises, in a 4-step wizard.
- **Sleep with AI summary** — Log your sleep right in the app and get an AI analysis of your pattern: consistency, caffeine, screens and more.
- **Editable goal** — Change your nutrition goal anytime with a calorie and macro preview, and edit your body data from your profile.
- **Achievement celebration** — Nutrition badges now get a proper celebration screen — earn several at once and see them in sequence.
- **Report content** — Report inappropriate users or comments from their profile or the comments sheet; our team reviews them.

### Fixed

- **Sturdier onboarding** — Sign-up can no longer silently lose your profile: if saving fails you are told and can retry.

## [1.5.0] - 2026-07-18

_A guided getting-started checklist on Home, a «Discover» directory of all 21 app features, and empty screens that now teach you how to use them._

### Added

- **Getting started** — A new Home checklist with 6 activation steps, a progress bar, and a shortcut to each one.
- **Discover** — A new section in your profile lists all 21 app features by category, each one a tap away.
- **Guided empty states** — History, library, calendar and other screens now explain what to do when they're empty, with a direct action button.

### Fixed

- **Session-swipe crash** — Fixed the app closing unexpectedly when swiping between exercises mid-workout.

## [1.4.0] - 2026-07-17

_Smarter onboarding: set your primary goal, measure your waist-to-height ratio and pick your language. Plus, resume your strength session on any device._

### Added

- **Primary goal** — Onboarding now asks for your primary goal in a structured way and tailors recommendations to it.
- **Waist-to-height ratio** — New waist measurement during onboarding to compute your waist-to-height ratio (WHtR), a more reliable health indicator than BMI alone.
- **ES/EN language** — Choose between Spanish and English right from onboarding, on web and in the app.
- **Resume your session anywhere** — Your in-progress strength session syncs to the server: start on your phone and continue on the web, or the other way around.

## [1.3.2] - 2026-07-14

_Tap a friend's name in the feed to open their profile._

### Added

- **Profile from the feed** — Tapping an activity's author opens their profile. We also warn you if block/unblock fails.

## [1.3.1] - 2026-07-14

_Blocking users is now clearer and faster from the profile._

### Added

- **Block redesigned** — New ⋯ menu on profiles to block, and a clear notice with an unblock button when a user is blocked.

## [1.3.0] - 2026-07-14

_You can now block users: their activity disappears for you across the whole app._

### Added

- **Block users** — Block any user from their profile: you unfollow each other and their activity disappears from your feed, comments, reactions, leaderboards and challenges.
- **Blocked users management** — New screen in your profile to review and unblock users anytime.
- **No noise** — A blocked user can't comment on your activity, follow you or send you notifications.

## [1.2.1] - 2026-07-13

_Mejoras y correcciones de esta versión._

### Added

- **web** — Página de eliminación de cuenta para Google Play
- **web** — Página de política de privacidad para Google Play
- **mcp** — Widgets visuales para despensa y recetas (8 nuevos, 19 total) (#202)
- **deps** — Tailwindcss+vitest bumps in apps/web (#146 parte 3a) — Vite 8 reverted, blocked upstream (#200)

## [1.2.0] - 2026-07-10

_Timed races get real ranking and a red countdown, and going offline no longer logs you out or loses your data._

### Added

- **Real ranking in timed races** — Timed races now rank by distance covered instead of who synced first. The winner is tagged "Went furthest".
- **Red final countdown** — The race's final 10 seconds turn red with a haptic + sound tick every second, so you know exactly when to push.

### Fixed

- **No connection no longer logs you out** — Opening the app without internet used to log you out and could silently lose workouts saved while offline. Fixed — your session and offline data now survive starting up with no connection.
- **Zero now counts** — Setting a macro to 0g or a circuit rest to 0s used to fall back to a default instead of respecting the zero you picked. Now it sticks.

### Security

- **Dependencies updated** — Updated the PocketBase SDK and patched a low-severity vulnerability in an internal library.

## [1.1.0] - 2026-07-03

_Your weekly insights level up: history, trends, an actionable tip, and an automatic summary every Monday._

### Added

- **Your weeks: insights history** — A new screen collects your past weekly summaries so you can spot patterns over time. Filter them by week or month.
- **Actionable suggestion** — When it fits, your summary proposes a concrete next step and takes you there in one tap (reminders, nutrition, or a free session).
- **Weekly trend** — Each summary shows whether you're trending up, flat, or down versus last week with an ↑ / → / ↓ badge.
- **Automatic weekly summary** — No need to generate it by hand anymore — every Monday morning we prepare your summary and let you know with a notification.

## [1.0.9] - 2026-07-03

_Weekly insights across your metrics, plus a 1,578-exercise catalog with filters and challenges._

### Added

- **Your weekly insights** — The app cross-references your sleep, workouts, nutrition, water and weight to surface your week's patterns with one actionable tip. Tap "Generate" on Home.
- **Catalog expanded to 1,578 exercises** — The exercise catalog grows from 307 to 1,578 exercises, with Spanish names and instructions (98% with a description). No third-party GIFs for now.
- **Library filters on mobile** — Filter the library by difficulty, equipment and muscle group — now matching the web.
- **"No equipment" filter** — New filter to show only pure bodyweight exercises (454 in the catalog).
- **Muscle groups and level-based variants** — Filter chips for 15 canonical muscle groups, plus a new "Variants" section on every exercise grouped by level — easier, same level, harder.
- **Related exercises** — Every exercise now suggests "Related" picks — similar movements by muscle that aren't variations of the same exercise.
- **Per-exercise challenges** — Create a challenge on any catalog exercise (e.g. "30-day pull-up PR") from the web; the leaderboard scores your best logged set.
- **PRs with added weight** — Personal records now estimate your e1RM when you log added weight.
- **AI free session skips gym by default** — The AI free session skips gym-equipment exercises unless you turn them on.

### Fixed

- **Translation fixes** — 8 exercises (like Muscle up) no longer show their description in English when the app is set to Spanish, and the difficulty chip on the exercise detail now translates correctly.

## [1.0.7] - 2026-06-24

_When a meal-photo analysis fails, you now see the real error instead of a silent failure._

### Fixed

- **Clearer meal-analysis errors** — If a meal-photo analysis fails, the app shows the real error message so you know what happened. Failures are also reported automatically so they get fixed sooner.

## [1.0.6] - 2026-06-24

_Pick the app theme —light, dark or automatic— and reopen what's new anytime to browse every version._

### Added

- **Light & dark theme** — Switch between light, dark or system mode from your profile. Your choice is remembered next time you open the app.
- **What's-new history** — Open what's new anytime from your profile and review every previous version.

## [1.0.5] - 2026-06-24

_Circuits and timed workouts, smartwatch data import, and richer nutrition sharing._

### Added

- **Circuits in free sessions** — Build circuits with rounds, rest between exercises and between rounds — then train them with a full-screen timer.
- **Timed workouts** — Timed mode: set work and rest seconds per exercise and let the app guide you through it.
- **Smartwatch import** — Connect Health Connect to bring steps, sleep, heart rate, weight and more into your calendar and nutrition.
- **Nutrition share cards** — New nutrition cards to share your day with each meal's thumbnail, name and macros.

### Fixed

- **Cardio share maps** — Fixed the blank map when sharing cardio sessions — your route shows up again.

## [1.0.4] - 2026-06-22

_A unified calendar, meal timing, and a full look back at your past sessions._

### Added

- **Unified calendar** — See all your activity — workouts, cardio, meals, sleep, water and weight — in one monthly view.
- **Meal timing** — Log when you eat and how long each meal lasts, with a daily nutrition-quality score.
- **Past-session details** — Tap any past workout or cardio to see the full breakdown: sets, reps, route and map.
- **Quick-access menu** — A new ☰ menu takes you in one tap to free sessions, community, races and reminders.
- **Free-session templates** — Save your AI free sessions and reuse them anytime — no need to regenerate.
- **Clearer exercise guides** — Exercises now include tempo cues and clearer demo media to keep your form sharp.

### Fixed

- **Lock-screen controls** — Your live workout and cardio now stay visible and controllable from the lock screen (incl. Xiaomi/MIUI).

### Changed

- **Smoother app** — A performance sweep across several screens so everything feels lighter.

## [1.0.3] - 2026-06-19

_Push notifications and richer social activity._

### Added

- **Push notifications** — Get notified when friends hit streaks, finish workouts or send you a nudge.
- **Friend activity** — Friend streaks, achievements and workouts now show up in your feed and notifications.

## [1.0.2] - 2026-06-17

_An activity feed, shareable cards, and a more delightful session finish._

### Added

- **Activity feed** — See recent friend and personal activity on Home, with program search and filters.
- **Session-complete delight** — Confetti, dynamic taglines and timing animations when you finish a workout.
- **Shareable cards** — Share your streak and session summary as an image.

### Fixed

- **Google login fix** — Fixes the infinite hang when signing in with Google on Honor/MagicOS.

## [1.0.1] - 2026-06-15

_Redesigned comments with push, local reminders, and better performance._

### Added

- **Redesigned comments** — A new comments UI with native keyboard and push notifications for comments and reactions.
- **Local reminders** — Schedule workout reminders right on your phone.

### Changed

- **Data performance** — Faster data loading and sync.

## [1.0.0] - 2026-06-13

_The first mobile release: onboarding, programs, AI nutrition and guided sessions._

### Added

- **First mobile release** — The Calistenia app arrives on Android with your program, sessions and progress.
- **Smart onboarding** — We match you with the right programs based on your level and goals.
- **AI meal logging** — Log meals by describing them in text and let AI estimate the macros.
- **Guided sessions** — Train with step-by-step sessions that respect your injured joints.

[unreleased]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.10.0...HEAD
[1.10.0]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.9.0...mobile-v1.10.0
[1.9.0]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.8.0...mobile-v1.9.0
[1.8.0]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.7.1...mobile-v1.8.0
[1.7.1]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.7.0...mobile-v1.7.1
[1.7.0]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.6.0...mobile-v1.7.0
[1.6.0]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.5.0...mobile-v1.6.0
[1.5.0]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.4.0...mobile-v1.5.0
[1.4.0]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.3.2...mobile-v1.4.0
[1.3.2]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.3.1...mobile-v1.3.2
[1.3.1]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.3.0...mobile-v1.3.1
[1.3.0]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.2.1...mobile-v1.3.0
[1.2.1]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.2.0...mobile-v1.2.1
[1.2.0]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.1.0...mobile-v1.2.0
[1.1.0]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.0.9...mobile-v1.1.0
[1.0.9]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.0.7...mobile-v1.0.9
[1.0.7]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.0.6...mobile-v1.0.7
[1.0.6]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.0.5...mobile-v1.0.6
[1.0.5]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.0.4...mobile-v1.0.5
[1.0.4]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.0.3...mobile-v1.0.4
[1.0.3]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.0.2...mobile-v1.0.3
[1.0.2]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.0.1...mobile-v1.0.2
[1.0.1]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.0.0...mobile-v1.0.1
[1.0.0]: https://github.com/guillermoscript/calistenia-app/releases/tag/mobile-v1.0.0
