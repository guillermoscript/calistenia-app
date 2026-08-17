import { useTranslation } from 'react-i18next'
import type { SectionTransitionType, SessionPhase } from '@calistenia/core/lib/session-machine'

interface SessionTopBarProps {
  phase: SessionPhase
  transitionType: SectionTransitionType
  /** Nombre del ejercicio en curso, si la fase lo muestra. */
  exerciseName?: string
  /** Posición 1-based del ejercicio actual y total de ejercicios. */
  exerciseIndex: number
  exerciseTotal: number
  /** Posición 1-based del paso actual y total de pasos. */
  stepIndex: number
  stepTotal: number
  onBack: () => void
  onDiscard: () => void
  /** Sale solo mientras se está en el calentamiento y se puede saltar. */
  onSkipWarmup?: () => void
  /** Sale solo mientras se está en el enfriamiento y se puede saltar. */
  onSkipCooldown?: () => void
}

/** Cabecera de la sesión: volver, título de la fase, contadores, progreso y saltos de sección. */
export default function SessionTopBar({
  phase,
  transitionType,
  exerciseName,
  exerciseIndex,
  exerciseTotal,
  stepIndex,
  stepTotal,
  onBack,
  onDiscard,
  onSkipWarmup,
  onSkipCooldown,
}: SessionTopBarProps) {
  const { t } = useTranslation()

  return (
    <div className="flex-shrink-0">
      <div className="flex items-center justify-between px-4 h-[calc(52px+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)]">
        {/* Volver — solo navega, la sesión sigue viva en el contexto */}
        <button
          onClick={onBack}
          className="bg-transparent border-none cursor-pointer text-muted-foreground min-w-[44px] min-h-[44px] flex items-center justify-center hover:text-foreground transition-colors rounded-lg focus-visible:ring-2 focus-visible:ring-lime/40"
          aria-label="Volver"
        >
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>

        <div className="text-center min-w-0 flex-1 px-2">
          {phase === 'exercise' && exerciseName && (
            <div className="font-mono text-[10px] text-muted-foreground/60 tracking-[2px] truncate">
              {exerciseName.toUpperCase()}
            </div>
          )}
          {phase === 'rest' && (
            <div className="font-mono text-[10px] text-muted-foreground tracking-[3px]">DESCANSO</div>
          )}
          {phase === 'section-transition' && (
            <div className="font-mono text-[10px] text-lime tracking-[3px]">
              {t(`warmupCooldown.sections.${transitionType === 'warmup-to-main' ? 'warmup' : 'main'}`).toUpperCase()}
            </div>
          )}
          {phase === 'note' && (
            <div className="font-mono text-[10px] text-lime tracking-[3px]">COMPLETADO</div>
          )}
          <div className="font-mono text-[9px] text-muted-foreground/40 tracking-wide tabular-nums">
            {exerciseIndex}/{exerciseTotal} · {stepIndex}/{stepTotal} series
          </div>
        </div>

        <button
          onClick={onDiscard}
          className="bg-transparent border-none cursor-pointer text-muted-foreground min-w-[44px] min-h-[44px] flex items-center justify-center hover:text-red-400 transition-colors rounded-lg focus-visible:ring-2 focus-visible:ring-red-500/40"
          aria-label="Descartar sesion"
        >
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      {/* Barra de progreso de la sesión */}
      <div className="h-[3px] bg-muted">
        <div className="h-full bg-lime rounded-r-full transition-[width] duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]"
          style={{ width: `${(stepIndex / stepTotal) * 100}%` }} />
      </div>

      {onSkipWarmup && (
        <div className="flex justify-center py-1.5 border-b border-border">
          <button
            onClick={onSkipWarmup}
            className="font-mono text-[10px] tracking-wide text-muted-foreground hover:text-foreground transition-colors px-3 py-1"
          >
            {t('warmupCooldown.skip.warmup')}
          </button>
        </div>
      )}
      {onSkipCooldown && (
        <div className="flex justify-center py-1.5 border-b border-border">
          <button
            onClick={onSkipCooldown}
            className="font-mono text-[10px] tracking-wide text-muted-foreground hover:text-foreground transition-colors px-3 py-1"
          >
            {t('warmupCooldown.skip.remaining')}
          </button>
        </div>
      )}
    </div>
  )
}
