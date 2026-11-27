/**
 * Pantalla de cierre del programa (#941, épica #932).
 *
 * Se abre sola una vez por inscripción desde la tarjeta «programa terminado»
 * del inicio, y después desde «Tu resumen del programa». Enseña:
 * cifras (semanas, entrenos hechos/pedidos, constancia, series), la primera
 * semana frente a la última en los ejercicios más entrenados, los récords
 * batidos, las fotos de progreso del periodo y las salidas (extender si toca,
 * siguiente programa, ver otros). El cálculo vive en core
 * (`useProgramRecap` → `buildProgramRecap`).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../components/ui/button'
import ProgramRecapShareButton from '../components/programs/ProgramRecapShareButton'
import { useWorkoutState, useWorkoutActions } from '../contexts/WorkoutContext'
import { useAuthState } from '../contexts/AuthContext'
import { useBodyPhotos } from '@calistenia/core/hooks/useBodyPhotos'
import { useProgramRecap } from '@calistenia/core/hooks/useProgramRecap'
import { programAdherencePct } from '@calistenia/core/lib/programProgress'
import { canExtendProgram, programOutcome } from '@calistenia/core/lib/programOutcome'
import { canRepeatProgram } from '@calistenia/core/lib/programCycle'
import { recommendNextPrograms, trackProgramNextChosen } from '@calistenia/core/lib/nextProgram'
import { formatRecapNumber } from '@calistenia/core/lib/programRecap'
import { markProgramRecapSeen } from '@calistenia/core/lib/programRecapSeen'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'

function Kicker({ children }: { children: React.ReactNode }) {
  return <div className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">{children}</div>
}

export default function ProgramRecapPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { user, userId } = useAuthState()
  const { activeProgram, activeEnrollment, programs, programProgress, progress } = useWorkoutState()
  const { getWorkout, selectProgram, extendProgram, repeatProgram, enterFreeMode } = useWorkoutActions()
  const { photos } = useBodyPhotos(userId || null)
  const [busy, setBusy] = useState(false)

  const recap = useProgramRecap({ progress, getWorkout, programProgress, locale: i18n.language })
  const ended = !!activeProgram && programProgress.isCompleted
  const finished = programOutcome(programProgress) === 'finished'
  const extendable = canExtendProgram(programProgress, activeEnrollment?.extended_weeks)
  const adherence = programAdherencePct(programProgress)
  // #939: repetir con más carga, solo si lo completó y queda vuelta.
  const repeatable = programProgress.isCompleted && !finished && canRepeatProgram(activeEnrollment?.cycle)
  const next = recommendNextPrograms(programs, { completed: activeProgram, level: user?.level as string | undefined })[0] ?? null
  const name = activeProgram?.name ?? ''
  const title = finished ? t('home.programComplete.titleFinished', { name }) : t('home.programComplete.title', { name })

  const photosInProgram = useMemo(() => {
    const { startDay, endDay } = programProgress
    if (!startDay || !endDay) return 0
    return photos.filter(p => p.date >= startDay && p.date <= endDay).length
  }, [photos, programProgress])

  // Vista una vez por montaje; y la marca para que el inicio no la vuelva a abrir.
  const trackedRef = useRef(false)
  useEffect(() => {
    if (!ended || trackedRef.current) return
    trackedRef.current = true
    markProgramRecapSeen(activeEnrollment?.id, activeEnrollment?.cycle)
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.programRecapViewed, {
      surface: 'program_recap',
      source: 'program_complete',
      program_id: activeProgram?.id,
      result: programOutcome(programProgress),
      adherence_pct: adherence ?? undefined,
      comparisons: recap.comparisons.length,
      records: recap.records.length,
    })
  }, [ended, activeEnrollment?.id, activeEnrollment?.cycle, activeProgram?.id, programProgress, adherence, recap])

  if (!ended) {
    return (
      <div className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 py-10 md:px-6">
        <p className="m-0 text-sm text-muted-foreground">{t('programRecap.empty')}</p>
        <Button variant="outline" className="self-start" onClick={() => navigate('/')}>{t('programRecap.back')}</Button>
      </div>
    )
  }

  const run = async (fn: () => Promise<boolean>, errorKey: string) => {
    if (busy) return
    setBusy(true)
    const ok = await fn()
    setBusy(false)
    if (ok) navigate('/')
    else toast.error(t(errorKey))
  }

  const stats = [
    { value: String(programProgress.totalWeeks), label: t('home.programComplete.weeks') },
    {
      value: programProgress.programSessionsPlanned > 0
        ? `${programProgress.programSessionsDone}/${programProgress.programSessionsPlanned}`
        : String(programProgress.programSessionsDone),
      label: t('home.programComplete.adherence'),
    },
    ...(adherence !== null ? [{ value: `${adherence}%`, label: t('programRecap.consistency') }] : []),
    { value: String(recap.setsLogged), label: t('programRecap.setsLogged') },
  ]

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-8 px-4 py-6 md:px-6 md:py-10 motion-safe:animate-fade-in" data-testid="program-recap">
      <header className="flex flex-col gap-3">
        <div className="font-mono text-[10px] uppercase tracking-[3px] text-lime-text">{t('programRecap.kicker')}</div>
        <h1 className="m-0 font-bebas text-5xl leading-[0.95] md:text-6xl">{title}</h1>
        {finished && (
          <p className="m-0 text-sm text-muted-foreground">
            {extendable
              ? t('home.programComplete.finishedBody', { done: programProgress.programSessionsDone, planned: programProgress.programSessionsPlanned })
              : t('home.programComplete.finishedBodyNoExtend', { done: programProgress.programSessionsDone, planned: programProgress.programSessionsPlanned })}
          </p>
        )}
      </header>

      <dl className="m-0 grid grid-cols-2 border-y border-border sm:grid-cols-4">
        {stats.map((s, i) => (
          <div key={s.label} className={`flex flex-col gap-1 py-4 ${i > 0 ? 'sm:border-l sm:border-border sm:pl-4' : ''} ${i % 2 === 1 ? 'border-l border-border pl-4 sm:pl-4' : ''}`}>
            <dd className="m-0 font-bebas text-4xl leading-none">{s.value}</dd>
            <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</dt>
          </div>
        ))}
      </dl>

      <section className="flex flex-col gap-3" aria-labelledby="recap-compare">
        <h2 id="recap-compare" className="m-0"><Kicker>{t('programRecap.compareTitle')}</Kicker></h2>
        {recap.comparisons.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">{t('programRecap.compareEmpty')}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {recap.comparisons.map(c => (
              <li key={c.key} className="flex min-h-14 items-center justify-between gap-4 border-b border-border py-2 first:border-t">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{c.name}</span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t('programRecap.compareWeeks', { first: c.firstWeek, last: c.lastWeek })}
                  </span>
                </span>
                <span className="shrink-0 font-bebas text-3xl leading-none">
                  <span className="text-muted-foreground">{formatRecapNumber(c.first)} → </span>
                  <span className={c.delta > 0 ? 'text-lime-text' : ''}>{formatRecapNumber(c.last)}</span>
                  <span className="ml-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{t(`programRecap.unit.${c.unit}`)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {recap.records.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="recap-records">
          <h2 id="recap-records" className="m-0"><Kicker>{t('programRecap.recordsTitle')}</Kicker></h2>
          <ul className="m-0 flex list-none flex-col p-0">
            {recap.records.map(r => (
              <li key={r.key} className="flex min-h-12 items-center justify-between gap-4 border-b border-border py-2 first:border-t">
                <span className="truncate text-sm font-medium">{r.name}</span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t('programRecap.recordBefore', { value: `${formatRecapNumber(r.previous)} ${t(`programRecap.unit.${r.unit}`)}` })}
                  </span>
                  <span className="font-bebas text-2xl leading-none text-lime-text">{formatRecapNumber(r.value)} {t(`programRecap.unit.${r.unit}`)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {photosInProgram > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="recap-photos">
          <h2 id="recap-photos" className="m-0"><Kicker>{t('programRecap.photosTitle')}</Kicker></h2>
          <p className="m-0 text-sm text-muted-foreground">{t('programRecap.photosBody', { count: photosInProgram })}</p>
          <Button variant="link" className="self-start px-0" onClick={() => navigate('/progress?tab=cuerpo')}>{t('programRecap.photosLink')}</Button>
        </section>
      )}

      <div>
        <ProgramRecapShareButton
          programName={name}
          title={title}
          weeks={programProgress.totalWeeks}
          done={programProgress.programSessionsDone}
          planned={programProgress.programSessionsPlanned}
          recap={recap}
          userName={(user?.display_name as string | undefined) || (user?.name as string | undefined)}
        />
      </div>

      <section className="flex flex-col gap-3 border-t border-border pt-6" aria-labelledby="recap-next">
        <h2 id="recap-next" className="m-0"><Kicker>{t('programRecap.next')}</Kicker></h2>
        {next && (
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{t('home.programComplete.nextRecommended')}</span>
            <span className="text-base font-medium">{next.name}</span>
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {extendable && (
            <Button
              className="h-12 font-bebas text-xl tracking-wide"
              disabled={busy}
              onClick={() => { trackProgramNextChosen('extend', activeProgram?.id, null, 'program_recap'); void run(extendProgram, 'programs.extendError') }}
            >
              {t('home.action.extendProgram')}
            </Button>
          )}
          {next && (
            <Button
              variant={extendable ? 'outline' : 'default'}
              className={extendable ? 'h-12' : 'h-12 font-bebas text-xl tracking-wide'}
              disabled={busy}
              onClick={() => { trackProgramNextChosen('recommended', activeProgram?.id, next.id, 'program_recap'); void run(() => selectProgram(next.id), 'programs.switchError') }}
            >
              {t('home.action.startProgram', { name: next.name })}
            </Button>
          )}
          {repeatable && (
            <Button
              variant={next ? 'outline' : 'default'}
              className={next ? 'h-12' : 'h-12 font-bebas text-xl tracking-wide'}
              disabled={busy}
              onClick={() => { trackProgramNextChosen('repeat', activeProgram?.id, activeProgram?.id, 'program_recap'); void run(repeatProgram, 'programs.repeatError') }}
            >
              {t('home.action.repeatProgram')}
            </Button>
          )}
          <Button
            variant="outline"
            className="h-12"
            onClick={() => { trackProgramNextChosen('other', activeProgram?.id, null, 'program_recap'); navigate('/programs') }}
          >
            {t('home.action.seeOthers')}
          </Button>
          {/* #940: salir sin elegir otro programa; el historial se queda. */}
          <Button
            variant="ghost"
            className="h-12"
            disabled={busy}
            onClick={() => { trackProgramNextChosen('free', activeProgram?.id, null, 'program_recap'); void run(enterFreeMode, 'programs.freeModeError') }}
          >
            {t('home.action.freeMode')}
          </Button>
        </div>
      </section>
    </div>
  )
}
