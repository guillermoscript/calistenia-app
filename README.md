<div align="center">

# 🏋️ Calistenia

### Your AI calisthenics & fitness coach — workouts, nutrition, and progress in one app.

Train with a structured calisthenics program, log every set, track your nutrition, run cardio with live GPS, and let an AI coach adapt the plan to you. Free, open source, and self-hostable.

**[📱 Download the Android app](https://gym.guille.tech/download)** &nbsp;·&nbsp; **[🌐 Try the web app](https://gym.guille.tech)** &nbsp;·&nbsp; **[⭐ Star this repo](https://github.com/guillermoscript/calistenia-app)**

![React Native](https://img.shields.io/badge/React_Native-Expo-000?logo=expo)
![React](https://img.shields.io/badge/Web-React_+_Vite-61DAFB?logo=react&logoColor=000)
![PocketBase](https://img.shields.io/badge/Backend-PocketBase-b8dbe4?logo=pocketbase&logoColor=000)
![License: MIT](https://img.shields.io/badge/License-MIT-green)

</div>

---

## Why Calistenia?

Most fitness apps are paywalled, bloated, or cloud-locked. Calistenia is the opposite:

- **🤖 AI coach built in** — get a personalized plan, ask questions, and let the app adjust your training and nutrition.
- **🏃 One app for everything** — strength, calisthenics skills, cardio with GPS, nutrition, and habits, instead of five separate apps.
- **📵 Works offline** — all your data writes fall back to local storage when you're off the grid. Nothing is lost.
- **🔓 Free & open source (MIT)** — no subscription, no ads. Self-host it on a cheap VPS and own your data.
- **📲 Real native app + web PWA** — install the Android APK or use it in any browser.

> **Get it now:** [gym.guille.tech/download](https://gym.guille.tech/download) (Android) or [gym.guille.tech](https://gym.guille.tech) (web).

## Features

### 💪 Training
- **Structured 6-month program** — 4 progressive phases (Base → Strength → Intensity → Peak) with daily workouts.
- **Session tracking** — step through exercises one by one, log sets, reps, and notes.
- **Rest & isometric timers** — auto-start rest countdowns and hold timers with audio + haptic cues.
- **Form videos inline** — tap any exercise to watch a tutorial without leaving the app.
- **Circuits & HIIT** — timed circuit/interval workouts with round tracking.

### 🥗 Nutrition
- **Food & macro logging** — track calories and macros, snap photos, and hit daily targets.
- **AI nutrition scoring** — quality feedback on what you eat, not just calorie counting.

### 🏃 Cardio
- **Live GPS sessions** — track route, distance, and pace on a map (MapLibre), with a foreground service so it keeps running in your pocket.
- **Races & challenges** — set distance goals and compete.

### 🎮 Engagement
- **Gamification** — streaks, badges, and achievements to keep you coming back.
- **Social** — comments and reactions on sessions, with push notifications.
- **Reminders** — local notifications so you never skip a workout.
- **Home-screen widgets** — today's workout, weekly cardio km, and a calories ring, right on your Android home screen.

## Tech stack

A pnpm monorepo with shared business logic across native and web.

| Part | Stack |
|---|---|
| **Mobile** (`apps/mobile`) | React Native + Expo, expo-router, MapLibre, Notifee, Sentry, Android widgets |
| **Web** (`apps/web`) | React + Vite, Tailwind CSS, shadcn/ui, PWA |
| **Shared core** (`packages/core`) | Cross-platform hooks, data layer, i18n (EN/ES) |
| **AI / MCP** (`mcp-server`) | MCP server + AI API for the coach and smart tools |
| **Backend** | PocketBase (SQLite, self-hosted) — 30+ collections, migration-driven |
| **Testing** | Playwright |

## Repo layout

```
calistenia-app/
├── apps/
│   ├── mobile/      # Expo React Native app (Android APK + iOS)
│   └── web/         # React + Vite PWA
├── packages/
│   └── core/        # Shared hooks, data, locales
├── mcp-server/      # AI coach + MCP tools
├── pb_migrations/   # PocketBase schema migrations
└── pocketbase       # PocketBase binary
```

## Getting started

Requires **Node 20+** and **pnpm 10+**.

```bash
# 1. Install deps (whole monorepo)
pnpm install

# 2. Start PocketBase (backend + API)
pnpm pb:serve
# Admin UI: http://127.0.0.1:8090/_/  (create admin on first run)

# 3a. Run the web app
pnpm --filter @calistenia/web dev      # http://localhost:5173

# 3b. Run the mobile app
cd apps/mobile && pnpm start           # Expo dev server
```

Migrations in `pb_migrations/` apply automatically on PocketBase start.

### Mobile build (Android APK)

A GitHub Action (`.github/workflows/build-mobile-apk.yml`) builds the release APK and publishes it as a GitHub Release. The web download page fetches the latest release automatically.

```bash
# Trigger a release: bump version in apps/mobile/app.json, then
git tag mobile-v1.0.1 && git push origin mobile-v1.0.1
```

## Deployment

The web app + PocketBase ship as a single Docker image (multi-stage build) and deploy via Dokploy + GitHub Actions on push to `main`. PocketBase serves both the API (`/_/`) and the static frontend from one port (`8090`). See `Dockerfile` and `docker-compose.yml`.

```bash
# Local smoke test
docker compose up --build      # http://localhost:8090
```

## Contributing

Issues and PRs welcome. If Calistenia helps you train, a ⭐ on the repo goes a long way and helps others discover it.

## License

MIT — see [`LICENSE.md`](./LICENSE.md). Use it, fork it, self-host it.
