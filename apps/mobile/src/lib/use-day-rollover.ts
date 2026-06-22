/**
 * useDayRollover — fires when the local calendar day changes.
 *
 * React Native screens are long-lived: a tab can stay mounted for days, so a
 * `selectedDate` captured once at mount never advances when the wall clock
 * crosses midnight. This hook detects the day change on app foreground
 * (AppState 'active') and via a low-frequency tick, then invokes `onRollover`
 * with the new and previous `todayStr()` so the screen can reset to the new day.
 *
 * The callback is held in a ref so passing a fresh inline function each render
 * does not re-subscribe the listener.
 */
import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { todayStr } from '@calistenia/core/lib/dateUtils'

const TICK_MS = 60_000

export function useDayRollover(
  onRollover: (newToday: string, prevToday: string) => void,
): void {
  const prevRef = useRef(todayStr())
  const cbRef = useRef(onRollover)
  cbRef.current = onRollover

  useEffect(() => {
    const check = () => {
      const current = todayStr()
      if (current !== prevRef.current) {
        const prev = prevRef.current
        prevRef.current = current
        cbRef.current(current, prev)
      }
    }
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check()
    })
    const id = setInterval(check, TICK_MS)
    return () => {
      sub.remove()
      clearInterval(id)
    }
  }, [])
}
