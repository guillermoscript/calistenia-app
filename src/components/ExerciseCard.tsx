import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Image, ArrowUp, Info, Pencil, MoreHorizontal } from 'lucide-react'
import { pbExerciseEditUrl } from '../lib/pocketbase-admin'
import Timer from './Timer'
import YoutubeModal from './YoutubeModal'
import MediaViewer from './MediaViewer'
import ProgressionChain from './ProgressionChain'
import { useProgressions } from '../hooks/useProgressions'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { cn } from '../lib/utils'
import { PRIORITY_COLORS } from '../lib/style-tokens'
import type { Exercise, ExerciseLog, SetData, Priority } from '../types'
import { exerciseInjuryFlags } from '../lib/injuryMatch'
import type { InjuryId } from './onboarding/StepHealth'

const PRIORITY_LABEL_KEYS: Record<Priority, string> = { high: 'exercise.priorityHigh', med: 'exercise.priorityMed', low: 'exercise.priorityLow' }

interface ExerciseCardProps {
  exercise: Exercise
  workoutKey: string
  onLogSet: (exerciseId: string, workoutKey: string, data: { reps: string; note: string; weight?: number; rpe?: number }) => void
  onStartRest: (seconds: number) => void
  logs?: ExerciseLog[]
  isAdmin?: boolean
  isFirst?: boolean
  userInjuries?: InjuryId[]
}

