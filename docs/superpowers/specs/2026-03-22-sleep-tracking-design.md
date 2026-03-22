# Sleep Tracking Feature — Design Spec

## Overview

Manual sleep logging focused on habits and quality. Users register bedtime, wake time, awakenings, and a subjective quality score. Optional expanded fields allow tracking contributing factors (caffeine, screen time, stress). Replaces the `slept_well` boolean in lumbar checks with data derived from sleep entries.

## Motivation

The app already tracks workouts, nutrition, weight, body measurements, and lumbar health. Sleep is the missing recovery pillar. This feature gives users visibility into their sleep patterns and how they correlate with training.

## Data Model

### New collection: `sleep_entries`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `user` | relation (users) | yes | Owner |
| `date` | date | yes | Night of the entry (date user went to bed) |
| `bedtime` | text | yes | Time went to bed ("23:30") |
| `wake_time` | text | yes | Time woke up ("07:15") |
| `awakenings` | number | yes | Times woken up (0+) |
| `quality` | number | yes | Subjective rating 1-5 |
| `duration_minutes` | number | yes | Auto-calculated from bedtime/wake_time |
| `caffeine` | bool | no | Caffeine after 14:00? |
| `screen_before_bed` | bool | no | Screen in last hour? |
| `stress_level` | number | no | 1-5 |
| `note` | text | no | Free text |

**API rules**: user can only read/write their own records. One entry per user per date (unique constraint on user+date).

### Migration on `lumbar_checks`

- Make `slept_well` optional (not required) to preserve historical data
- No data deletion — existing records keep their `slept_well` values

## UI

### Page: `/sleep`

1. **Today summary** — Card showing last night's entry or "Register sleep" CTA button
2. **Weekly chart** — Bar chart (Recharts) with 7-day sleep duration, colored by quality (red 1-2, yellow 3, green 4-5)
3. **Stats** — Average duration, average quality, average awakenings, schedule regularity (std deviation of bedtime)
4. **History** — Scrollable list of past entries, tappeable to edit

### Sleep Form (modal or inline)

**Quick mode (default)** — 4 fields:
- Bedtime (time picker)
- Wake time (time picker)
- Awakenings (number stepper, 0+)
- Quality (1-5, star icons or emoji faces)

**Expanded mode** — "More detail" button reveals:
- Caffeine toggle
- Screen before bed toggle
- Stress level (1-5 slider)
- Note (textarea)

`duration_minutes` calculated live and displayed ("7h 30min").

Default bedtime: current time if filling at night, empty if filling during day.

### Dashboard Widget

Mini card showing last night: duration + quality icon. If no entry for today, shows "How did you sleep?" CTA.

### Lumbar Check Integration

- Remove `slept_well` toggle from the lumbar check form
- If `sleep_entry` exists for that date: show read-only badge "Slept well" / "Slept poorly" (quality >= 3)
- If no sleep entry: show link "Register sleep first"

## Technical Implementation

### Files to create

- `src/hooks/useSleep.ts` — CRUD for sleep_entries, weekly stats calculation. Same pattern as `useWeight` / `useBodyMeasurements`.
- `src/pages/SleepPage.tsx` — Main sleep page with summary, chart, stats, history
- `src/components/sleep/SleepForm.tsx` — Quick + expanded mode form
- `src/components/sleep/SleepWeekChart.tsx` — Recharts bar chart
- `src/components/sleep/SleepDashboardWidget.tsx` — Dashboard mini card
- PocketBase migration for `sleep_entries` collection
- PocketBase migration to make `lumbar_checks.slept_well` optional

### Files to modify

- `src/App.tsx` — Add `/sleep` route
- `src/pages/DashboardPage.tsx` — Add SleepDashboardWidget
- `src/components/LumbarCheckForm.tsx` (or equivalent) — Replace `slept_well` toggle with sleep entry integration
- Navigation components — Add "Sueño" link in sidebar and mobile nav

### Patterns to follow

- Hook structure: same as `useWeight.ts` (PocketBase CRUD + computed stats)
- Page layout: same as body measurements or weight page
- Chart: Recharts BarChart, same style as existing charts
- Form: shadcn/ui components (Input, Button, Dialog, Slider)
- Mobile-first responsive layout

## Out of Scope

- Sleep alarms or "time to sleep" notifications
- AI-powered sleep analysis or recommendations
- Recovery score combining sleep + training data
- Smartwatch/sensor integration
- Sleep phase estimation

These are natural extensions that can be added once users have accumulated sleep data.
