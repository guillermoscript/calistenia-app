import { useState, useEffect, useRef, useCallback } from 'react'
import YoutubeModal from './YoutubeModal'
import Timer from './Timer'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog'
import { cn } from '../lib/utils'

// Priority → semantic Tailwind classes
const PRIORITY_STRIPE = { high: 'bg-red-500', med: 'bg-amber-400', low: 'bg-sky-500' }

const LOCAL_QUOTES = [
  { q: "The only bad workout is the one that didn't happen.", a: "Unknown" },
  { q: "Success is the sum of small efforts, repeated day in and day out.", a: "Robert Collier" },
  { q: "Strength does not come from the body. It comes from the will of the soul.", a: "Gandhi" },
  { q: "You don't have to be great to start, but you have to start to be great.", a: "Zig Ziglar" },
  { q: "The body achieves what the mind believes.", a: "Unknown" },
  { q: "No pain, no gain. Shut up and train.", a: "Unknown" },
  { q: "Push yourself because no one else is going to do it for you.", a: "Unknown" },
  { q: "Take care of your body. It's the only place you have to live.", a: "Jim Rohn" },
  { q: "Your body can stand almost anything. It's your mind that you have to convince.", a: "Unknown" },
  { q: "Discipline is the bridge between goals and accomplishment.", a: "Jim Rohn" },
  { q: "The difference between try and triumph is just a little umph!", a: "Marvin Phillips" },
  { q: "Fall seven times, stand up eight.", a: "Japanese Proverb" },
  { q: "It never gets easier, you just get stronger.", a: "Unknown" },
  { q: "The secret of getting ahead is getting started.", a: "Mark Twain" },
  { q: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", a: "Aristotle" },
  { q: "Hard work beats talent when talent doesn't work hard.", a: "Tim Notke" },
  { q: "The pain you feel today will be the strength you feel tomorrow.", a: "Unknown" },
  { q: "Small daily improvements are the key to staggering long-term results.", a: "Unknown" },
  { q: "Champions aren't made in the gyms. Champions are made from something deep inside them.", a: "Muhammad Ali" },
  { q: "It's not about being the best. It's about being better than you were yesterday.", a: "Unknown" },
]

function getLocalQuote() {
  return LOCAL_QUOTES[Math.floor(Math.random() * LOCAL_QUOTES.length)]
}

function buildSteps(exercises) {
  const steps = []
  exercises.forEach(ex => {
    const total = ex.sets === 'múltiples' ? 3 : (parseInt(ex.sets) || 1)
    for (let s = 1; s <= total; s++) {
      steps.push({ exercise: ex, setNumber: s, totalSets: total })
    }
  })
  return steps
}

const CONFETTI_COLORS = ['#c8f542', '#42c8f5', '#f54242', '#f5c842', '#f542c8', '#42f5a8']
const CONFETTI_COUNT  = 22

function Confetti() {
  const pieces = useRef(
    Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      id: i,
      left:  `${5 + Math.random() * 90}%`,
      size:  6 + Math.random() * 8,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: `${(Math.random() * 1.4).toFixed(2)}s`,
      dur:   `${(2.2 + Math.random() * 1.8).toFixed(2)}s`,
      rot:   Math.floor(Math.random() * 360),
      shape: Math.random() > 0.5 ? '50%' : '2px',
    }))
  ).current

  return (
    <>
      <style>{`
        @keyframes confettiFall {
          0%   { transform: translateY(-40px) rotate(0deg); opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
      {pieces.map(p => (
        <div key={p.id} style={{
          position: 'fixed',
          left: p.left,
          top: '-30px',
          width: p.size,
          height: p.size,
          background: p.color,
          borderRadius: p.shape,
          transform: `rotate(${p.rot}deg)`,
          animation: `confettiFall ${p.dur} ${p.delay} ease-in forwards`,
          zIndex: 9998,
          pointerEvents: 'none',
        }} />
      ))}
    </>
  )
}

// ─── Rest screen ──────────────────────────────────────────────────────────────
function RestScreen({ seconds, nextStep, onSkip }) {
  const [remaining, setRemaining] = useState(seconds)
  const touchStartX = useRef(null)

  useEffect(() => { setRemaining(seconds) }, [seconds])

  useEffect(() => {
    if (remaining <= 0) { onSkip(); return }
    const t = setTimeout(() => setRemaining(r => r - 1), 1000)
    return () => clearTimeout(t)
  }, [remaining]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleTouchStart = e => { touchStartX.current = e.touches[0].clientX }
  const handleTouchEnd   = e => {
    if (touchStartX.current !== null && e.changedTouches[0].clientX - touchStartX.current > 60) onSkip()
    touchStartX.current = null
  }

  const mins = Math.floor(remaining / 60)
  const secs = String(remaining % 60).padStart(2, '0')
  const pct  = seconds > 0 ? (remaining / seconds) : 0
  const circumference = 2 * Math.PI * 54
  const strokeDash    = circumference * pct
  const isUrgent = remaining < 10

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="flex-1 flex flex-col items-center justify-center gap-8 px-6 select-none"
    >
      <div className="text-[11px] tracking-[4px] text-muted-foreground uppercase font-mono">Descansando</div>

      <div className="relative w-[132px] h-[132px]">
        <svg width="132" height="132" className="-rotate-90">
          <circle cx="66" cy="66" r="54" fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
          <circle
            cx="66" cy="66" r="54" fill="none"
            stroke={isUrgent ? 'hsl(var(--destructive))' : 'hsl(var(--lime))'}
            strokeWidth="6"
            strokeDasharray={`${strokeDash} ${circumference}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.9s linear, stroke 0.3s' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn(
            'font-bebas text-[42px] tracking-[2px] leading-none transition-colors duration-300',
            isUrgent ? 'text-destructive' : 'text-foreground'
          )}>
            {mins}:{secs}
          </span>
        </div>
      </div>

      {nextStep && (
        <div className="w-full max-w-[340px] bg-card border border-border rounded-xl px-4 py-3.5">
          <div className="text-[9px] text-muted-foreground tracking-[3px] mb-2 uppercase font-mono">Siguiente</div>
          <div className={cn('h-0.5 rounded mb-2.5', PRIORITY_STRIPE[nextStep.exercise.priority] || 'bg-muted')} />
          <div className="font-semibold text-[15px] mb-1">{nextStep.exercise.name}</div>
          <div className="font-mono text-[12px] text-lime">
            {nextStep.exercise.reps}
            <span className="text-muted-foreground ml-2.5 text-[11px]">· Serie {nextStep.setNumber}/{nextStep.totalSets}</span>
          </div>
          <div className="text-[12px] text-muted-foreground mt-1">{nextStep.exercise.muscles}</div>
        </div>
      )}

      <Button
        variant="outline"
        onClick={onSkip}
        className="border-lime/25 bg-lime/7 text-lime hover:bg-lime/15 font-mono text-[11px] tracking-[2px] px-8"
      >
        SALTAR DESCANSO  →
      </Button>

      <div className="text-[11px] text-muted-foreground/50 font-mono">desliza → para saltar</div>
    </div>
  )
}