export default function ExerciseCard({ exercise, workoutKey, onLogSet, onStartRest, logs = [], isAdmin, isFirst, userInjuries = [] }: ExerciseCardProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [showTimer, setShowTimer] = useState<boolean>(false)
  const [showYoutube, setShowYoutube] = useState<boolean>(false)
  const [showMedia, setShowMedia] = useState<boolean>(false)
  const [showEditForm, setShowEditForm] = useState<boolean>(false)
  const [showHistory, setShowHistory] = useState<boolean>(false)
  const [showProgression, setShowProgression] = useState<boolean>(false)
  const [showOverflow, setShowOverflow] = useState<boolean>(false)
  const overflowRef = useRef<HTMLDivElement>(null)
  const { getChainForExercise, shouldSuggestProgression } = useProgressions()
  const chain = getChainForExercise(exercise.id)
  const hasProgression = chain.length > 0
  const advanceSuggested = hasProgression && shouldSuggestProgression(exercise.id, logs)
  const [logReps, setLogReps] = useState<string>('')
  const [logNote, setLogNote] = useState<string>('')
  const [logWeight, setLogWeight] = useState<string>('')
  const [logRpe, setLogRpe] = useState<string>('')
  const [setsLogged, setSetsLogged] = useState<number>(0)
  const [flash, setFlash] = useState<boolean>(false)

  const totalSets = exercise.sets === 'múltiples' ? '∞' : exercise.sets
  const isComplete = totalSets !== '∞' && setsLogged >= parseInt(String(totalSets))
  const recentLogs = logs.slice(0, 3)

  // Progressive overload hint
  const lastLog = logs[0]
  const lastBestReps = lastLog?.sets?.reduce((max, s) => {
    const n = parseInt(s.reps); return (!isNaN(n) && n > max) ? n : max
  }, 0) || 0
  const lastBestWeight = lastLog?.sets?.reduce((max, s) => (s.weight || 0) > max ? (s.weight || 0) : max, 0) || 0

  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (flashTimerRef.current) clearTimeout(flashTimerRef.current) }, [])

  // Close overflow menu on outside click
  useEffect(() => {
    if (!showOverflow) return
    const handler = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) setShowOverflow(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showOverflow])

  const triggerFlash = (): void => {
    setFlash(true)
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => setFlash(false), 400)
  }

  const [logging, setLogging] = useState(false)

  const handleQuickLog = (): void => {
    if (isComplete || logging) return
    setLogging(true)
    const reps = String(exercise.reps)
    onLogSet(exercise.id, workoutKey, { reps, note: '' })
    setSetsLogged(s => s + 1)
    onStartRest(exercise.rest || 90)
    triggerFlash()
    // Brief lock to prevent double-tap
    setTimeout(() => setLogging(false), 300)
  }

  const handleFormLog = (): void => {
    if (!logReps) return
    const w = parseFloat(logWeight)
    const r = parseInt(logRpe)
    onLogSet(exercise.id, workoutKey, { reps: logReps, note: logNote, weight: isNaN(w) ? undefined : w, rpe: isNaN(r) ? undefined : r })
    setSetsLogged(s => s + 1)
    setLogReps('')
    setLogNote('')
    setLogWeight('')
    setLogRpe('')
    setShowEditForm(false)
    onStartRest(exercise.rest || 90)
    triggerFlash()
  }

  return (
    <div className={cn(
      'bg-card rounded-xl overflow-hidden transition-[border-color] duration-300 border',
      isComplete ? 'border-lime/35' : 'border-border'
    )}>
      {/* Priority stripe */}
      <div className={cn('h-0.5', PRIORITY_COLORS[exercise.priority]?.stripe || 'bg-muted')} />

      <div className={`px-4 py-4 transition-[background] duration-100 ${flash ? 'ex-flash' : ''}`}>

        {/* Header row */}
        <div className="flex justify-between items-start gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-[15px]">{exercise.name}</span>
              {exercise.supersetGroup && (
                <span className="text-[9px] text-pink-500 font-mono tracking-[0.5px] px-1.5 py-0.5 rounded bg-pink-500/10 border border-pink-500/20">SS</span>
              )}
              {isComplete && (
                <span className="text-[11px] text-emerald-500 font-mono tracking-[0.5px]">✓ COMPLETADO</span>
              )}
            </div>
            <div className="flex gap-4 mb-1.5 flex-wrap">
              <span className="font-mono text-[12px] text-lime">{totalSets} × {exercise.reps}</span>
              <span className="font-mono text-[11px] text-muted-foreground">descanso {exercise.rest}s</span>
              <span className={cn('font-mono text-[10px] tracking-wide', PRIORITY_COLORS[exercise.priority]?.text)}>
                {t(PRIORITY_LABEL_KEYS[exercise.priority])}
              </span>
            </div>
            <div className="text-[12px] text-muted-foreground">{exercise.muscles}</div>
            {(() => {
              const flags = exerciseInjuryFlags(exercise.name, userInjuries)
              if (!flags.length) return null
              const joints = flags.map(f => t(`workout.joint.${f}`)).join(', ')
              return (
                <div className="text-[11px] text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded px-2 py-1 mt-2 inline-flex items-center gap-1.5">
                  <span>⚠️</span>
                  <span>{t('workout.injuryWarning', { joints })}</span>
                </div>
              )
            })()}
          </div>

          {/* Sets counter */}
          <div className="text-center flex-shrink-0">
            <div className={cn(
              'font-bebas text-[28px] leading-none transition-colors duration-200',
              setsLogged > 0 ? 'text-lime' : 'text-muted-foreground/30'
            )}>
              {setsLogged}<span className="text-base text-muted-foreground/40">/{totalSets}</span>
            </div>
            <div className="text-[9px] text-muted-foreground tracking-wide font-mono uppercase">{t('exercise.sets')}</div>
          </div>
        </div>

        {/* Progressive overload hint */}
        {lastLog && lastBestReps > 0 && setsLogged === 0 && (
          <div className="text-[11px] text-amber-400/80 bg-amber-400/5 rounded px-3 py-2 mt-2.5 border-l-2 border-amber-400/30">
            {t('exercise.lastTime')} <strong>{lastBestReps}</strong> reps
            {lastBestWeight > 0 && <> +<strong>{lastBestWeight}</strong>kg</>}
            {' — '}
            {lastBestWeight > 0
              ? t('exercise.tryMoreWeight', { weight: (lastBestWeight + 2.5).toFixed(1) })
              : t('exercise.tryMoreReps', { reps: lastBestReps + 1 })
            }
          </div>
        )}

        {/* Progression advancement suggestion */}
        {advanceSuggested && setsLogged === 0 && (
          <button
            onClick={() => setShowProgression(true)}
            className="w-full text-left text-[11px] bg-lime/5 rounded px-3 py-2.5 mt-2.5 border-l-2 border-lime/40 flex items-center gap-2 hover:bg-lime/10 transition-colors"
          >
            <ArrowUp size={14} className="text-lime flex-shrink-0" />
            <span className="text-lime/90">
              {t('exercise.readyToAdvance')}{' '}
              {chain.find(p => p.exerciseId === exercise.id)?.nextExerciseId && (
                <strong className="text-lime">{t('exercise.viewProgression')}</strong>
              )}
            </span>
          </button>
        )}

        {/* Exercise note */}
        {exercise.note && (
          <div className="text-[12px] text-muted-foreground bg-muted/30 rounded px-3 py-2 mt-2.5 border-l-2 border-lime/20 italic leading-relaxed">
            {exercise.note}
          </div>
        )}

        {/* PRIMARY QUICK-LOG ROW */}
        <div className="flex items-center gap-2 mt-3.5">

          <button
            onClick={handleQuickLog}
            disabled={isComplete || logging}
            className={cn(
              'flex-1 min-h-11 py-[13px] px-3 rounded-md font-mono text-[12px] font-bold tracking-wide flex items-center justify-center gap-2 transition-all duration-150',
              isComplete
                ? 'bg-emerald-500/10 text-emerald-500 cursor-default'
                : 'bg-lime/13 text-lime hover:bg-lime/20 cursor-pointer'
            )}
          >
            {isComplete ? (
              <>{t('exercise.completed')}</>
            ) : (
              <>
                <span className="text-base leading-none">+</span>
                {t('exercise.setLabel', { reps: exercise.reps })}
              </>
            )}
          </button>

          {!isComplete && (
            <button
              id={isFirst ? 'tour-edit-set' : undefined}
              onClick={() => setShowEditForm(v => !v)}
              title={t('exercise.editReps')}
              className={cn(
                'py-[13px] px-3.5 rounded-md text-sm leading-none transition-all duration-150 flex-shrink-0 border',
                showEditForm
                  ? 'border-lime/30 bg-lime/6 text-lime'
                  : 'border-border text-muted-foreground hover:border-lime/30 hover:text-lime'
              )}
            >
              ✏
            </button>
          )}

          {exercise.isTimer && (
            <button
              onClick={() => setShowTimer(!showTimer)}
              className={cn(
                'py-[13px] px-3.5 rounded-md font-mono text-[12px] tracking-wide flex-shrink-0 border transition-all duration-150',
                showTimer
                  ? 'border-sky-500/30 bg-sky-500/10 text-sky-500'
                  : 'border-border text-sky-600 dark:text-sky-400 hover:border-sky-500/30'
              )}
            >
              ⏱
            </button>
          )}

          {/* Overflow menu for secondary actions */}
          <div className="relative flex-shrink-0" ref={overflowRef}>
            <button
              onClick={() => setShowOverflow(v => !v)}
              className={cn(
                'relative py-[13px] px-3 rounded-md text-[13px] leading-none border transition-all duration-150',
                showOverflow
                  ? 'border-border/70 bg-muted/50 text-foreground'
                  : 'border-border text-muted-foreground hover:border-border/70 hover:text-foreground'
              )}
            >
              <MoreHorizontal size={15} />
              {advanceSuggested && (
                <span className="absolute -top-1 -right-1 size-2 rounded-full bg-lime animate-pulse" />
              )}
            </button>

            {showOverflow && (
              <div className="absolute right-0 top-full mt-1.5 z-30 min-w-[180px] rounded-lg bg-card border border-border shadow-lg shadow-black/20 py-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                <button
                  onClick={() => { setShowYoutube(true); setShowOverflow(false) }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 text-[12px] text-left hover:bg-muted/50 transition-colors"
                >
                  <span className="text-red-500">▶</span>
                  <span>{t('exercise.viewTutorial')}</span>
                </button>

                <button
                  onClick={() => { navigate(`/exercises/${exercise.id}`); setShowOverflow(false) }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 text-[12px] text-left hover:bg-muted/50 transition-colors"
                >
                  <Info size={14} className="text-muted-foreground" />
                  <span>{t('exercise.viewDetail')}</span>
                </button>

                {exercise.demoImages && exercise.demoImages.length > 0 && (
                  <button
                    onClick={() => { setShowMedia(true); setShowOverflow(false) }}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 text-[12px] text-left hover:bg-muted/50 transition-colors"
                  >
                    <Image size={14} className="text-lime" />
                    <span>{t('exercise.viewMedia')}</span>
                  </button>
                )}

                {recentLogs.length > 0 && (
                  <button
                    onClick={() => { setShowHistory(v => !v); setShowOverflow(false) }}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 text-[12px] text-left hover:bg-muted/50 transition-colors"
                  >
                    <span className="font-mono text-[10px] text-sky-400">H</span>
                    <span>{t('exercise.recentHistory')}</span>
                  </button>
                )}

                {hasProgression && (
                  <button
                    onClick={() => { setShowProgression(true); setShowOverflow(false) }}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 text-[12px] text-left hover:bg-muted/50 transition-colors"
                  >
                    <ArrowUp size={14} className={advanceSuggested ? 'text-lime' : 'text-muted-foreground'} />
                    <span>{t('exercise.progression')}{advanceSuggested && <span className="text-lime ml-1 text-[10px]">{t('exercise.advance')}</span>}</span>
                  </button>
                )}

                {isAdmin && exercise.pbRecordId && (
                  <>
                    <div className="h-px bg-border mx-3 my-1" />
                    <a
                      href={pbExerciseEditUrl(exercise.pbRecordId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setShowOverflow(false)}
                      className="w-full flex items-center gap-3 px-3.5 py-2.5 text-[12px] text-left hover:bg-muted/50 transition-colors text-amber-400"
                    >
                      <Pencil size={14} />
                      <span>{t('exercise.editInPB')}</span>
                    </a>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* EDIT FORM */}
        {showEditForm && (
          <div className="mt-2.5 px-3.5 py-3 bg-lime/4 rounded-lg border border-lime/10">
            <div className="text-[10px] text-lime tracking-[2px] mb-2.5 uppercase">{t('exercise.customSet')}</div>
            <div className="grid grid-cols-[1fr_auto_auto] gap-2">
              <Input
                value={logReps}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLogReps(e.target.value)}
                placeholder={t('exercise.repsPlaceholder', { reps: exercise.reps })}
                maxLength={20}
                className="h-9 text-xs"
              />
              <Input
                type="number"
                step="0.5"
                min="0"
                max="999"
                value={logWeight}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLogWeight(e.target.value)}
                placeholder="kg"
                className="w-[72px] h-9 text-xs"
              />
              <Input
                type="number"
                min="1"
                max="10"
                step="1"
                value={logRpe}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLogRpe(e.target.value)}
                placeholder="RPE"
                title={t('exercise.rpeTitle')}
                aria-label={t('exercise.rpeAriaLabel')}
                className="w-[56px] h-9 text-xs"
              />
            </div>
            <div className="flex gap-2 mt-2">
              <Input
                value={logNote}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLogNote(e.target.value)}
                placeholder={t('exercise.notePlaceholder')}
                maxLength={200}
                className="flex-1 h-9 text-xs"
              />
              <Button
                onClick={handleFormLog}
                disabled={!logReps}
                size="sm"
                className={cn(
                  'h-9 px-5 text-[11px] font-bold',
                  logReps
                    ? 'bg-lime text-lime-foreground hover:bg-lime/90'
                    : 'bg-lime/20 text-muted-foreground cursor-not-allowed'
                )}
              >
                {t('exercise.saveSet')}
              </Button>
            </div>
          </div>
        )}

        {/* HISTORY */}
        {showHistory && recentLogs.length > 0 && (
          <div className="mt-2.5">
            <div className="text-[9px] text-muted-foreground tracking-[2px] mb-1.5 uppercase font-mono">{t('exercise.recentHistory')}</div>
            {recentLogs.map((log, i) => (
              <div key={i} className="py-1.5 border-b border-border/50 text-[12px]">
                <span className="font-mono text-sky-600 dark:text-sky-400 mr-3">{log.date}</span>
                {log.sets?.map((s: SetData, j: number) => (
                  <span key={j} className="mr-2">
                    {t('exercise.setNumber', { n: j + 1 })}: <strong>{s.reps}</strong>
                    {s.weight && <span className="text-amber-400 ml-1">+{s.weight}kg</span>}
                    {s.rpe && <span className="text-pink-500 ml-1">RPE {s.rpe}</span>}
                    {s.note && <em className="text-muted-foreground ml-1">({s.note})</em>}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* EXERCISE TIMER */}
        {showTimer && exercise.isTimer && (
          <div className="mt-4 p-4 bg-sky-500/4 rounded-lg border border-sky-500/10 flex justify-center">
            <Timer initialSeconds={exercise.timerSeconds} label={exercise.name} />
          </div>
        )}
      </div>

      {showYoutube && <YoutubeModal query={exercise.youtube?.trim() || exercise.name} onClose={() => setShowYoutube(false)} />}
      {showMedia && <MediaViewer exercise={exercise} onClose={() => setShowMedia(false)} />}
      {showProgression && hasProgression && (
        <ProgressionChain
          chain={chain}
          currentExerciseId={exercise.id}
          shouldAdvance={advanceSuggested}
          onClose={() => setShowProgression(false)}
        />
      )}
    </div>
  )
}
