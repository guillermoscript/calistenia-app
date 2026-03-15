import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Image, ArrowUp, Info } from 'lucide-react'
import Timer from './Timer'
import YoutubeModal from './YoutubeModal'
import MediaViewer from './MediaViewer'
import ProgressionChain from './ProgressionChain'
import { useProgressions } from '../hooks/useProgressions'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { cn } from '../lib/utils'
import type { Exercise, ExerciseLog, SetData, Priority } from '../types'

// Priority → semantic Tailwind classes (no hex)
const PRIORITY_STRIPE: Record<Priority, string> = { high: 'bg-red-500', med: 'bg-amber-400', low: 'bg-sky-500' }
const PRIORITY_TEXT: Record<Priority, string>   = { high: 'text-red-500', med: 'text-amber-400', low: 'text-sky-500' }
const PRIORITY_LABELS: Record<Priority, string> = { high: 'PRIORITARIO', med: 'IMPORTANTE', low: 'COMPLEMENTARIO' }

interface ExerciseCardProps {
  exercise: Exercise
  workoutKey: string
  onLogSet: (exerciseId: string, workoutKey: string, data: { reps: string; note: string }) => void
  onStartRest: (seconds: number) => void
  logs?: ExerciseLog[]
}

export default function ExerciseCard({ exercise, workoutKey, onLogSet, onStartRest, logs = [] }: ExerciseCardProps) {
  const navigate = useNavigate()
  const [showTimer, setShowTimer] = useState<boolean>(false)
  const [showYoutube, setShowYoutube] = useState<boolean>(false)
  const [showMedia, setShowMedia] = useState<boolean>(false)
  const [showEditForm, setShowEditForm] = useState<boolean>(false)
  const [showHistory, setShowHistory] = useState<boolean>(false)
  const [showProgression, setShowProgression] = useState<boolean>(false)
  const { getChainForExercise, shouldSuggestProgression } = useProgressions()
  const chain = getChainForExercise(exercise.id)
  const hasProgression = chain.length > 0
  const advanceSuggested = hasProgression && shouldSuggestProgression(exercise.id, logs)
  const [logReps, setLogReps] = useState<string>('')
  const [logNote, setLogNote] = useState<string>('')
  const [setsLogged, setSetsLogged] = useState<number>(0)
  const [flash, setFlash] = useState<boolean>(false)

  const totalSets = exercise.sets === 'múltiples' ? '∞' : exercise.sets
  const isComplete = totalSets !== '∞' && setsLogged >= parseInt(String(totalSets))
  const recentLogs = logs.slice(0, 3)

  const triggerFlash = (): void => {
    setFlash(true)
    setTimeout(() => setFlash(false), 400)
  }

  const handleQuickLog = (): void => {
    if (isComplete) return
    const reps = String(exercise.reps)
    onLogSet(exercise.id, workoutKey, { reps, note: '' })
    setSetsLogged(s => s + 1)
    onStartRest(exercise.rest || 90)
    triggerFlash()
  }

  const handleFormLog = (): void => {
    if (!logReps) return
    onLogSet(exercise.id, workoutKey, { reps: logReps, note: logNote })
    setSetsLogged(s => s + 1)
    setLogReps('')
    setLogNote('')
    setShowEditForm(false)
    onStartRest(exercise.rest || 90)
    triggerFlash()
  }

  return (
    <div className={cn(
      'bg-card rounded-xl overflow-hidden transition-[border-color] duration-300 border',
      isComplete ? 'border-lime/35' : 'border-border'
    )}>
      <style>{`
        @keyframes quickFlash {
          0%   { background: hsl(var(--lime) / 0.15); }
          100% { background: transparent; }
        }
        .ex-flash { animation: quickFlash 0.4s ease-out; }
      `}</style>

      {/* Priority stripe */}
      <div className={cn('h-0.5', PRIORITY_STRIPE[exercise.priority] || 'bg-muted')} />

      <div className={`px-4 py-4 transition-[background] duration-100 ${flash ? 'ex-flash' : ''}`}>

        {/* Header row */}
        <div className="flex justify-between items-start gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-[15px]">{exercise.name}</span>
              {isComplete && (
                <span className="text-[11px] text-emerald-500 font-mono tracking-[0.5px]">✓ COMPLETADO</span>
              )}
            </div>
            <div className="flex gap-4 mb-1.5 flex-wrap">
              <span className="font-mono text-[12px] text-lime">{totalSets} × {exercise.reps}</span>
              <span className="font-mono text-[11px] text-muted-foreground">descanso {exercise.rest}s</span>
              <span className={cn('font-mono text-[10px] tracking-wide', PRIORITY_TEXT[exercise.priority])}>
                {PRIORITY_LABELS[exercise.priority]}
              </span>
            </div>
            <div className="text-[12px] text-muted-foreground">{exercise.muscles}</div>
          </div>

          {/* Sets counter */}
          <div className="text-center flex-shrink-0">
            <div className={cn(
              'font-bebas text-[28px] leading-none transition-colors duration-200',
              setsLogged > 0 ? 'text-lime' : 'text-muted-foreground/30'
            )}>
              {setsLogged}<span className="text-base text-muted-foreground/40">/{totalSets}</span>
            </div>
            <div className="text-[9px] text-muted-foreground tracking-wide font-mono uppercase">Series</div>
          </div>
        </div>

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
            disabled={isComplete}
            className={cn(
              'flex-1 py-[13px] px-3 rounded-md font-mono text-[12px] font-bold tracking-wide flex items-center justify-center gap-2 transition-all duration-150',
              isComplete
                ? 'bg-emerald-500/10 text-emerald-500 cursor-default'
                : 'bg-lime/13 text-lime hover:bg-lime/20 cursor-pointer'
            )}
          >
            {isComplete ? (
              <>✓ COMPLETADO</>
            ) : (
              <>
                <span className="text-base leading-none">+</span>
                SERIE — {exercise.reps} REPS
              </>
            )}
          </button>

          {!isComplete && (
            <button
              onClick={() => setShowEditForm(v => !v)}
              title="Editar reps / añadir nota"
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

          {exercise.demoImages && exercise.demoImages.length > 0 && (
            <button
              onClick={() => setShowMedia(true)}
              className="py-[13px] px-3.5 rounded-md text-[13px] leading-none flex-shrink-0 border border-lime/18 bg-lime/5 text-lime hover:bg-lime/10 cursor-pointer transition-all duration-150"
              title="Ver media"
            >
              <Image size={15} />
            </button>
          )}

          <button
            onClick={() => setShowYoutube(true)}
            className="py-[13px] px-3.5 rounded-md text-[13px] leading-none flex-shrink-0 border border-red-500/18 bg-red-500/5 text-red-500 hover:bg-red-500/10 cursor-pointer transition-all duration-150"
            title="Ver tutorial"
          >
            ▶
          </button>

          <button
            onClick={() => navigate(`/exercises/${exercise.id}`)}
            className="py-[13px] px-3.5 rounded-md text-[13px] leading-none flex-shrink-0 border border-zinc-600/30 bg-zinc-500/5 text-zinc-400 hover:bg-zinc-500/10 hover:text-lime cursor-pointer transition-all duration-150"
            title="Ver detalle del ejercicio"
          >
            <Info size={15} />
          </button>

          {recentLogs.length > 0 && (
            <button
              onClick={() => setShowHistory(v => !v)}
              className={cn(
                'py-[13px] px-3 rounded-md font-mono text-[10px] tracking-[0.5px] flex-shrink-0 border transition-all duration-150',
                showHistory
                  ? 'border-border/50 bg-muted/30 text-foreground'
                  : 'border-border text-muted-foreground hover:border-border/70'
              )}
            >
              HIST
            </button>
          )}

          {hasProgression && (
            <button
              onClick={() => setShowProgression(true)}
              className={cn(
                'relative py-[13px] px-3 rounded-md font-mono text-[10px] tracking-[0.5px] flex-shrink-0 border transition-all duration-150',
                'border-border text-muted-foreground hover:border-lime/30 hover:text-lime'
              )}
            >
              PROG
              {advanceSuggested && (
                <span className="absolute -top-1.5 -right-1.5 text-lime">
                  <ArrowUp size={12} className="animate-bounce" />
                </span>
              )}
            </button>
          )}
        </div>

        {/* EDIT FORM */}
        {showEditForm && (
          <div className="mt-2.5 px-3.5 py-3 bg-lime/4 rounded-lg border border-lime/10">
            <div className="text-[10px] text-lime tracking-[2px] mb-2.5 uppercase">Registrar serie personalizada</div>
            <div className="flex gap-2 flex-wrap">
              <Input
                value={logReps}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLogReps(e.target.value)}
                placeholder={`Reps (ej: ${exercise.reps})`}
                className="flex-1 min-w-[110px] h-8 text-xs"
              />
              <Input
                value={logNote}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLogNote(e.target.value)}
                placeholder="Nota opcional (ej: fácil, con dolor…)"
                className="flex-[2] min-w-[150px] h-8 text-xs"
              />
              <Button
                onClick={handleFormLog}
                disabled={!logReps}
                size="sm"
                className={cn(
                  'h-8 px-4 text-[11px] font-bold',
                  logReps
                    ? 'bg-lime text-lime-foreground hover:bg-lime/90'
                    : 'bg-lime/20 text-muted-foreground cursor-not-allowed'
                )}
              >
                ✓ GUARDAR
              </Button>
            </div>
          </div>
        )}

        {/* HISTORY */}
        {showHistory && recentLogs.length > 0 && (
          <div className="mt-2.5">
            <div className="text-[9px] text-muted-foreground tracking-[2px] mb-1.5 uppercase font-mono">Historial reciente</div>
            {recentLogs.map((log, i) => (
              <div key={i} className="py-1.5 border-b border-border/50 text-[12px]">
                <span className="font-mono text-sky-600 dark:text-sky-400 mr-3">{log.date}</span>
                {log.sets?.map((s: SetData, j: number) => (
                  <span key={j} className="mr-2">
                    Serie {j + 1}: <strong>{s.reps}</strong>
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

      {showYoutube && <YoutubeModal query={exercise.youtube} onClose={() => setShowYoutube(false)} />}
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
