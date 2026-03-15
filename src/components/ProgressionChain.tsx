import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { cn } from '../lib/utils'
import type { ExerciseProgression } from '../types'

interface ProgressionChainProps {
  chain: ExerciseProgression[]
  currentExerciseId: string
  shouldAdvance?: boolean
  onClose: () => void
}

const CATEGORY_LABELS: Record<string, string> = {
  push: 'Empuje',
  pull: 'Tirón',
  legs: 'Piernas',
  core: 'Core',
  skills: 'Skills',
  lumbar: 'Lumbar',
}

export default function ProgressionChain({ chain, currentExerciseId, shouldAdvance, onClose }: ProgressionChainProps) {
  const currentIdx = chain.findIndex(p => p.exerciseId === currentExerciseId)
  const category = chain[0]?.category || ''

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-[95vw] sm:max-w-lg p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-sm font-mono tracking-wide">
            PROGRESIÓN — {CATEGORY_LABELS[category] || category.toUpperCase()}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Cadena de ejercicios de menor a mayor dificultad
          </DialogDescription>
        </DialogHeader>

        {/* Horizontal scrollable chain */}
        <div className="overflow-x-auto -mx-4 px-4 sm:-mx-6 sm:px-6 pb-2">
          <div className="flex items-center gap-1.5 min-w-max py-3">
            {chain.map((prog, i) => {
              const isCurrent = prog.exerciseId === currentExerciseId
              const isCompleted = currentIdx >= 0 && i < currentIdx
              const isFuture = currentIdx >= 0 && i > currentIdx
              const isNext = isFuture && i === currentIdx + 1

              return (
                <div key={prog.exerciseId} className="flex items-center gap-1.5">
                  {/* Exercise pill */}
                  <div
                    className={cn(
                      'relative px-3 py-2 rounded-lg border text-center transition-all duration-200 min-w-[90px] max-w-[120px]',
                      isCurrent && 'border-lime bg-lime/10 shadow-[0_0_8px_rgba(200,245,66,0.15)]',
                      isCompleted && 'border-emerald-500/30 bg-emerald-500/5',
                      isFuture && !isNext && 'border-zinc-700/50 bg-zinc-800/30',
                      isNext && shouldAdvance && 'border-lime/50 bg-lime/5',
                      isNext && !shouldAdvance && 'border-zinc-700/50 bg-zinc-800/30',
                    )}
                  >
                    {/* Difficulty badge */}
                    <div className={cn(
                      'text-[9px] font-mono tracking-wider mb-1',
                      isCurrent ? 'text-lime' : isCompleted ? 'text-emerald-500/60' : 'text-muted-foreground/50',
                    )}>
                      LV.{prog.difficultyOrder}
                    </div>

                    {/* Name */}
                    <div className={cn(
                      'text-[11px] font-medium leading-tight',
                      isCurrent ? 'text-foreground' : isCompleted ? 'text-emerald-500/70' : 'text-muted-foreground/60',
                    )}>
                      {prog.exerciseName}
                    </div>

                    {/* Current indicator */}
                    {isCurrent && (
                      <div className="text-[8px] font-mono text-lime tracking-widest mt-1">ACTUAL</div>
                    )}

                    {/* Completed check */}
                    {isCompleted && (
                      <div className="text-[8px] font-mono text-emerald-500/60 tracking-widest mt-1">HECHO</div>
                    )}

                    {/* Advance badge */}
                    {isNext && shouldAdvance && (
                      <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap">
                        <span className="text-[8px] font-mono font-bold text-lime bg-lime/15 border border-lime/30 rounded-full px-2 py-0.5 animate-pulse">
                          Listo para avanzar
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Arrow connector (except after last) */}
                  {i < chain.length - 1 && (
                    <span className={cn(
                      'text-[14px] flex-shrink-0',
                      i < currentIdx ? 'text-emerald-500/40' : 'text-muted-foreground/25',
                    )}>
                      →
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Target info */}
        {currentIdx >= 0 && chain[currentIdx] && (
          <div className="text-[11px] text-muted-foreground bg-muted/30 rounded px-3 py-2 border-l-2 border-lime/20">
            <span className="font-mono text-lime">{chain[currentIdx].targetRepsToAdvance} reps</span>
            {' '}en{' '}
            <span className="font-mono text-lime">{chain[currentIdx].sessionsAtTarget} sesiones</span>
            {' '}consecutivas para avanzar
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
