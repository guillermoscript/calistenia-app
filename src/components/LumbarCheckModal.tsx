/**
 * LumbarCheckModal — Quick daily lumbar check (3 questions)
 */
import { useState, useCallback } from 'react'
import { pb } from '../lib/pocketbase'
import { cn } from '../lib/utils'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog'
import type { LumbarCheck } from '../types'

const LS_KEY = 'calistenia_lumbar_checks'

type PainLevel = 1 | 2 | 3 | 4 | 5

function lsLoadChecks(): LumbarCheck[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}
function lsSaveCheck(check: LumbarCheck): void {
  const checks = lsLoadChecks()
  checks.push(check)
  localStorage.setItem(LS_KEY, JSON.stringify(checks))
}

const PAIN_LABELS: Record<PainLevel, string> = { 1: 'Sin dolor', 2: 'Leve', 3: 'Moderado', 4: 'Fuerte', 5: 'Intenso' }

// Semantic Tailwind classes per pain level
const PAIN_BORDER: Record<PainLevel, string> = {
  1: 'border-emerald-400 bg-emerald-400/10 text-emerald-400',
  2: 'border-[hsl(var(--lime))] bg-[hsl(var(--lime))]/10 text-[hsl(var(--lime))]',
  3: 'border-amber-400 bg-amber-400/10 text-amber-400',
  4: 'border-orange-400 bg-orange-400/10 text-orange-400',
  5: 'border-destructive bg-destructive/10 text-destructive',
}
const PAIN_TEXT: Record<PainLevel, string> = {
  1: 'text-emerald-400',
  2: 'text-[hsl(var(--lime))]',
  3: 'text-amber-400',
  4: 'text-orange-400',
  5: 'text-destructive',
}

interface LumbarCheckModalProps {
  user: { id: string } | null
  onDone: () => void
  onSkip: () => void
}

export default function LumbarCheckModal({ user, onDone, onSkip }: LumbarCheckModalProps) {
  const [step, setStep]             = useState<number>(0)
  const [lumbarScore, setLumbarScore] = useState<PainLevel | null>(null)
  const [sleptWell, setSleptWell]   = useState<boolean | null>(null)
  const [sittingHours, setSittingHours] = useState<string>('')
  const [saving, setSaving]         = useState<boolean>(false)

  const handleSave = useCallback(async () => {
    setSaving(true)
    const today = new Date().toISOString().split('T')[0]
    const record: LumbarCheck = {
      date: today,
      lumbar_score: lumbarScore!,
      slept_well: sleptWell!,
      sitting_hours: parseFloat(sittingHours) || 0,
      created_at: new Date().toISOString(),
    }
    lsSaveCheck(record)
    if (user?.id) {
      try {
        await pb.collection('lumbar_checks').create({
          user: user.id,
          date: today,
          lumbar_score: lumbarScore,
          slept_well: sleptWell,
          sitting_hours: parseFloat(sittingHours) || 0,
          checked_at: new Date().toISOString().replace('T', ' '),
        })
      } catch {}
    }
    setSaving(false)
    onDone()
  }, [user, lumbarScore, sleptWell, sittingHours, onDone])

  return (
    <Dialog open modal>
      <DialogContent
        className="max-w-[480px] max-sm:max-w-[95vw]"
        onInteractOutside={(e: Event) => e.preventDefault()}
        hideClose
      >
        <DialogHeader className="mb-2">
          <div className="font-mono text-[10px] text-muted-foreground tracking-[3px] mb-1.5">CHEQUEO MATUTINO</div>
          <DialogTitle className="font-bebas text-[32px] leading-none">¿Cómo estás hoy?</DialogTitle>
          <DialogDescription className="text-[13px]">30 segundos · Solo una vez al día</DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex gap-1.5 mb-6">
          {[0, 1, 2].map(i => (
            <div key={i}
              className={cn(
                'flex-1 h-[3px] rounded transition-colors duration-300',
                i <= step ? 'bg-[hsl(var(--lime))]' : 'bg-border',
              )}
            />
          ))}
        </div>

        {/* Step 0: Lumbar pain */}
        {step === 0 && (
          <div>
            <div className="text-base font-semibold mb-5">¿Cómo está tu lumbar hoy?</div>
            <div className="flex gap-2.5 mb-5">
              {([1, 2, 3, 4, 5] as PainLevel[]).map(n => (
                <button
                  key={n}
                  onClick={() => setLumbarScore(n)}
                  className={cn(
                    'flex-1 py-3.5 rounded-lg border font-bebas text-[22px] cursor-pointer transition-all duration-150',
                    lumbarScore === n
                      ? PAIN_BORDER[n]
                      : 'border-border text-muted-foreground hover:border-border/80',
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            {lumbarScore && (
              <div className={cn('font-mono text-[12px] mb-5 text-center', PAIN_TEXT[lumbarScore])}>
                {PAIN_LABELS[lumbarScore]}
              </div>
            )}
            <Button
              className="w-full font-bebas text-lg"
              onClick={() => setStep(1)}
              disabled={!lumbarScore}
            >
              SIGUIENTE →
            </Button>
          </div>
        )}

        {/* Step 1: Sleep */}
        {step === 1 && (
          <div>
            <div className="text-base font-semibold mb-5">¿Dormiste bien anoche?</div>
            <div className="flex gap-3 mb-6">
              {[
                { val: true,  label: 'Sí, bien', cls: 'border-emerald-400 bg-emerald-400/10 text-emerald-400' },
                { val: false, label: 'No mucho', cls: 'border-destructive bg-destructive/10 text-destructive' },
              ].map(opt => (
                <button
                  key={String(opt.val)}
                  onClick={() => setSleptWell(opt.val)}
                  className={cn(
                    'flex-1 py-5 rounded-lg border font-bebas text-xl cursor-pointer transition-all duration-150',
                    sleptWell === opt.val
                      ? opt.cls
                      : 'border-border text-muted-foreground hover:border-border/80',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Button
              className="w-full font-bebas text-lg"
              onClick={() => setStep(2)}
              disabled={sleptWell === null}
            >
              SIGUIENTE →
            </Button>
          </div>
        )}

        {/* Step 2: Sitting hours */}
        {step === 2 && (
          <div>
            <div className="text-base font-semibold mb-2">¿Cuántas horas sentado ayer?</div>
            <div className="text-[13px] text-muted-foreground mb-5">Incluye trabajo + comidas + pantallas.</div>
            <div className="flex gap-2 mb-6 flex-wrap">
              {['2', '4', '6', '8', '10', '12+'].map(h => {
                const val = h === '12+' ? '12' : h
                const selected = sittingHours === val
                return (
                  <button
                    key={h}
                    onClick={() => setSittingHours(val)}
                    className={cn(
                      'px-4 py-2.5 rounded-md border font-mono text-[13px] cursor-pointer transition-all duration-150',
                      selected
                        ? 'border-amber-400 bg-amber-400/10 text-amber-400'
                        : 'border-border text-muted-foreground hover:border-border/80',
                    )}
                  >
                    {h}h
                  </button>
                )
              })}
            </div>
            <Button
              className="w-full font-bebas text-lg"
              onClick={handleSave}
              disabled={!sittingHours || saving}
            >
              {saving ? 'GUARDANDO...' : 'GUARDAR ✓'}
            </Button>
          </div>
        )}

        {/* Skip */}
        <Button
          variant="ghost"
          onClick={onSkip}
          className="mt-2 w-full font-mono text-[11px] tracking-wide text-muted-foreground"
        >
          SALTAR POR HOY
        </Button>
      </DialogContent>
    </Dialog>
  )
}
