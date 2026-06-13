import { useEffect, useRef, useState } from 'react'

/** Animates a numeric value from its previous value to target using cubic ease-out. */
export function useCountUp(target: number, duration = 900): number {
  const [count, setCount] = useState(0)
  const prevRef = useRef(0)

  useEffect(() => {
    const from = prevRef.current
    prevRef.current = target
    if (from === target) return

    let startTime: number | null = null
    let raf: number

    const animate = (ts: number) => {
      if (!startTime) startTime = ts
      const elapsed = ts - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.round(from + (target - from) * eased))
      if (progress < 1) raf = requestAnimationFrame(animate)
    }

    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return count
}
