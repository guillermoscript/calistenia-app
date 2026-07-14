# Changelog — Calistenia (mobile)

All notable changes to the Calistenia mobile app are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> Generated from curated, AI-assisted release notes — do not edit by hand. Source: `packages/core/data/changelog.mobile.json` · regenerate with `pnpm changelog:md`. A Spanish version lives in [`CHANGELOG.es.md`](./CHANGELOG.es.md).

## [Unreleased]

_Nothing yet._

## [1.3.1] - 2026-07-14

_Mejoras y correcciones de esta versión._

### Added

- **mobile** — Rediseño UI de bloqueo — menú ⋯ en perfil, variant danger, banner bloqueado

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

[unreleased]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.3.1...HEAD
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
