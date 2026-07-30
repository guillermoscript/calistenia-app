/**
 * Visuales de `/features/training`.
 *
 * Son mocks HTML/CSS, no capturas: el hero tiene que ser nítido a cualquier
 * ancho y no puede depender de datos de una cuenta. Reproducen la pantalla real
 * del producto —`apps/web/src/pages/WorkoutPage.tsx` y
 * `apps/web/src/components/SessionView.tsx`— con el vocabulario de la app
 * (`workout.*`, `session.*`, `phase.*`, `day.*`), no con textos inventados.
 *
 * `LibraryPanel` se deja en paz a propósito: la landing lo sigue usando
 * (`apps/web/src/pages/LandingPage.tsx:135`) y repetirlo aquí no aportaría nada
 * a quien llega desde la home.
 */
import { useTranslation } from 'react-i18next'
import { PhoneFrame } from '../../components/landing/featureSections'

/** Días de la semana de fábrica (`packages/core/data/workouts.ts:10-18`). */
const WEEK = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'] as const
/** Índice del día activo: martes, que es día de tirón. */
const TODAY = 1

/** Hero: el entrenamiento de hoy, ya elegido, con la tira de la semana. */
export function TodayPanel() {
  const { t } = useTranslation()
  return (
    <div
      role="img"
      aria-label={t('feature.training.heroAlt')}
      className="w-full max-w-sm border border-white/10 bg-[hsl(75_6%_6%)] shadow-2xl shadow-black/40"
    >
      <div className="border-b border-white/10 px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-lime">
          {t('phase.2')}
        </p>
        <h3 className="mt-2 font-bebas text-3xl leading-none tracking-wide">
          {t('day.mar')} · {t('dayFocus.mar')}
        </h3>
        <p className="mt-2 font-mono text-xs text-white/45">{t('feature.training.mockDuration')}</p>
      </div>

      <ul className="divide-y divide-white/8">
        {[1, 2, 3].map(n => (
          <li key={n} className="flex items-center justify-between px-5 py-3.5">
            <span className="text-sm text-white/80">{t(`feature.training.mockExercise${n}`)}</span>
            <span className="font-mono text-xs text-white/40">{['3 × 8', '3 × 10', '2 × 15'][n - 1]}</span>
          </li>
        ))}
      </ul>

      <div className="px-5 pb-5 pt-4">
        <div className="rounded-lg bg-lime py-3 text-center font-bebas text-lg tracking-[.12em] text-[hsl(75_8%_5%)]">
          {t('workout.startBtn')}
        </div>
        <div className="mt-4 flex justify-between gap-1.5">
          {WEEK.map((day, i) => (
            <div key={day} className="flex flex-1 flex-col items-center gap-1.5">
              <span className={`text-[9px] uppercase tracking-wide ${i === TODAY ? 'text-lime' : 'text-white/30'}`}>
                {t(`day.${day}`).slice(0, 1)}
              </span>
              <span
                aria-hidden="true"
                className={`h-1 w-full rounded-full ${i === TODAY ? 'bg-lime' : i < TODAY ? 'bg-white/30' : 'bg-white/10'}`}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * S3 · fase `exercise`: una serie ocupando la pantalla, con el aviso de
 * sobrecarga progresiva (`SessionView.tsx:457-467`), que solo sale en la
 * primera serie y solo si hay historial de ese mismo ejercicio.
 */
export function ExerciseMock() {
  const { t } = useTranslation()
  return (
    <PhoneFrame width={264}>
      <div
        role="img"
        aria-label={t('feature.training.sess1Alt')}
        className="px-5 pb-7 pt-5"
      >
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[.16em] text-white/40">
          <span>{t('session.set')} 1/3</span>
          <span className="font-mono">02:14</span>
        </div>
        <h4 className="mt-5 font-bebas text-3xl leading-none tracking-wide">
          {t('feature.training.mockExercise1')}
        </h4>
        <p className="mt-2 font-mono text-4xl leading-none text-lime">8</p>
        <div className="mt-4 flex gap-1.5">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              aria-hidden="true"
              className={`h-1.5 flex-1 rounded-full ${i === 0 ? 'bg-lime' : 'bg-white/12'}`}
            />
          ))}
        </div>
        <p className="mt-5 border-l-[3px] border-amber-400/40 bg-amber-400/[.07] py-2.5 pl-3 pr-2 text-[11px] leading-relaxed text-amber-300/90">
          {t('feature.training.mockHint')}
        </p>
        <div className="mt-5 rounded-lg bg-lime py-3 text-center font-bebas text-base tracking-[.12em] text-[hsl(75_8%_5%)]">
          {t('session.set')} ✓
        </div>
      </div>
    </PhoneFrame>
  )
}

/** S3 · fase `rest`: el anillo de cuenta atrás y el siguiente ejercicio. */
export function RestMock() {
  const { t } = useTranslation()
  // 72 de 90 s restantes sobre una circunferencia de 2πr con r = 42.
  const circumference = 2 * Math.PI * 42
  return (
    <PhoneFrame width={264}>
      <div
        role="img"
        aria-label={t('feature.training.sess2Alt')}
        className="px-5 pb-7 pt-5"
      >
        <p className="text-center text-[10px] uppercase tracking-[.18em] text-white/40">
          {t('session.resting')}
        </p>
        <div className="relative mx-auto mt-4 grid h-[132px] w-[132px] place-items-center">
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
            <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(0 0% 100% / .08)" strokeWidth="6" />
            <circle
              cx="50" cy="50" r="42" fill="none"
              stroke="hsl(74 90% 57%)" strokeWidth="6" strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * 0.2}
            />
          </svg>
          <p className="relative font-bebas text-4xl leading-none tracking-wide">01:12</p>
        </div>
        <div className="mt-5 border-y border-white/10 py-3 text-center">
          <p className="text-[10px] uppercase tracking-[.16em] text-white/40">{t('feature.training.mockNext')}</p>
          <p className="mt-1.5 text-sm text-white/85">{t('feature.training.mockExercise2')}</p>
        </div>
        <div className="mt-4 flex justify-center gap-2 font-mono text-[11px] text-white/55">
          {['−15 s', '+15 s', '+30 s'].map(label => (
            <span key={label} className="rounded-full border border-white/12 px-2.5 py-1">{label}</span>
          ))}
        </div>
        <p className="mt-4 text-center text-[10px] font-semibold uppercase tracking-[.14em] text-lime">
          {t('session.skipRest')}
        </p>
      </div>
    </PhoneFrame>
  )
}

/** S3 · fase `celebrate`: el desglose de tiempo por ejercicio, de mayor a menor. */
export function CelebrateMock() {
  const { t } = useTranslation()
  const rows: Array<[number, string, number]> = [[1, '11:20', 100], [2, '08:45', 77], [3, '05:10', 46]]
  return (
    <PhoneFrame width={264}>
      <div
        role="img"
        aria-label={t('feature.training.sess5Alt')}
        className="px-5 pb-7 pt-5"
      >
        <p className="text-center text-3xl" aria-hidden="true">🎉</p>
        <div className="mt-4 grid grid-cols-3 divide-x divide-white/10 border-y border-white/10">
          {[['6', '×'], ['18', '✓'], ['38', 'MIN']].map(([value, unit]) => (
            <div key={unit} className="py-3 text-center">
              <p className="font-bebas text-xl leading-none tracking-wide">{value}</p>
              <p className="mt-1 text-[9px] uppercase tracking-[.14em] text-white/40">{unit}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-[10px] uppercase tracking-[.16em] text-white/40">
          {t('feature.training.mockBreakdown')}
        </p>
        <div className="mt-3 grid gap-2.5">
          {rows.map(([n, time, pct]) => (
            <div key={n}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[11px] text-white/70">{t(`feature.training.mockExercise${n}`)}</span>
                <span className="font-mono text-[10px] text-white/45">{time}</span>
              </div>
              <span aria-hidden="true" className="mt-1 block h-1.5 overflow-hidden rounded-full bg-white/8">
                <span className="block h-full rounded-full bg-lime" style={{ width: `${pct}%` }} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </PhoneFrame>
  )
}

/**
 * S5 · el badge «Listo para avanzar» sobre su cadena. Los escalones y sus
 * objetivos salen de `seeds/exercises/push.json`.
 */
export function ProgressionMock() {
  const { t } = useTranslation()
  const steps: Array<[string, string, 'done' | 'now' | 'next']> = [
    [t('feature.training.prog1Step'), '15', 'done'],
    [t('feature.training.prog2Step'), '12', 'now'],
    [t('feature.training.prog3Step'), '10', 'next'],
  ]
  return (
    <div
      role="img"
      aria-label={t('feature.training.progAlt')}
      className="w-full max-w-xs border border-white/10 bg-[hsl(75_6%_6%)] p-5 shadow-2xl shadow-black/40"
    >
      <p className="inline-flex items-center gap-2 border border-lime/40 bg-lime/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.14em] text-lime">
        <span aria-hidden="true">▲</span> {t('progression.readyToAdvance')}
      </p>
      <p className="mt-4 text-[10px] uppercase tracking-[.16em] text-white/40">
        {t('feature.training.mockChain')}
      </p>
      <ol className="mt-3 grid gap-2">
        {steps.map(([name, reps, state], i) => (
          <li
            key={name}
            className={`flex items-center justify-between gap-3 border px-3.5 py-2.5 text-xs ${
              state === 'now'
                ? 'border-lime/45 bg-lime/[.08] text-white'
                : state === 'next'
                  ? 'border-white/12 text-white/55'
                  : 'border-white/8 text-white/30 line-through'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <span aria-hidden="true" className="font-mono text-[10px] text-white/35">LV.{i + 1}</span>
              {name}
            </span>
            <span className="font-mono text-[10px] text-white/45">{reps}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
