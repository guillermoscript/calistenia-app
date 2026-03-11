# Calistenia App

A full-featured calisthenics training web app built for a 6-month progressive program. Track workouts session by session, log sets with reps and notes, watch form videos inline, and follow your progress through four structured phases — all from the browser.

## Features

- **6-month structured program** — 4 phases (Base, Strength, Intensity, Peak), each with 5 workout days and 2 rest days per week
- **Session tracking** — start any workout, step through exercises one by one, log sets with reps and an optional note
- **Rest timer** — auto-starts between sets with configurable duration, plus a full-screen rest screen with progress ring
- **Isometric timer** — holds and static exercises use a countdown timer with audio cue instead of rep counting
- **YouTube integration** — tap any exercise name to watch an embedded tutorial video in a modal without leaving the app
- **Lumbar protocol** — dedicated Wednesday routine for lower-back health with extra coaching notes and priority indicators
- **Progress page** — view logged sets grouped by workout, total session count, streaks, and per-exercise history
- **Week plan widget** — overview card on the dashboard showing the 7-day split for the current phase
- **Program selector** — switch between phases and set a custom start date; the app derives your current week automatically
- **Offline-first fallback** — all data writes fall back to `localStorage` if PocketBase is unavailable
- **Light / dark mode** — toggle in the header; light mode is the default
- **Responsive layout** — works on mobile and desktop; day selector and phase tabs scroll horizontally on small screens

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 18, Vite 5 |
| Styling | Tailwind CSS v3, shadcn/ui components |
| Backend | PocketBase (SQLite, self-hosted) |
| Icons | Lucide React |
| Testing | Playwright |

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Start PocketBase

A PocketBase binary is included at the project root. Start it with:

```bash
npm run pb:serve
# or: ./pocketbase serve
# Admin UI: http://127.0.0.1:8090/_/
```

Create an admin account on first run, then create the following collections:

**sessions**
| Field | Type |
|---|---|
| `workout_key` | text |
| `phase` | number |
| `day` | text |
| `title` | text |
| `completed_at` | date |

**sets_log**
| Field | Type |
|---|---|
| `exercise_id` | text |
| `workout_key` | text |
| `reps` | text |
| `note` | text |
| `logged_at` | date |

**settings**
| Field | Type |
|---|---|
| `user_key` | text |
| `phase` | number |
| `start_date` | date |
| `weekly_goal` | number |

Enable email/password authentication on the built-in `users` collection.

### 3. Configure environment

```bash
cp .env.example .env
```

The only variable is:

```
VITE_POCKETBASE_URL=http://127.0.0.1:8090
```

### 4. Run the dev server

```bash
npm run dev
```

The app runs at `http://localhost:5173` by default.

## Available scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run pb:serve` | Start PocketBase on port 8090 |
| `npm run pb:migrate` | Run PocketBase migration script |

## Program structure

The 6-month plan is defined in `src/data/workouts.js`.

| Phase | Weeks | Focus |
|---|---|---|
| 1 — Base & Activation | 1–6 | Fundamentals, posture, lumbar rehab |
| 2 — Fundamental Strength | 7–13 | Pull-ups, dips, squat progressions |
| 3 — Intensity & Skills | 14–20 | Muscle-ups, pistol squats, L-sit, handstand |
| 4 — Peak & Consolidation | 21–26 | One-arm progressions, front lever, free handstand |

Each week day has a fixed focus:

| Day | Focus |
|---|---|
| Monday | Push + Core |
| Tuesday | Pull + Mobility |
| Wednesday | Lumbar + Stretching |
| Thursday | Legs + Glutes |
| Friday | Full Body + Core |
| Saturday | Active walk |
| Sunday | Full rest |

## Project structure