// ─── Exercise screen ──────────────────────────────────────────────────────────
function ExerciseScreen({ step, stepIdx, totalSteps, onLogged, logs = [] }) {
  const [editOpen,   setEditOpen]   = useState(false)
  const [customReps, setCustomReps] = useState('')
  const [customNote, setCustomNote] = useState('')
  const [showYoutube, setShowYoutube] = useState(false)
  const [flash, setFlash]           = useState(false)

  const { exercise, setNumber, totalSets } = step
  const recentLogs = logs.slice(0, 2)

  const doLog = (reps, note = '') => {
    setFlash(true)
    setTimeout(() => setFlash(false), 350)
    onLogged({ reps: String(reps), note })
  }

  const handleQuick = () => doLog(exercise.reps)
  const handleForm  = () => {
    if (!customReps) return
    doLog(customReps, customNote)
    setCustomReps(''); setCustomNote(''); setEditOpen(false)
  }

  const pct = totalSteps > 0 ? ((stepIdx + 1) / totalSteps) : 0

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* progress bar */}
      <div className="h-[3px] bg-muted">
        <div className="h-full bg-lime rounded-r-sm transition-[width] duration-400"
          style={{ width: `${pct * 100}%` }} />
      </div>

      <style>{`
        @keyframes sessionFlash {
          0%   { background: hsl(var(--lime) / 0.1); }
          100% { background: transparent; }
        }
        .ex-session-flash { animation: sessionFlash 0.35s ease-out; }
      `}</style>

      <div className={`flex-1 flex flex-col px-6 pb-8 overflow-auto ${flash ? 'ex-session-flash' : ''}`}>
        {/* Priority stripe */}
        <div className={cn('h-[3px] rounded-b-sm mb-7', PRIORITY_STRIPE[exercise.priority] || 'bg-muted')} />

        {/* Exercise name + set counter */}
        <div className="mb-2">
          <div className="font-bebas leading-none tracking-[2px] mb-1.5"
            style={{ fontSize: 'clamp(42px, 10vw, 64px)' }}>
            {exercise.name}
          </div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="font-mono text-[13px] text-lime tracking-wide">{exercise.reps}</span>
            <span className="font-mono text-[11px] text-muted-foreground">· descanso {exercise.rest}s</span>
            <span className="font-mono text-[10px] tracking-wide text-muted-foreground">
              {exercise.muscles}
            </span>
          </div>
        </div>

        {/* Set tracker dots */}
        <div className="flex gap-2 items-center mb-5">
          {Array.from({ length: totalSets }).map((_, i) => (
            <div key={i} className={cn(
              'w-7 h-1.5 rounded transition-colors duration-300',
              i < setNumber - 1 ? 'bg-lime' : i === setNumber - 1 ? 'bg-lime/40' : 'bg-border'
            )} />
          ))}
          <span className="font-mono text-[10px] text-muted-foreground ml-1">SERIE {setNumber}/{totalSets}</span>
        </div>

        {/* Exercise note */}
        {exercise.note && (
          <div className="text-[13px] text-muted-foreground bg-muted/30 rounded-md px-3.5 py-2.5 mb-5 border-l-[3px] border-lime/20 italic leading-relaxed">
            {exercise.note}
          </div>
        )}

        {/* Recent history */}
        {recentLogs.length > 0 && (
          <div className="mb-5">
            <div className="text-[9px] text-muted-foreground/50 tracking-[2px] mb-1.5 uppercase font-mono">Últimas sesiones</div>
            {recentLogs.map((log, i) => (
              <div key={i} className="text-[12px] text-muted-foreground/50 mb-0.5">
                <span className="font-mono text-muted-foreground/30 mr-2">{log.date}</span>
                {log.sets?.map((s, j) => (
                  <span key={j} className="mr-1.5">
                    {j + 1}: <span className="text-muted-foreground/60">{s.reps}</span>
                    {s.note && <span className="text-muted-foreground/40 ml-0.5">({s.note})</span>}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Timer for timed exercises */}
        {exercise.isTimer && (
          <div className="mb-5 px-4 py-3 bg-sky-500/4 rounded-lg border border-sky-500/12 flex justify-center">
            <Timer initialSeconds={exercise.timerSeconds} label={exercise.name} />
          </div>
        )}

        <div className="flex-1" />

        {/* ── ACTION AREA ── */}
        <div className="flex flex-col gap-2.5">
          <button
            onClick={handleQuick}
            className="w-full py-[18px] px-4 rounded-lg cursor-pointer bg-lime/14 text-lime font-mono text-sm font-bold tracking-[1.5px] flex items-center justify-center gap-2.5 transition-[background] duration-100 hover:bg-lime/22 active:bg-lime/24"
          >
            <span className="text-xl leading-none">+</span>
            SERIE COMPLETADA — {exercise.reps}
          </button>

          <div className="flex gap-2">
            <button
              onClick={() => setEditOpen(v => !v)}
              className={cn(
                'flex-1 py-[11px] px-2.5 rounded-md cursor-pointer font-mono text-[10px] tracking-wide transition-all duration-150 border',
                editOpen
                  ? 'border-lime/30 bg-lime/6 text-lime'
                  : 'border-border text-muted-foreground hover:border-lime/30 hover:text-lime'
              )}
            >
              ✏ EDITAR REPS
            </button>

            <button
              onClick={() => setShowYoutube(true)}
              className="py-[11px] px-3.5 rounded-md cursor-pointer border border-red-500/20 bg-red-500/5 text-red-500 text-sm leading-none hover:bg-red-500/10 transition-all duration-150"
              title="Ver tutorial"
            >
              ▶
            </button>
          </div>

          {editOpen && (
            <div className="px-3.5 py-3 bg-lime/4 rounded-lg border border-lime/12">
              <div className="text-[9px] text-lime tracking-[2px] mb-2.5 uppercase font-mono">Reps personalizadas</div>
              <div className="flex gap-2 flex-wrap">
                <Input
                  value={customReps}
                  onChange={e => setCustomReps(e.target.value)}
                  placeholder={`Reps (ej: ${exercise.reps})`}
                  className="flex-1 min-w-[100px] h-8 text-xs"
                />
                <Input
                  value={customNote}
                  onChange={e => setCustomNote(e.target.value)}
                  placeholder="Nota opcional…"
                  className="flex-[2] min-w-[130px] h-8 text-xs"
                />
                <Button
                  onClick={handleForm}
                  disabled={!customReps}
                  size="sm"
                  className={cn(
                    'h-8 px-4 text-[11px] font-bold',
                    customReps
                      ? 'bg-lime text-lime-foreground hover:bg-lime/90'
                      : 'bg-lime/20 text-muted-foreground cursor-not-allowed'
                  )}
                >
                  ✓
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showYoutube && <YoutubeModal query={exercise.youtube} onClose={() => setShowYoutube(false)} />}
    </div>
  )
}

// ─── Note screen ──────────────────────────────────────────────────────────────
function NoteScreen({ workoutTitle, totalSetsLogged, onSave }) {
  const [note, setNote] = useState('')
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-6">
      <div className="font-bebas text-5xl tracking-[2px] text-emerald-500 text-center leading-none">
        ¡Último set listo!
      </div>
      <div className="text-[11px] text-muted-foreground tracking-[2px] font-mono">
        {workoutTitle.toUpperCase()} · {totalSetsLogged} SERIES
      </div>

      <div className="w-full max-w-[420px] bg-card border border-border rounded-xl px-6 py-5">
        <div className="text-[10px] text-lime tracking-[2px] mb-2.5 uppercase font-mono">Nota de sesión</div>
        <div className="text-[13px] text-muted-foreground mb-3">¿Cómo fue? ¿Algo que destacar?</div>
        <Textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Ej: Dominadas mucho mejor hoy, llegué a 8 seguidas. Lumbar bien."
          rows={3}
          autoFocus
          className="text-[13px] resize-y leading-relaxed"
        />
        <div className="flex gap-2.5 mt-3">
          <Button
            onClick={() => onSave(note.trim())}
            className="bg-lime text-lime-foreground hover:bg-lime/90 font-bebas text-lg tracking-wide px-6"
          >
            GUARDAR
          </Button>
          <Button
            variant="outline"
            onClick={() => onSave('')}
            className="font-mono text-[11px] tracking-wide px-4"
          >
            SALTAR
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Celebrate screen ─────────────────────────────────────────────────────────
function CelebrateScreen({ workoutTitle, totalSetsLogged, onDone }) {
  const [quote, setQuote] = useState(getLocalQuote)

  useEffect(() => {
    fetch('https://zenquotes.io/api/random')
      .then(r => r.json())
      .then(([item]) => { if (item?.q) setQuote(item) })
      .catch(() => {})
  }, [])

  return (
    <div
      onClick={onDone}
      className="flex-1 flex flex-col items-center justify-center px-8 py-10 gap-7 cursor-pointer text-center relative"
    >
      <Confetti />

      <div className="size-[88px] rounded-full bg-muted border border-border flex items-center justify-center text-[40px] leading-none text-lime"
        style={{ animation: 'popIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both' }}>
        ✓
      </div>

      <style>{`
        @keyframes popIn {
          from { transform: scale(0); opacity: 0; }
          to   { transform: scale(1); opacity: 1; }
        }
        @keyframes fadeUp {
          from { transform: translateY(16px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>

      <div style={{ animation: 'fadeUp 0.5s 0.15s ease-out both' }}>
        <div className="font-bebas tracking-[3px] text-foreground leading-none mb-2"
          style={{ fontSize: 'clamp(40px, 10vw, 64px)' }}>
          SESIÓN COMPLETADA
        </div>
        <div className="font-mono text-[11px] text-muted-foreground tracking-[2px]">
          {workoutTitle.toUpperCase()} · {totalSetsLogged} SERIES
        </div>
      </div>

      <div className="max-w-[380px]" style={{ animation: 'fadeUp 0.5s 0.35s ease-out both' }}>
        <div className="h-px mb-6 bg-gradient-to-r from-transparent via-border to-transparent" />
        {quote && (
          <>
            <div className="text-base italic text-foreground/70 leading-relaxed mb-2.5">"{quote.q}"</div>
            <div className="font-mono text-[11px] text-muted-foreground tracking-wide">— {quote.a}</div>
          </>
        )}
        <div className="h-px mt-6 bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>

      <div style={{ animation: 'fadeUp 0.5s 0.5s ease-out both' }}>
        <Button
          onClick={e => { e.stopPropagation(); onDone() }}
          className="min-w-[200px] font-bebas text-xl tracking-[2px] px-9 py-3.5 mb-3"
        >
          IR AL DASHBOARD
        </Button>
        <div className="text-[11px] text-muted-foreground/50 font-mono tracking-wide">o toca en cualquier lugar</div>
      </div>
    </div>
  )
}

// ─── Main SessionView ─────────────────────────────────────────────────────────
export default function SessionView({
  workout,
  workoutKey,
  onLogSet,
  onMarkDone,
  onGoToDashboard,
  onExitSession,
  getExerciseLogs,
}) {
  const steps = useRef(buildSteps(workout.exercises)).current

  const [stepIdx,   setStepIdx]   = useState(0)
  const [phase,     setPhase]     = useState('exercise')
  const [setsCount, setSetsCount] = useState(0)
  const [showExit,  setShowExit]  = useState(false)

  const currentStep = steps[stepIdx]
  const nextStep    = steps[stepIdx + 1] || null
  const isLastStep  = stepIdx === steps.length - 1

  const handleLogged = useCallback(({ reps, note }) => {
    onLogSet(currentStep.exercise.id, workoutKey, { reps, note })
    setSetsCount(c => c + 1)
    if (isLastStep) {
      setPhase('note')
    } else {
      setPhase('rest')
    }
  }, [currentStep, isLastStep, onLogSet, workoutKey])

  const handleRestDone = useCallback(() => {
    setStepIdx(i => i + 1)
    setPhase('exercise')
  }, [])

  const handleNoteSaved = useCallback((note) => {
    onMarkDone(workoutKey, note)
    setPhase('celebrate')
  }, [onMarkDone, workoutKey])

  const handleInterruptConfirm = useCallback(() => {
    onMarkDone(workoutKey, '[INTERRUMPIDO]')
    onExitSession()
  }, [onMarkDone, workoutKey, onExitSession])

  return (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col overflow-hidden">
      {/* ── TOP BAR ── */}
      {phase !== 'celebrate' && (
        <div className="flex items-center justify-between px-5 h-[52px] border-b border-border flex-shrink-0">
          <button
            onClick={() => setShowExit(true)}
            className="bg-transparent border-none cursor-pointer text-muted-foreground font-mono text-[11px] tracking-wide py-1 flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            ← SALIR
          </button>

          <div className="text-center">
            {phase === 'exercise' && currentStep && (
              <div className="font-mono text-[9px] text-muted-foreground/50 tracking-[2px]">
                {currentStep.exercise.name.toUpperCase()}
              </div>
            )}
            {phase === 'rest' && (
              <div className="font-mono text-[9px] text-muted-foreground tracking-[3px]">DESCANSO</div>
            )}
            {phase === 'note' && (
              <div className="font-mono text-[9px] text-lime tracking-[3px]">COMPLETADO</div>
            )}
          </div>

          <div className="font-mono text-[10px] text-muted-foreground tracking-wide">
            {phase === 'note' ? steps.length : stepIdx + 1}
            <span className="text-muted-foreground/30">/{steps.length}</span>
          </div>
        </div>
      )}

      {phase === 'exercise' && currentStep && (
        <ExerciseScreen
          key={stepIdx}
          step={currentStep}
          stepIdx={stepIdx}
          totalSteps={steps.length}
          onLogged={handleLogged}
          logs={getExerciseLogs(currentStep.exercise.id)}
        />
      )}

      {phase === 'rest' && (
        <RestScreen
          key={`rest-${stepIdx}`}
          seconds={currentStep?.exercise.rest || 90}
          nextStep={nextStep}
          onSkip={handleRestDone}
        />
      )}

      {phase === 'note' && (
        <NoteScreen
          workoutTitle={workout.title}
          totalSetsLogged={setsCount}
          onSave={handleNoteSaved}
        />
      )}

      {phase === 'celebrate' && (
        <CelebrateScreen
          workoutTitle={workout.title}
          totalSetsLogged={setsCount}
          onDone={onGoToDashboard}
        />
      )}

      {/* Interrupt Dialog */}
      <Dialog open={showExit} onOpenChange={setShowExit}>
        <DialogContent className="max-w-[320px]">
          <DialogHeader>
            <DialogTitle className="font-bebas text-[28px] tracking-[2px]">¿Interrumpir sesión?</DialogTitle>
            <DialogDescription>
              Las series que ya registraste se guardarán. La sesión quedará marcada como incompleta.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2.5 sm:flex-col">
            <Button
              variant="outline"
              onClick={handleInterruptConfirm}
              className="border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 font-bebas text-lg tracking-wide"
            >
              GUARDAR Y SALIR
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowExit(false)}
              className="font-mono text-[11px] tracking-wide"
            >
              CONTINUAR ENTRENANDO
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
