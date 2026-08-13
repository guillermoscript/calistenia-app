/**
 * Clock-offset correction against the PocketBase server.
 *
 * Anything that has to happen at the same wall-clock instant on several devices — a
 * race countdown, a battle countdown — must be derived from a server timestamp and
 * this offset, never from the device clock. Phone clocks drift, and users travel.
 *
 * This was originally `apps/mobile/src/lib/race/raceClock.ts`; it moved here unchanged
 * when battles needed the same synchronization (#356). That module now re-exports this
 * one, so the cardio race flow is untouched.
 */
import { pb } from './pocketbase'

let offsetMs = 0
let measured = false
let measuring: Promise<number> | null = null

/**
 * Measure the offset between server and local clocks.
 *
 * Records the time before and after a cheap health check, uses the midpoint of that
 * window as local time at the moment the server responded, and reads the server
 * timestamp from the HTTP Date header. Residual error is therefore about RTT/2.
 *
 * Cached in-module for the rest of the session. Call `resetOffset()` from tests.
 */
export async function measureOffset(): Promise<number> {
  if (measured) return offsetMs
  if (measuring) return measuring
  measuring = (async () => {
    try {
      const t0 = Date.now()
      const res = await fetch(`${pb.baseUrl}/api/health`, { method: 'GET', cache: 'no-store' })
      const t1 = Date.now()
      const dateHeader = res.headers.get('Date')
      if (dateHeader) {
        const serverMs = new Date(dateHeader).getTime()
        const localMid = t0 + (t1 - t0) / 2
        offsetMs = serverMs - localMid
      }
    } catch {
      // No offset is better than a wrong one: fall back to the device clock.
      offsetMs = 0
    } finally {
      measured = true
      measuring = null
    }
    return offsetMs
  })()
  return measuring
}

export function serverNow(): number {
  return Date.now() + offsetMs
}

export function msUntil(isoDatetime: string | null | undefined): number {
  if (!isoDatetime) return 0
  const target = new Date(isoDatetime).getTime()
  if (Number.isNaN(target)) return 0
  return target - serverNow()
}

export function resetOffset(): void {
  offsetMs = 0
  measured = false
  measuring = null
}

export function getOffsetMs(): number {
  return offsetMs
}
