import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import RaceShareCard from './RaceShareCard'
import { shareImage, canvasToBlob, loadLogo } from '../../lib/share'
import { sortRaceParticipants } from '@calistenia/core/lib/race-sort'
import { createCanvasRecorder, type CanvasRecorder } from '../../test/canvas-recorder'
import type { Race, RaceParticipant, RaceGpsPoint } from '@calistenia/core/types/race'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Compare `actual` against a golden fixture file, writing it on first run —
 * the same create-then-compare behavior as vitest's `toMatchFileSnapshot`.
 * See the identical helper in `CardioShareCard.golden.test.tsx` for why this
 * is hand-rolled instead of using vitest's built-in snapshot matchers (both
 * `toMatchFileSnapshot` and `toMatchSnapshot` throw "SnapshotClient.setup()"
 * for every test file in this project — pre-existing, traced to
 * `apps/web/src/test/setup.ts`'s `@testing-library/jest-dom/vitest` import).
 */
function matchGoldenFile(actual: string, absoluteFilePath: string): void {
  if (!existsSync(absoluteFilePath)) {
    mkdirSync(dirname(absoluteFilePath), { recursive: true })
    writeFileSync(absoluteFilePath, actual, 'utf-8')
    return
  }
  expect(actual).toBe(readFileSync(absoluteFilePath, 'utf-8'))
}

// ── Module mocks ────────────────────────────────────────────────────────────

vi.mock('../../lib/share', () => ({
  shareImage: vi.fn(async () => 'shared'),
  canvasToBlob: vi.fn(async () => ({ size: 1 })),
  loadLogo: vi.fn(async () => ({ __fake: 'logo' })),
}))

vi.mock('@calistenia/core/lib/analytics', () => ({
  trackShareCardShared: vi.fn(),
  trackCanonicalEvent: vi.fn(),
  CANONICAL_ANALYTICS_EVENTS: { raceShared: 'race_shared' },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${Object.values(params).join(',')}` : key,
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

// ── Fixtures ─────────────────────────────────────────────────────────────
//
// Race name long enough (81 uppercase chars, our fake `measureText` @6px/char
// against a 468px content width) to wrap onto 2 lines — verified by hand:
// "…RÍO MANZANARES SUR" / "NORTE".

const RACE_NAME = 'Carrera Solidaria de Otoño por el Bosque y la Ribera del Río Manzanares Sur Norte'

const RACE: Race = {
  id: 'race_1',
  creator: 'user_creator',
  name: RACE_NAME,
  mode: 'distance',
  target_distance_km: 10,
  target_duration_seconds: 0,
  status: 'finished',
  starts_at: '2026-05-01T08:00:00.000Z',
  ends_at: '2026-05-01T09:30:00.000Z',
  finished_at: '2026-05-01T09:12:40.000Z',
  route_points: null,
  is_public: true,
  origin_lat: 40.4168,
  origin_lng: -3.7038,
  activity_type: 'running',
  created: '2026-04-20T10:00:00.000Z',
  updated: '2026-05-01T09:12:40.000Z',
}

/** 7 finished participants with distinct `finished_at` — finishByDistance is
 * false for this race (mode 'distance' with a target > 0), so sort order is
 * purely finished_at ascending, deterministic and independent of array order. */
function buildParticipants(): RaceParticipant[] {
  const names = ['Elena', 'Marcos', 'Julia', 'Diego', 'Nora', 'Iker', 'Sara']
  return names.map((name, i) => ({
    id: `p_${i}`,
    race: 'race_1',
    user: `user_${i}`,
    display_name: name,
    status: 'finished',
    distance_km: 10,
    duration_seconds: 2400 + i * 90,
    avg_pace: 4.0 + i * 0.15,
    last_lat: 40.4168,
    last_lng: -3.7038,
    last_update: '2026-05-01T09:10:00.000Z',
    // Ascending finish order — index 0 finishes first (winner), index 4 is 5th.
    finished_at: new Date(new Date(RACE.starts_at).getTime() + (2400 + i * 90) * 1000).toISOString(),
  }))
}

const PARTICIPANTS = buildParticipants()
const SORTED = sortRaceParticipants(PARTICIPANTS, RACE)
const WINNER_ID = SORTED[0].user
const FIFTH_ID = SORTED[4].user

/** ~12-point track shaped like a short out-and-back, monotonic `t`. */
function buildTrack(): RaceGpsPoint[] {
  const points: RaceGpsPoint[] = []
  for (let i = 0; i < 12; i++) {
    const frac = i / 11
    points.push({
      lat: Number((40.4168 + frac * 0.004).toFixed(6)),
      lng: Number((-3.7038 + Math.sin(frac * Math.PI) * 0.003).toFixed(6)),
      t: 1_700_000_000 + i * 30,
    })
  }
  return points
}

const TRACK = buildTrack()

// ── document.createElement('canvas') interception ─────────────────────────

let recorder: CanvasRecorder
let originalCreateElement: typeof document.createElement

beforeEach(() => {
  recorder = createCanvasRecorder()
  originalCreateElement = document.createElement.bind(document)
  document.createElement = ((tagName: string, options?: ElementCreationOptions) => {
    if (tagName === 'canvas') return recorder.canvas
    return originalCreateElement(tagName, options)
  }) as typeof document.createElement
})

afterEach(() => {
  document.createElement = originalCreateElement
  vi.clearAllMocks()
})

describe('RaceShareCard golden op log', () => {
  it('winner, with own track (podium branch, route panel branch)', async () => {
    const { getByRole } = render(
      <RaceShareCard
        race={RACE}
        participants={PARTICIPANTS}
        currentUserId={WINNER_ID}
        userName="Elena"
        track={TRACK}
      />,
    )
    fireEvent.click(getByRole('button'))
    await waitFor(() => expect(shareImage).toHaveBeenCalled())
    expect(loadLogo).toHaveBeenCalled()
    expect(canvasToBlob).toHaveBeenCalled()
    matchGoldenFile(recorder.ops.join('\n'), join(__dirname, '__snapshots__/RaceShareCard.winner-with-track.golden.txt'))
  })

  it('5th place, no track (non-podium branch, route panel omitted)', async () => {
    const { getByRole } = render(
      <RaceShareCard
        race={RACE}
        participants={PARTICIPANTS}
        currentUserId={FIFTH_ID}
        userName="Nora"
        track={undefined}
      />,
    )
    fireEvent.click(getByRole('button'))
    await waitFor(() => expect(shareImage).toHaveBeenCalled())
    matchGoldenFile(recorder.ops.join('\n'), join(__dirname, '__snapshots__/RaceShareCard.fifth-no-track.golden.txt'))
  })
})
