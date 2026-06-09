import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { detectDayType } from '../../utils/detectDayType'
import { stretchTemplates } from '../../data/stretch-templates'
import type { Exercise } from '../../types'

// ── Local sub-components ────────────────────────────────────────────────────

function SectionToggle({ checked, onToggle, label, count, color }: {
  checked: boolean
  onToggle: () => void
  label: string
  count: number
  color: 'amber' | 'sky'
}) {
  const active = color === 'amber'
    ? 'border-amber-400/40 bg-amber-400/5'
    : 'border-sky-400/40 bg-sky-400/5'
  const dot = color === 'amber'
    ? 'border-amber-400 bg-amber-400'
    : 'border-sky-400 bg-sky-400'

  return (
    <button
      onClick={onToggle}
      className={cn(
        'w-full flex items-center gap-3 rounded-lg border px-4 py-3 transition-all duration-200',
        checked ? active : 'border-border bg-card',
      )}
    >
      <div className={cn(
        'size-5 rounded-full border-2 flex items-center justify-center transition-colors',
        checked ? dot : 'border-muted-foreground/40',
      )}>
        {checked && (
          <svg className="size-3 text-background" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="3,8 7,12 13,4" />
          </svg>
        )}
      </div>
      <span className={cn('text-sm font-medium', checked ? 'text-foreground' : 'text-muted-foreground')}>
        {label}
      </span>
      <span className="ml-auto text-[10px] font-mono text-muted-foreground">
        {count} ex
      </span>
    </button>
  )
}

function ExercisePreviewList({ exercises, label, color }: {
  exercises: Exercise[]
  label: string
  color: 'amber' | 'sky'
}) {
  if (exercises.length === 0) return null
  const dotColor = color === 'amber' ? 'bg-amber-400/60' : 'bg-sky-400/60'
  const textColor = color === 'amber' ? 'text-amber-400' : 'text-sky-400'

  return (
    <div>
      <div className={cn('text-[10px] font-mono tracking-[2px] mb-1.5 uppercase', textColor)}>
        {label}
      </div>
      <div className="space-y-0.5">
        {exercises.map(ex => (
          <div key={ex.id} className="flex items-center gap-2 px-2 py-1.5 rounded text-[12px]">
            <span className={cn('size-1.5 rounded-full shrink-0', dotColor)} />
            <span className="text-muted-foreground truncate">{ex.name}</span>
            <span className="ml-auto text-[10px] font-mono text-muted-foreground/60 shrink-0">
              {ex.sets}&times;{ex.reps}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

interface WarmupCooldownPromptProps {
  exercises: Exercise[]
  onConfirm: (config: {
    warmup: boolean
    cooldown: boolean
    warmupExercises: Exercise[]
    cooldownExercises: Exercise[]
  }) => void
  onSkip: () => void
}

export default function WarmupCooldownPrompt({ exercises, onConfirm, onSkip }: WarmupCooldownPromptProps) {
  const { t } = useTranslation()
  const [warmup, setWarmup] = useState(true)
  const [cooldown, setCooldown] = useState(true)

  const dayType = useMemo(() => detectDayType(exercises), [exercises])
  const template = stretchTemplates[dayType]

  return (
    <Dialog open modal>
      <DialogContent
        className="max-w-[480px] max-sm:max-w-[95vw]"
        onInteractOutside={(e: Event) => e.preventDefault()}
        hideClose
      >
        <DialogHeader className="mb-2">
          <div className="font-mono text-[10px] text-muted-foreground tracking-[3px] mb-1.5 uppercase">
            {dayType}
          </div>
          <DialogTitle className="font-bebas text-[28px] leading-none">
            {t('warmupCooldown.freeSession.prompt')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mb-5">
          <SectionToggle
            checked={warmup}
            onToggle={() => setWarmup(!warmup)}
            label={t('warmupCooldown.freeSession.warmupToggle')}
            count={template.warmup.length}
            color="amber"
          />
          <SectionToggle
            checked={cooldown}
            onToggle={() => setCooldown(!cooldown)}
            label={t('warmupCooldown.freeSession.cooldownToggle')}
            count={template.cooldown.length}
            color="sky"
          />
        </div>

        {(warmup || cooldown) && (
          <div className="space-y-3 mb-5 max-h-[30vh] overflow-y-auto">
            {warmup && (
              <ExercisePreviewList
                exercises={template.warmup}
                label={t('warmupCooldown.sections.warmup')}
                color="amber"
              />
            )}
            {cooldown && (
              <ExercisePreviewList
                exercises={template.cooldown}
                label={t('warmupCooldown.sections.cooldown')}
                color="sky"
              />
            )}
          </div>
        )}

        <Button
          className="w-full font-bebas text-lg tracking-wide"
          onClick={() => onConfirm({
            warmup,
            cooldown,
            warmupExercises: warmup ? template.warmup : [],
            cooldownExercises: cooldown ? template.cooldown : [],
          })}
        >
          {t('warmupCooldown.transitions.start')}
        </Button>
        <Button
          variant="ghost"
          onClick={onSkip}
          className="mt-1 w-full font-mono text-[11px] tracking-wide text-muted-foreground"
        >
          {t('warmupCooldown.skip.warmup')}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
