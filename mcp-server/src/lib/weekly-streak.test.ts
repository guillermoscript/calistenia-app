import { describe, it, expect } from "vitest"
import { liveWorkoutStreak, weekStartOf } from "./weekly-streak.js"

// 2026-08-17 es lunes; 2026-08-20, jueves.
const THU = "2026-08-20"

describe("weekStartOf", () => {
  it("lleva cualquier día a su lunes", () => {
    expect(weekStartOf("2026-08-17")).toBe("2026-08-17")
    expect(weekStartOf("2026-08-23")).toBe("2026-08-17")
    expect(weekStartOf("2026-01-01")).toBe("2025-12-29")
  })
})

describe("liveWorkoutStreak", () => {
  it("sin fila o sin semana guardada: 0", () => {
    expect(liveWorkoutStreak(null, THU)).toEqual({ current: 0, best: 0 })
    expect(liveWorkoutStreak({ workout_streak_current: 4, workout_streak_best: 6 }, THU))
      .toEqual({ current: 0, best: 6 })
  })

  it("semana guardada = esta semana: la racha guardada vale, cumplida o no", () => {
    const row = { workout_streak_current: 3, workout_streak_best: 5, streak_week_start: "2026-08-17", streak_week_mask: 1 }
    expect(liveWorkoutStreak(row, THU)).toEqual({ current: 3, best: 5 })
  })

  it("semana guardada = la anterior y cumplida: sigue viva", () => {
    const row = { workout_streak_current: 3, workout_streak_best: 3, streak_week_start: "2026-08-10", streak_week_mask: 1 | 4 }
    expect(liveWorkoutStreak(row, THU).current).toBe(3)
  })

  it("semana guardada = la anterior sin cumplir: rota", () => {
    const row = { workout_streak_current: 3, workout_streak_best: 3, streak_week_start: "2026-08-10", streak_week_mask: 4 }
    expect(liveWorkoutStreak(row, THU).current).toBe(0)
  })

  it("semana guardada más vieja: rota, el best se conserva", () => {
    const row = { workout_streak_current: 7, workout_streak_best: 9, streak_week_start: "2026-08-03", streak_week_mask: 127 }
    expect(liveWorkoutStreak(row, THU)).toEqual({ current: 0, best: 9 })
  })
})
