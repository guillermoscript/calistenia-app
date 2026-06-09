import { pb } from '../pocketbase'

let offsetMs = 0
let measured = false
let measuring: Promise<number> | null = null

/**
 * Measure the clock offset between the PocketBase server and the local client.
 *
 * Records the time before and after a cheap health check, uses the midpoint
 * of that window to estimate local time at the moment the server responded,
 * and extracts the server timestamp from the HTTP Date header.
 *
 * Result is cached in-module for the rest of the session. Call resetOffset()
 * from tests to clear it.
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
