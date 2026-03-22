/**
 * LumbarCheckModal — Quick daily lumbar check (2 questions + sleep status from sleep entries)
 */
import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { pb } from '../lib/pocketbase'
import { cn } from '../lib/utils'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog'
import { useSleep } from '../hooks/useSleep'
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
  const navigate = useNavigate()
  const [step, setStep]             = useState<number>(0)
  const [lumbarScore, setLumbarScore] = useState<PainLevel | null>(null)
  const [sittingHours, setSittingHours] = useState<string>('')
  const [saving, setSaving]         = useState<boolean>(false)

  // Get sleep data from sleep tracking
  const { didSleepWell: checkSleepWell } = useSleep(user?.id ?? null)
  const today = new Date().toISOString().split('T')[0]
  // Check last night (yesterday's date is the sleep entry date)
  const yesterday = (() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString().split('T')[0]
  })()
  const sleepWellStatus = checkSleepWell(yesterday)

  const handleSave = useCallback(async () => {
    setSaving(true)
    const record: LumbarCheck = {
      date: today,
      lumbar_score: lumbarScore!,
      slept_well: sleepWellStatus ?? undefined,
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
          slept_well: sleepWellStatus ?? null,
          sitting_hours: parseFloat(sittingHours) || 0,
          checked_at: new Date().toISOString().replace('T', ' '),
        })
      } catch {}
    }
    setSaving(false)
    onDone()
  }, [user, lumbarScore, sleepWellStatus, sittingHours, onDone, today])

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

        {/* Step indicator — now 3 steps: lumbar, sleep status, sitting */}
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

        {/* Step 1: Sleep status (read-only from sleep tracking) */}
        {step === 1 && (
          <div>
            <div className="text-base font-semibold mb-5">¿Cómo dormiste anoche?</div>

            {sleepWellStatus !== null ? (
              // Sleep entry exists — show read-only badge
              <div className="mb-6">
                <div className={cn(
                  'flex items-center gap-3 p-4 rounded-lg border',
                  sleepWellStatus
                    ? 'border-emerald-400/30 bg-emerald-400/5'
                    : 'border-destructive/30 bg-destructive/5',
                )}>
                  <div className="text-2xl">{sleepWellStatus ? '😊' : '😴'}</div>
                  <div>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-sm font-bebas tracking-wide',
                        sleepWellStatus
                          ? 'border-emerald-400/40 text-emerald-400 bg-emerald-400/10'
                          : 'border-destructive/40 text-destructive bg-destructive/10',
                      )}
                    >
                      {sleepWellStatus ? 'Dormiste bien' : 'Dormiste mal'}
                    </Badge>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Dato del registro de sueño
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              // No sleep entry — show link to register
              <div className="mb-6">
                <div className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card">
                  <div className="text-2xl">🌙</div>
                  <div className="flex-1">
                    <div className="text-sm text-muted-foreground mb-1">No hay registro de sueño</div>
                    <button
                      onClick={() => {
                        onSkip()
                        navigate('/sleep')
                      }}
                      className="text-sm text-indigo-400 hover:text-indigo-300 font-medium underline underline-offset-2 transition-colors"
                    >
                      Registrar sueño primero
                    </button>
                  </div>
                </div>
              </div>
            )}

            <Button
              className="w-full font-bebas text-lg"
              onClick={() => setStep(2)}
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
