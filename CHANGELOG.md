# Changelog — Calistenia (mobile)

All notable changes to the Calistenia mobile app are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> Generated from curated, AI-assisted release notes — do not edit by hand. Source: `packages/core/data/changelog.mobile.json` · regenerate with `pnpm changelog:md`. A Spanish version lives in [`CHANGELOG.es.md`](./CHANGELOG.es.md).

## [Unreleased]

_Nothing yet._

## [1.12.0] - 2026-08-26

_The training-programs release: build and edit them end to end, share or remix them with credit to the author, and the app tells you which week you are on and how many reps you owe today. Training stats also land, and circuit days finally work._

### Added

- **Build and edit full programs from your phone** — The editor covers the whole program: phases, days, exercises and their catalog fields, with validation on steps 3 and 4 so you never publish a half-finished program. You can copy a day or an entire phase, upload the cover and an image or video per exercise, and from the program page edit, duplicate, leave or delete it.
- **Auto progression: the app tells you what to do today** — Each program exercise looks at what you did last time and suggests today’s reps or seconds. When a variation gets too easy it proposes the next one, so you keep progressing without tracking it yourself.
- **You always know which week and phase you are on** — The program shows “week X of Y” and moves to the next phase on its own as you advance, with no setting to touch. Progress is computed from what you actually trained.
- **Share your programs and remix other people’s** — Every program picks whether it is private, link-only or public, and the link opens a page anyone can see without an account. If you start from someone else’s program, your copy carries a “based on X by @author” credit, and each program shows how many people follow it.
- **Training stats** — A new view with the muscles you train most, your most frequent exercises, your personal records and the trend over recent weeks.

### Fixed

- **Circuit days finally work** — A circuit day now starts an actual circuit and, once finished, marks the day done and counts toward the program milestone — before it stayed blocked forever. And if the author deletes a program you were enrolled in, we now tell you instead of leaving you with a dead enrollment.

## [1.11.1] - 2026-08-23

_The cardio history gets filters by type, opens the detail straight from the row and adds a competition search. The app also now asks Health Connect only for the data it actually uses._

### Added

- **Cardio history with filters and direct detail** — You can filter the history by session type and open the detail by tapping the row, with no extra steps. A search box for finding competitions is also included.

### Fixed

- **Health Connect asks for less of your data** — The app used to request twelve health data types and several went unused. It now requests only seven, each with a screen that shows it to you: steps, active calories, heart rate, resting HR, sleep, weight and body fat. As a trade-off, the HRV and VO₂ max metrics are gone from “Watch & health”. If your watch was already connected, revoke and re-grant the permissions in Health Connect for the change to apply.

## [1.11.0] - 2026-08-23

_The feed now covers everything you do — free sessions, cardio, circuits, challenges, races and battles — your profile gets an athlete card with your numbers and personal bests, and you can make your account private and approve who follows you._

### Added

- **The feed covers all your activity** — Until now the feed only showed program workouts, and free sessions appeared with no title. It now covers six kinds of activity: program session, free session, cardio, circuit, challenge, race and battle. Scrolling down no longer repeats posts either.
- **Profile with an athlete card** — Your profile now leads with you: level, program week, your numbers and your skills. Settings move to the bottom as a list with one row per topic that unfolds in place, so you edit without leaving the screen.
- **Private accounts with approval** — Turn on "Private account" and anyone who wants to follow you has to ask: you approve or decline from notifications. The button becomes REQUEST / REQUESTED, private profiles show a lock instead of zeros, and in challenge leaderboards private accounts are hidden from others without throwing off the participant count.

### Fixed

- **Sharing a session, and seeing all of it** — The link you share for a session used to show the person opening it their own progress instead of yours — fixed. And a session with no sets now lists its timed exercises instead of just saying "no sets recorded".
- **The leaderboard stops reloading itself** — The leaderboard screen kept reloading itself in the background, burning data and battery. It now loads once, and usage stats reflect what you actually do.

## [1.10.2] - 2026-08-22

_Official programs show their training days again: the week no longer looks like rest only. Plus internal stability improvements._

### Fixed

- **Programs have their week back** — Twelve official programs showed an empty week (only Saturday and Sunday as rest) with nothing to train. They now have their Monday-to-Saturday days with the right workout type, and if any is still off, the app fixes it on load.

## [1.10.1] - 2026-08-21

_Home-screen widgets for your streak, meals, water and next session; private accounts with follower approval; battle results with rematch and a share card; and a solid batch of fixes to cardio and offline saving._

### Added

- **Home-screen widgets** — Add your streak (also as a 2x2, now showing the real current streak), your meal streak, today's water and your next session to your home screen. The Today widget shows more at a glance.
- **Private accounts** — You can now make your account private: anyone who wants to follow you has to ask, and you approve or decline. The server decides what is visible, so your workouts stay out of the feed and leaderboards of anyone you haven't approved.
- **Battles: results, rematch and share card** — When a battle ends you get a results screen with everyone's placing, a one-tap rematch and a share card. Ties now show as ties on the scoreboard, the waiting room and history, and timed work shows up on the scoreboard.
- **Challenges: Push-up Builder and a new detail view** — A new ready-made challenge, Push-up Builder, with cumulative scoring. The challenge detail now has two views, goal and ranking, and expired challenges are closed automatically on the server instead of lingering open.
- **Profile photo from the app** — Change your profile photo right from your phone, no need to go through the web.

### Fixed

- **More reliable offline saving** — Sets, sessions and circuits that can't be saved without signal are queued and retried on their own once you're back online.
- **Cardio: history and accidental sessions** — The cardio history and some other lists could show up empty on open — fixed. Stopping a cardio session after a few seconds now discards it instead of saving a 0-metre workout, and the stray English text in cardio and races is translated.
- **Small fixes** — Text on the lime colour is readable in light mode, collapsible chevrons rotate properly, push notifications keep arriving after switching accounts on the same phone, and saving a program no longer deletes and recreates its days.

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

[unreleased]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.12.0...HEAD
[1.12.0]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.11.1...mobile-v1.12.0
[1.11.1]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.11.0...mobile-v1.11.1
[1.11.0]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.10.2...mobile-v1.11.0
[1.10.2]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.10.1...mobile-v1.10.2
[1.10.1]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.9.0...mobile-v1.10.1
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
