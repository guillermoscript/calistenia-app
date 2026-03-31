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

        {/* Toggles */}
        <div className="space-y-3 mb-5">
          {/* Warmup toggle */}
          <button
            onClick={() => setWarmup(!warmup)}
            className={cn(
              'w-full flex items-center gap-3 rounded-lg border px-4 py-3 transition-all duration-200',
              warmup
                ? 'border-amber-400/40 bg-amber-400/5'
                : 'border-border bg-card',
            )}
          >
            <div className={cn(
              'size-5 rounded-full border-2 flex items-center justify-center transition-colors',
              warmup ? 'border-amber-400 bg-amber-400' : 'border-muted-foreground/40',
            )}>
              {warmup && (
                <svg className="size-3 text-background" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="3,8 7,12 13,4" />
                </svg>
              )}
            </div>
            <span className={cn('text-sm font-medium', warmup ? 'text-foreground' : 'text-muted-foreground')}>
              {t('warmupCooldown.freeSession.warmupToggle')}
            </span>
            <span className="ml-auto text-[10px] font-mono text-muted-foreground">
              {template.warmup.length} ex
            </span>
          </button>

          {/* Cooldown toggle */}
          <button
            onClick={() => setCooldown(!cooldown)}
            className={cn(
              'w-full flex items-center gap-3 rounded-lg border px-4 py-3 transition-all duration-200',
              cooldown
                ? 'border-sky-400/40 bg-sky-400/5'
                : 'border-border bg-card',
            )}
          >
            <div className={cn(
              'size-5 rounded-full border-2 flex items-center justify-center transition-colors',
              cooldown ? 'border-sky-400 bg-sky-400' : 'border-muted-foreground/40',
            )}>
              {cooldown && (
                <svg className="size-3 text-background" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="3,8 7,12 13,4" />
                </svg>
              )}
            </div>
            <span className={cn('text-sm font-medium', cooldown ? 'text-foreground' : 'text-muted-foreground')}>
              {t('warmupCooldown.freeSession.cooldownToggle')}
            </span>
            <span className="ml-auto text-[10px] font-mono text-muted-foreground">
              {template.cooldown.length} ex
            </span>
          </button>
        </div>

        {/* Preview */}
        {(warmup || cooldown) && (
          <div className="space-y-3 mb-5 max-h-[30vh] overflow-y-auto">
            {warmup && template.warmup.length > 0 && (
              <div>
                <div className="text-[10px] font-mono text-amber-400 tracking-[2px] mb-1.5 uppercase">
                  {t('warmupCooldown.sections.warmup')}
                </div>
                <div className="space-y-0.5">
                  {template.warmup.map(ex => (
                    <div key={ex.id} className="flex items-center gap-2 px-2 py-1.5 rounded text-[12px]">
                      <span className="size-1.5 rounded-full bg-amber-400/60 shrink-0" />
                      <span className="text-muted-foreground truncate">{ex.name}</span>
                      <span className="ml-auto text-[10px] font-mono text-muted-foreground/60 shrink-0">
                        {ex.sets}&times;{ex.reps}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {cooldown && template.cooldown.length > 0 && (
              <div>
                <div className="text-[10px] font-mono text-sky-400 tracking-[2px] mb-1.5 uppercase">
                  {t('warmupCooldown.sections.cooldown')}
                </div>
                <div className="space-y-0.5">
                  {template.cooldown.map(ex => (
                    <div key={ex.id} className="flex items-center gap-2 px-2 py-1.5 rounded text-[12px]">
                      <span className="size-1.5 rounded-full bg-sky-400/60 shrink-0" />
                      <span className="text-muted-foreground truncate">{ex.name}</span>
                      <span className="ml-auto text-[10px] font-mono text-muted-foreground/60 shrink-0">
                        {ex.sets}&times;{ex.reps}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
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
