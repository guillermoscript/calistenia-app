import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import CardioShareCard from './CardioShareCard'
import { shareImage, canvasToBlob, loadLogo } from '../../lib/share'
import { createCanvasRecorder, type CanvasRecorder } from '../../test/canvas-recorder'
import type { CardioSession, GpsPoint } from '@calistenia/core/types'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Compare `actual` against a golden fixture file, writing it on first run —
 * the same create-then-compare behavior as vitest's `toMatchFileSnapshot`.
 *
 * Hand-rolled instead of using `toMatchFileSnapshot`/`toMatchSnapshot` because
 * BOTH throw `"The snapshot state for '…' is not found. Did you call
 * 'SnapshotClient.setup()'?"` for every test file in this project — root
 * cause isolated (via a throwaway test + a minimal vitest config bisected
 * line by line) to `apps/web/src/test/setup.ts`'s `import
 * '@testing-library/jest-dom/vitest'`, whose `expect.extend()` call binds
 * matchers to a resolved copy of `vitest` that ends up disconnected from the
 * runner's per-file `SnapshotClient`. Dropping just that import from a
 * scratch copy of setup.ts made the built-in snapshot matchers pass again;
 * `packages/core` (no jest-dom import) is unaffected. Pre-existing,
 * project-wide, and out of scope to fix here (setup.ts is shared by ~300
 * other tests) — this sidesteps vitest's snapshot machinery entirely so the
 * golden files stay readable, committed, and deterministic regardless.
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
  CANONICAL_ANALYTICS_EVENTS: {},
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${Object.values(params).join(',')}` : key,
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('../../lib/i18n', () => ({
  default: {
    language: 'es',
    t: (key: string) => key,
  },
}))

// ── Fixtures ─────────────────────────────────────────────────────────────

/** 15-point loop around a fixed center, one gap point (index 7), so the
 * route casing/accent stroke + start/end dots all get exercised. */
function buildLoopPoints(): GpsPoint[] {
  const center = { lat: 40.4168, lng: -3.7038 }
  const r = 0.0015
  const points: GpsPoint[] = []
  for (let i = 0; i < 15; i++) {
    const angle = (i / 15) * Math.PI * 2
    points.push({
      lat: Number((center.lat + r * Math.sin(angle)).toFixed(6)),
      lng: Number((center.lng + r * Math.cos(angle)).toFixed(6)),
      timestamp: 1_700_000_000 + i * 60,
      ...(i === 7 ? { gap: true } : {}),
    })
  }
  return points
}

const RUNNING_SESSION: CardioSession = {
  id: 'sess_running_1',
  activity_type: 'running',
  gps_points: buildLoopPoints(),
  distance_km: 8.42,
  duration_seconds: 2415,
  avg_pace: 4.78,
  elevation_gain: 62,
  started_at: '2026-03-15T07:30:00.000Z',
  finished_at: '2026-03-15T08:10:15.000Z',
  calories_burned: 512,
  max_pace: 7.12,
  avg_speed_kmh: 12.55,
  max_speed_kmh: 18.3,
  splits: [
    { km: 1, time_seconds: 285, pace: 4.75 },
    { km: 2, time_seconds: 290, pace: 4.83 },
    { km: 3, time_seconds: 275, pace: 4.58 },
    { km: 4, time_seconds: 310, pace: 5.17 },
    { km: 5, time_seconds: 300, pace: 5.0 },
    { km: 6, time_seconds: 295, pace: 4.92 },
    { km: 7, time_seconds: 320, pace: 5.33 },
    { km: 8, time_seconds: 305, pace: 5.08 },
  ],
}

const CYCLING_SESSION: CardioSession = {
  id: 'sess_cycling_1',
  activity_type: 'cycling',
  gps_points: [],
  distance_km: 24.68,
  duration_seconds: 3720,
  avg_pace: 2.51,
  elevation_gain: 0,
  started_at: '2026-04-02T16:00:00.000Z',
  finished_at: '2026-04-02T17:02:00.000Z',
  calories_burned: 640,
  max_pace: 3.4,
  avg_speed_kmh: 23.9,
  max_speed_kmh: 41.2,
  splits: [],
}

// ── Deterministic fakes for the DOM APIs the canvas path touches ──────────

/** Fake `Image` whose `src` setter resolves via `onerror` on the next microtask. */
class FakeImageOnError {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  crossOrigin: string | null = null
  private _src = ''
  get src() {
    return this._src
  }
  set src(value: string) {
    this._src = value
    queueMicrotask(() => this.onerror?.())
  }
}

/** Fake `Image` whose `src` setter resolves via `onload` on the next microtask. */
class FakeImageOnLoad {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  crossOrigin: string | null = null
  private _src = ''
  get src() {
    return this._src
  }
  set src(value: string) {
    this._src = value
    queueMicrotask(() => this.onload?.())
  }
}

let recorder: CanvasRecorder
let originalCreateElement: typeof document.createElement

beforeEach(() => {
  recorder = createCanvasRecorder()
  originalCreateElement = document.createElement.bind(document)
  document.createElement = ((tagName: string, options?: ElementCreationOptions) => {
    if (tagName === 'canvas') return recorder.canvas
    return originalCreateElement(tagName, options)
  }) as typeof document.createElement

  // Header date is locale/ICU-dependent (`toLocaleDateString`) — pin it so the
  // golden file can't drift across machines/Node builds.
  vi.spyOn(Date.prototype, 'toLocaleDateString').mockReturnValue('dom, 15 mar 2026')
})

afterEach(() => {
  document.createElement = originalCreateElement
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

async function shareAndCollectOps() {
  const { getByRole } = render(<CardioShareCard session={RUNNING_SESSION} userName="Ana" />)
  fireEvent.click(getByRole('button'))
  await waitFor(() => expect(shareImage).toHaveBeenCalled())
  return recorder.ops
}

describe('CardioShareCard golden op log', () => {
  it('running session, route tiles all fail to load (onerror branch)', async () => {
    vi.stubGlobal('Image', FakeImageOnError)
    const ops = await shareAndCollectOps()
    expect(loadLogo).toHaveBeenCalled()
    expect(canvasToBlob).toHaveBeenCalled()
    matchGoldenFile(ops.join('\n'), join(__dirname, '__snapshots__/CardioShareCard.running-tiles-fail.golden.txt'))
  })

  it('running session, route tiles all load (onload branch)', async () => {
    vi.stubGlobal('Image', FakeImageOnLoad)
    const ops = await shareAndCollectOps()
    matchGoldenFile(ops.join('\n'), join(__dirname, '__snapshots__/CardioShareCard.running-tiles-load.golden.txt'))
  })

  it('cycling session with no GPS route (ghost wordmark branch) + race kicker', async () => {
    vi.stubGlobal('Image', FakeImageOnError)
    const { getByRole } = render(
      <CardioShareCard
        session={CYCLING_SESSION}
        userName="Marta"
        raceName="Vuelta al Parque"
        referralCode="REF123"
      />,
    )
    fireEvent.click(getByRole('button'))
    await waitFor(() => expect(shareImage).toHaveBeenCalled())
    matchGoldenFile(recorder.ops.join('\n'), join(__dirname, '__snapshots__/CardioShareCard.cycling-ghost.golden.txt'))
  })
})
