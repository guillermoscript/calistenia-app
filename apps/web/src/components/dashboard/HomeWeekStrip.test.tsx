/**
 * Días perdidos en la semana del inicio (#809): la celda se distingue de un día
 * por venir y debajo sale el reencuadre «Te saltaste el lunes…», salvo que hoy
 * ya haya entrenado o sea la primera semana.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { getWeekSummary } from '@calistenia/core/lib/weekSummary'
import type { WeeklyStreak } from '@calistenia/core/lib/weeklyStreak'
import type { DayId, DayType, WeekDay } from '@calistenia/core/types'
import HomeWeekStrip from './HomeWeekStrip'

// Sin backend de i18next las claves salen tal cual, con los params detrás.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${Object.values(params).join(',')}` : key,
    i18n: { language: 'es' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

const day = (id: DayId, type: DayType): WeekDay => ({ id, name: id, focus: id, type, color: '#fff' })
const WEEK: WeekDay[] = [
  day('lun', 'push'), day('mar', 'rest'), day('mie', 'pull'), day('jue', 'rest'),
  day('vie', 'legs'), day('sab', 'rest'), day('dom', 'rest'),
]
const STREAK: WeeklyStreak = {
  current: 0, best: 0, thisWeek: { weekStart: '2026-09-28', done: 0, goal: 3, met: false, remaining: 3 },
}

function strip(today: string, activityDays: string[], firstWeek = false) {
  const week = getWeekSummary({ today, activityDays, weekDays: WEEK })
  return render(
    <HomeWeekStrip
      week={week}
      goal={3}
      streak={STREAK}
      firstWeek={firstWeek ? { target: 3, done: 0, reached: false, daysRemaining: 5 } : null}
      deload={false}
      weekDays={WEEK}
    />,
  )
}

describe('HomeWeekStrip · días perdidos (#809)', () => {
  it('etiqueta el día perdido y enseña el reencuadre', () => {
    // Miércoles 30-09: el lunes 28 era de fuerza y no se entrenó.
    strip('2026-09-30', [])
    expect(screen.getByRole('img', { name: /^home\.week\.cell\.missed:/ })).toBeInTheDocument()
    expect(screen.getByTestId('home-missed-days').textContent).toMatch(/^home\.week\.missed:1,lunes$/)
  })

  it('cuenta varios días perdidos', () => {
    // Viernes 02-10: lunes y miércoles perdidos.
    strip('2026-10-02', [])
    expect(screen.getByTestId('home-missed-days').textContent).toMatch(/^home\.week\.missed:2,/)
  })

  it('calla si hoy ya hay entreno', () => {
    strip('2026-09-30', ['2026-09-30'])
    expect(screen.queryByTestId('home-missed-days')).toBeNull()
  })

  it('calla sin días perdidos', () => {
    strip('2026-09-30', ['2026-09-28'])
    expect(screen.queryByTestId('home-missed-days')).toBeNull()
  })

  it('calla la primera semana, que ya tiene su propio empujón', () => {
    strip('2026-09-30', [], true)
    expect(screen.queryByTestId('home-missed-days')).toBeNull()
  })
})