```
src/
  pages/
    AuthPage.jsx          # Login / register
    DashboardPage.jsx     # Home with week overview and stats
    WorkoutPage.jsx       # Day selector and session launcher
    ProgressPage.jsx      # Logged sets and session history
    LumbarPage.jsx        # Lumbar-specific exercise reference
  components/
    SessionView.jsx       # Step-by-step workout session UI
    ExerciseCard.jsx      # Single exercise card with log form
    RestTimer.jsx         # Full-screen rest countdown
    Timer.jsx             # Countdown timer for isometric holds
    WeekPlanWidget.jsx    # 7-day plan summary card
    LumbarCheckModal.jsx  # Pre-session lumbar check dialog
    ProgramSelectorModal.jsx  # Phase + start date picker
    YoutubeModal.jsx      # Embedded YouTube tutorial dialog
    ui/                   # shadcn/ui component primitives
  data/
    workouts.js           # All exercises, phases, and week days
  hooks/
    useAuth.js            # PocketBase auth state hook
  lib/
    pocketbase.js         # PocketBase client singleton
  index.css               # CSS variables, light + dark theme tokens
  App.jsx                 # Root with routing and theme toggle
```

## Deployment (Dokploy + GitHub Actions)

### How it works

The included `Dockerfile` is a three-stage build:

1. **`frontend-builder`** — installs Node deps and runs `vite build`. The compiled assets land in `dist/`.
2. **`pb-downloader`** — downloads the PocketBase `linux/amd64` binary from GitHub Releases.
3. **Runtime** — copies the binary + `dist/` (mounted as `pb_public`) into a minimal Debian image. PocketBase starts and serves both the API (`/_/`) and the static frontend from a single port (`8090`).

Migrations in `pb_migrations/` are auto-applied on every container start.

### 1. GitHub Actions setup

The workflow at `.github/workflows/docker.yml` triggers on every push to `main` (and on version tags). It:

- Builds the Docker image for `linux/amd64`
- Pushes it to **GitHub Container Registry** (`ghcr.io/<owner>/<repo>:main`)
- Uses layer caching so rebuilds are fast

**Required secret** — add this in your GitHub repo under *Settings → Secrets and variables → Actions*:

| Secret | Value |
|---|---|
| `VITE_POCKETBASE_URL` | Your public app URL, e.g. `https://calistenia.example.com` |

This is baked into the Vite build so the browser JS knows where to call the API.

### 2. Dokploy setup

In your Dokploy dashboard, create a new **App** and configure it as follows:

**Source**
- Type: Docker image
- Image: `ghcr.io/<your-github-username>/calistenia-app:main`
- Registry: GitHub Container Registry (add your GHCR token in Dokploy's registry settings)

**Port**
- Container port: `8090`
- Expose via Traefik/reverse-proxy on `443` (HTTPS)

**Volumes (bind mount)**
- Host path: `/opt/calistenia-app/pb_data` (or any path you control on the server)
- Container path: `/app/pb_data`

**Domain**
- Set your domain (e.g. `calistenia.example.com`) — make sure it matches the `VITE_POCKETBASE_URL` secret

**Redeploy trigger**
- Enable "Deploy webhook" in Dokploy and paste the URL into your GitHub repo under *Settings → Webhooks*, or use the Dokploy GitHub integration for automatic redeploys on push.

### 3. First boot

On first run, PocketBase will:
1. Create `pb_data/data.db` (SQLite)
2. Apply all migrations automatically
3. Prompt you to create an admin account at `https://your-domain/_/`

Visit `https://your-domain/_/` to finish setup and create your admin credentials.

### Local smoke-test with Docker Compose

```bash
docker compose up --build
# App + API: http://localhost:8090
# Admin UI:  http://localhost:8090/_/
```

Data is stored in `./pb_data_local/` (git-ignored).

## Notes

- If PocketBase is not running, the app automatically falls back to `localStorage` for all reads and writes. No data is lost.
- The `pb_migrations/` directory contains migration scripts that can be run with `npm run pb:migrate` to recreate collections programmatically.
- Playwright end-to-end tests live in `tests/`. Run them with `npx playwright test` after starting both the dev server and PocketBase.

## License

See `LICENSE.md`.
