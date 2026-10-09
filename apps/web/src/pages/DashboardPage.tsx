/**
 * Inicio «qué hago hoy» (#855, épica #852).
 *
 * Una sola acción principal que cambia según el estado del usuario
 * (`getHomeState`, #853) y, debajo, la semana y como mucho 2 «Para ti» (3 en
 * escritorio). Todo lo demás vive en su pantalla: accesos rápidos en Entrenar,
 * estadísticas en Progreso, agua y comida en Nutrición, lo social en
 * Comunidad y los ajustes en Perfil.
 *
 * Móvil web: una columna. Escritorio (≥1024 px): «Hoy» a la izquierda y la
 * semana + «Para ti» en una columna de 360 px (tablero Web-Escritorio).
 *
 * La campana y el avatar ya están en la cabecera del shell (#856 la rehace):
 * aquí no se repiten.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import HomeTodayCard from '../components/dashboard/HomeTodayCard'
import HomeWeekStrip, { FirstWeekGoal } from '../components/dashboard/HomeWeekStrip'
import HomeParaTi from '../components/dashboard/HomeParaTi'
import { useHomeToday } from '../components/dashboard/useHomeToday'
import StreakMilestone, { getActiveWeeklyMilestone } from '../components/StreakMilestone'
import { useWorkoutState } from '../contexts/WorkoutContext'
import { useAuthState } from '../contexts/AuthContext'
import { localHour } from '@calistenia/core/lib/dateUtils'
import { calculateWorkoutDuration } from '@calistenia/core/lib/duration'
import { homeShowAllKey } from '@calistenia/core/lib/activation'
import { paraTiEnabled } from '@calistenia/core/lib/paraTi'
import { homeAnalyticsModifiers, resetHomeView, trackHomeViewed } from '@calistenia/core/lib/home-analytics'
import type { CardioSession } from '@calistenia/core/types'

/** Olvido de la visita pendiente (ver el efecto de `resetHomeView`). */
let pendingHomeReset: ReturnType<typeof setTimeout> | null = null

function greetingKey(): string {
  const h = localHour()
  if (h < 12) return 'home.greeting.morning'
  if (h < 20) return 'home.greeting.afternoon'
  return 'home.greeting.evening'
}

interface DashboardPageProps {
  /** Última sesión de cardio (App.tsx ya la carga): para «Hecho» en día de cardio y la semana. */
  cardioLastSession?: CardioSession | null
}

export default function DashboardPage({ cardioLastSession }: DashboardPageProps) {
  const { t, i18n } = useTranslation()
  const { activeProgram, weekDays } = useWorkoutState()
  const { userId, user } = useAuthState()
  const home = useHomeToday()
  const { state, week, goal, streak, accountSessions } = home

  // #808 dejaba un «ver todo el inicio» por usuario; ya no hay nada que ver.
  // `calistenia_home_full_<uid>` NO se toca: lo sigue usando `useHomeStage` de
  // core como «ya llegó a 3» sin red.
  useEffect(() => {
    if (!userId) return
    try {
      localStorage.removeItem(homeShowAllKey(userId))
    } catch {
      // Sin storage no hay nada que limpiar.
    }
  }, [userId])

  // home_viewed: una vez por visita y con el estado ya resuelto (#854).
  const viewed = useRef(false)
  useEffect(() => {
    if (viewed.current || state.modifiers.loading) return
    viewed.current = true
    trackHomeViewed({ state: state.kind, modifiers: homeAnalyticsModifiers(state) })
  }, [state])
  // Al salir se olvida la visita, un tick después: el desmontaje simulado de
  // StrictMode (dev) remonta al instante y cancela el olvido, así que no se
  // pierde el `ms_since_view` ni se emite `home_viewed` dos veces.
  useEffect(() => {
    if (pendingHomeReset) clearTimeout(pendingHomeReset)
    pendingHomeReset = null
    return () => {
      pendingHomeReset = setTimeout(() => {
        pendingHomeReset = null
        resetHomeView()
      }, 0)
    }
  }, [])

  const [milestoneDismissed, setMilestoneDismissed] = useState(false)
  const milestone = useMemo(
    () => (userId && !milestoneDismissed ? getActiveWeeklyMilestone(streak.current, userId) : null),
    [userId, milestoneDismissed, streak],
  )

  const todayLabel = new Date().toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })
  const showParaTi = !!userId && paraTiEnabled({ homeKind: state.kind, accountSessions }) && !state.modifiers.loading
  const deload = state.kind === 'training_day' && state.deload
  const firstWorkout = state.kind === 'first_workout'

  const dayInfo = (dayId: string) => {
    const workout = home.workoutFor(dayId)
    return {
      title: workout?.title || null,
      minutes: workout?.exercises?.length ? calculateWorkoutDuration(workout.exercises) : null,
    }
  }

  const aside = (
    <>
      {firstWorkout ? (
        state.showActivationGoal && state.modifiers.firstWeek ? <FirstWeekGoal firstWeek={state.modifiers.firstWeek} /> : null
      ) : (
        <HomeWeekStrip
          week={week}
          goal={activeProgram ? goal : null}
          streak={streak}
          firstWeek={state.modifiers.firstWeek}
          deload={deload}
          weekDays={activeProgram ? weekDays : []}
          dayInfo={dayInfo}
        />
      )}
      {showParaTi && <HomeParaTi userId={userId!} homeKind={state.kind} accountSessions={accountSessions} />}
    </>
  )

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-4 px-4 pb-2 pt-3 md:px-6 lg:gap-6 lg:px-12 lg:py-7">
      <header className="flex flex-col gap-0.5 lg:gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{todayLabel}</span>
        <h1 className="m-0 font-bebas text-[34px] leading-none lg:text-[52px]">{t(greetingKey())}</h1>
      </header>

      {milestone && userId && (
        <StreakMilestone
          weeks={milestone}
          userId={userId}
          referralCode={user?.referral_code}
          onDismiss={() => setMilestoneDismissed(true)}
        />
      )}

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8">
        <div className="flex flex-col gap-4">
          <HomeTodayCard home={home} cardioLastSession={cardioLastSession} />
        </div>
        <div className="flex flex-col gap-4 lg:gap-6">{aside}</div>
      </div>
    </div>
  )
}
