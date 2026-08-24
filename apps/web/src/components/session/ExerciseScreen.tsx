import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Image } from 'lucide-react'
import type { ExerciseLog, SetData } from '@calistenia/core/types'
import type { Step } from '@calistenia/core/lib/session-machine'
import { formatTempo, quickReps } from '@calistenia/core/lib/exercise-format'
import { useExerciseMedia, hasResolvedMedia } from '@calistenia/core/hooks/useExerciseMedia'
import YoutubeModal from '../YoutubeModal'
import MediaViewer from '../MediaViewer'
import Timer from '../Timer'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { cn } from '../../lib/utils'

interface ExerciseScreenProps {
  step: Step
  onLogged: (data: { reps: string; note: string; weight?: number; rpe?: number }) => void
  logs?: ExerciseLog[]
}

const ExerciseScreen = memo(function ExerciseScreen({ step, onLogged, logs = [] }: ExerciseScreenProps) {
  const { t } = useTranslation()
  const [editOpen,   setEditOpen]   = useState<boolean>(false)
  const [customReps, setCustomReps] = useState<string>('')
  const [customNote, setCustomNote] = useState<string>('')
  const [customWeight, setCustomWeight] = useState<string>('')
  const [customRpe, setCustomRpe]   = useState<string>('')
  const [showYoutube, setShowYoutube] = useState<boolean>(false)
  const [showMedia, setShowMedia]   = useState<boolean>(false)
  const [flash, setFlash]           = useState<boolean>(false)
  const [flyUp, setFlyUp]           = useState<number>(0)

  const { exercise, setNumber, totalSets } = step
  const recentLogs = logs.slice(0, 2)

  // Misma corrección que en `ExerciseCard`: el botón depende de lo que resuelva
  // `exerciseMedia`, no de que `demoImages` venga lleno (#608).
  const media = useExerciseMedia(exercise)
  const hasMedia = hasResolvedMedia(media)

  // Progressive overload hint
  const lastLog = logs[0]
  const lastBestReps = lastLog?.sets?.reduce((max: number, s: SetData) => {
    const n = parseInt(s.reps); return (!isNaN(n) && n > max) ? n : max
  }, 0) || 0
  const lastBestWeight = lastLog?.sets?.reduce((max: number, s: SetData) => (s.weight || 0) > max ? (s.weight || 0) : max, 0) || 0

  const defaultReps = quickReps(exercise.reps)

  const doLog = (reps: string | number, note: string = '', weight?: number, rpe?: number): void => {
    setFlash(true)
    setFlyUp(n => n + 1)
    setTimeout(() => setFlash(false), 350)
    onLogged({ reps: String(reps), note, weight, rpe })
  }

  const handleQuick = (): void => doLog(defaultReps)
  const handleForm  = (): void => {
    if (!customReps) return
    const w = customWeight ? parseFloat(customWeight) : undefined
    const r = customRpe ? parseInt(customRpe) : undefined
    doLog(customReps, customNote, w, r)
    setCustomReps(''); setCustomNote(''); setCustomWeight(''); setCustomRpe(''); setEditOpen(false)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <style>{`
        @keyframes sessionFlash {
          0%   { background: hsl(var(--lime) / 0.1); }
          100% { background: transparent; }
        }
        .ex-session-flash { animation: sessionFlash 0.35s ease-out; }
        @keyframes exerciseEnter {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .exercise-enter { animation: exerciseEnter 0.3s cubic-bezier(0.25, 1, 0.5, 1) both; }
        @keyframes dotPulse {
          0%   { transform: scaleY(1); }
          50%  { transform: scaleY(1.8); }
          100% { transform: scaleY(1); }
        }
        @keyframes formSlideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .form-slide-in { animation: formSlideIn 0.25s cubic-bezier(0.22, 1, 0.36, 1) both; }
        @keyframes setFlyUp {
          0%   { transform: translateY(0); opacity: 1; }
          100% { transform: translateY(-48px); opacity: 0; }
        }
        @keyframes dotGlow {
          0%   { box-shadow: 0 0 0 0 hsl(var(--lime) / 0.6); }
          50%  { box-shadow: 0 0 8px 3px hsl(var(--lime) / 0.3); }
          100% { box-shadow: 0 0 0 0 hsl(var(--lime) / 0); }
        }
        @keyframes dotBreathe {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.6; }
        }
      `}</style>

      <div className={`flex-1 flex flex-col px-5 sm:px-8 pt-6 pb-8 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] overflow-auto max-w-2xl mx-auto w-full motion-safe:exercise-enter ${flash ? 'ex-session-flash' : ''}`}>

        {/* Exercise name + set counter */}
        <div className="mb-2">
          <div className="font-bebas leading-none tracking-[2px] mb-1.5"
            style={{ fontSize: 'clamp(42px, 10vw, 64px)' }}>
            {exercise.name}
          </div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="font-mono text-[13px] text-lime tracking-wide">{exercise.reps}</span>
            <span className="font-mono text-[11px] text-muted-foreground">· {t('common.rest')} {exercise.rest}s</span>
            <span className="font-mono text-[10px] tracking-wide text-muted-foreground">
              {exercise.muscles}
            </span>
          </div>
        </div>

        {/* Superset badge */}
        {exercise.supersetGroup && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 mb-3 rounded-md bg-pink-500/10 border border-pink-500/30">
            <span className="text-[10px] font-mono tracking-wide text-pink-500">SUPERSET</span>
          </div>
        )}

        {/* Set tracker dots */}
        <div className="flex gap-2 items-center mb-5">
          {Array.from({ length: totalSets }).map((_, i) => (
            <div key={i} className={cn(
              'w-7 h-1.5 rounded transition-all duration-300',
              i < setNumber - 1 ? 'bg-lime' : i === setNumber - 1 ? 'bg-lime/40' : 'bg-border'
            )}
            style={
              i === setNumber - 2 && setNumber > 1
                ? { animation: 'dotPulse 0.4s cubic-bezier(0.25, 1, 0.5, 1), dotGlow 0.8s cubic-bezier(0.22, 1, 0.36, 1)' }
                : i === setNumber - 1
                  ? { animation: 'dotBreathe 2s ease-in-out infinite' }
                  : undefined
            }
            />
          ))}
          <span className="font-mono text-[10px] text-muted-foreground ml-1">SERIE {setNumber}/{totalSets}</span>
        </div>

        {/* Progressive overload hint */}
        {lastLog && lastBestReps > 0 && setNumber === 1 && (
          <div className="text-[12px] text-amber-400/80 bg-amber-400/5 rounded-md px-3.5 py-2.5 mb-4 border-l-[3px] border-amber-400/30">
            Ultima vez: <strong>{lastBestReps}</strong> reps
            {lastBestWeight > 0 && <> +<strong>{lastBestWeight}</strong>kg</>}
            {' — '}
            {lastBestWeight > 0
              ? `intenta +${(lastBestWeight + 2.5).toFixed(1)}kg o +1 rep`
              : `intenta ${lastBestReps + 1} reps`
            }
          </div>
        )}

        {/* Exercise note */}
        {exercise.note && (
          <div className="text-[13px] text-muted-foreground bg-muted/30 rounded-md px-3.5 py-2.5 mb-3 border-l-[3px] border-lime/20 italic leading-relaxed">
            {exercise.note}
          </div>
        )}

        {/* Structured tempo cues (plan-013) */}
        {formatTempo(exercise.tempo) && (
          <div className="text-[12px] text-cyan-400/80 bg-cyan-400/5 rounded-md px-3 py-2 mb-5 border-l-[3px] border-cyan-400/20 font-mono tracking-wide">
            Tempo: {formatTempo(exercise.tempo)}
          </div>
        )}

        {/* Recent history */}
        {recentLogs.length > 0 && (
          <div className="mb-5">
            <div className="text-[9px] text-muted-foreground/50 tracking-[2px] mb-1.5 uppercase font-mono">Últimas sesiones</div>
            {recentLogs.map((log, i) => (
              <div key={i} className="text-[12px] text-muted-foreground/50 mb-0.5">
                <span className="font-mono text-muted-foreground/30 mr-2">{log.date}</span>
                {log.sets?.map((s: SetData, j: number) => (
                  <span key={j} className="mr-1.5">
                    {j + 1}: <span className="text-muted-foreground/60">{s.reps}</span>
                    {s.weight && <span className="text-amber-400/60 ml-0.5">+{s.weight}kg</span>}
                    {s.rpe && <span className="text-pink-500/60 ml-0.5">RPE {s.rpe}</span>}
                    {s.note && <span className="text-muted-foreground/40 ml-0.5">({s.note})</span>}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Timer for timed exercises */}
        {exercise.isTimer && (
          <div className="mb-5 py-6 flex justify-center">
            <Timer initialSeconds={exercise.timerSeconds} label={exercise.name} />
          </div>
        )}

        <div className="flex-1" />

        {/* ── ACTION AREA ── */}
        <div className="flex flex-col gap-2.5">
          <div className="relative">
            <button
              onClick={handleQuick}
              aria-label={`Registrar serie completada con ${defaultReps}`}
              className="w-full py-[18px] px-4 rounded-lg cursor-pointer bg-lime/14 text-lime font-mono text-sm font-bold tracking-[1.5px] flex items-center justify-center gap-2.5 transition-[background-color,transform] duration-100 hover:bg-lime/22 active:scale-[0.97] active:bg-lime/24 focus-visible:ring-2 focus-visible:ring-lime/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
            >
              <span className="text-xl leading-none">+</span>
              SERIE COMPLETADA — {defaultReps}
            </button>
            {flyUp > 0 && (
              <span
                key={flyUp}
                aria-hidden="true"
                className="absolute right-4 top-1/2 font-bebas text-2xl text-lime pointer-events-none"
                style={{ animation: 'setFlyUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards' }}
              >
                +1
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setEditOpen(v => !v)}
              aria-label={editOpen ? t('session.closeSetEditor') : t('session.editCustomSet')}
              aria-expanded={editOpen}
              className={cn(
                'flex-1 min-h-[44px] px-2.5 rounded-md cursor-pointer font-mono text-[10px] tracking-wide transition-all duration-150 border focus-visible:ring-2 focus-visible:ring-lime/40',
                editOpen
                  ? 'border-lime/30 bg-lime/6 text-lime'
                  : 'border-border text-muted-foreground hover:border-lime/30 hover:text-lime'
              )}
            >
              {t('session.editBtn')}
            </button>

            {hasMedia && (
              <button
                onClick={() => setShowMedia(true)}
                aria-label="Ver fotos del ejercicio"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md cursor-pointer border border-lime/20 bg-lime/5 text-lime text-sm leading-none hover:bg-lime/10 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-lime/40"
              >
                <Image size={15} />
              </button>
            )}

            <button
              onClick={() => setShowYoutube(true)}
              aria-label="Ver tutorial en YouTube"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md cursor-pointer border border-red-500/20 bg-red-500/5 text-red-500 text-sm leading-none hover:bg-red-500/10 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-red-500/40"
            >
              ▶
            </button>
          </div>

          {editOpen && (
            <div className="px-3.5 py-3 bg-lime/4 rounded-lg border border-lime/12 form-slide-in">
              <div className="text-[9px] text-lime tracking-[2px] mb-2.5 uppercase font-mono">Registrar serie personalizada</div>
              <div className="flex gap-2">
                <Input
                  value={customReps}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomReps(e.target.value)}
                  placeholder={`Reps (ej: ${exercise.reps})`}
                  maxLength={20}
                  aria-label="Repeticiones"
                  className="flex-1 min-w-0 h-9 text-xs"
                />
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  max="999"
                  value={customWeight}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomWeight(e.target.value)}
                  placeholder={t('session.weightPlaceholder')}
                  aria-label="Lastre en kilogramos"
                  className="w-[88px] h-9 text-xs"
                />
                <Input
                  type="number"
                  min="1"
                  max="10"
                  step="1"
                  value={customRpe}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomRpe(e.target.value)}
                  placeholder="RPE"
                  title={t('session.rpeTitle')}
                  aria-label="RPE del 1 al 10"
                  className="w-[56px] h-9 text-xs"
                />
              </div>
              <div className="flex gap-2 mt-2">
                <Input
                  value={customNote}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomNote(e.target.value)}
                  placeholder={t('session.optionalNote')}
                  maxLength={200}
                  aria-label="Nota opcional"
                  className="flex-1 min-w-0 h-9 text-xs"
                />
                <Button
                  onClick={handleForm}
                  disabled={!customReps}
                  size="sm"
                  variant={customReps ? 'limeSolid' : undefined}
                  className={cn(
                    'h-9 px-5 text-[11px] font-bold tracking-wide',
                    !customReps && 'bg-lime/20 text-muted-foreground cursor-not-allowed'
                  )}
                >
                  GUARDAR
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showYoutube && <YoutubeModal query={exercise.youtube?.trim() || exercise.name} onClose={() => setShowYoutube(false)} />}
      {showMedia && <MediaViewer exercise={exercise} onClose={() => setShowMedia(false)} />}
    </div>
  )
})

export default ExerciseScreen
