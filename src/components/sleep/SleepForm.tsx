import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'

// ── Types ────────────────────────────────────────────────────────────────────

export interface SleepFormData {
  bedtime: string
  wake_time: string
  awakenings: number
  quality: number
  duration_minutes: number
  caffeine?: boolean
  screen_before_bed?: boolean
  stress_level?: number
  note?: string
}

interface SleepFormProps {
  onSubmit: (data: SleepFormData) => void
  onCancel?: () => void
  initialValues?: Partial<SleepFormData>
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function calcDuration(bedtime: string, wakeTime: string): number {
  if (!bedtime || !wakeTime) return 0
  const [bh, bm] = bedtime.split(':').map(Number)
  const [wh, wm] = wakeTime.split(':').map(Number)
  let bedMin = bh * 60 + bm
  let wakeMin = wh * 60 + wm
  if (wakeMin <= bedMin) wakeMin += 24 * 60 // crosses midnight
  return wakeMin - bedMin
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) return '--'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

const QUALITY_LABEL_KEYS = ['', 'sleep.qualityVeryBad', 'sleep.qualityBad', 'sleep.qualityFair', 'sleep.qualityGood', 'sleep.qualityExcellent']
const QUALITY_COLORS = [
  '',
  'text-red-500 border-red-500 bg-red-500/10',
  'text-orange-400 border-orange-400 bg-orange-400/10',
  'text-amber-400 border-amber-400 bg-amber-400/10',
  'text-lime border-lime bg-lime/10',
  'text-emerald-500 border-emerald-500 bg-emerald-500/10',
]

const STRESS_LABEL_KEYS = ['', 'sleep.stressVeryLow', 'sleep.stressLow', 'sleep.stressMedium', 'sleep.stressHigh', 'sleep.stressVeryHigh']

// ── Component ────────────────────────────────────────────────────────────────

export default function SleepForm({ onSubmit, onCancel, initialValues }: SleepFormProps) {
  const { t } = useTranslation()
  const [bedtime, setBedtime] = useState(initialValues?.bedtime ?? '')
  const [wakeTime, setWakeTime] = useState(initialValues?.wake_time ?? '')
  const [awakenings, setAwakenings] = useState(initialValues?.awakenings ?? 0)
  const [quality, setQuality] = useState(initialValues?.quality ?? 0)

  // Expanded fields
  const [expanded, setExpanded] = useState(
    !!(initialValues?.caffeine || initialValues?.screen_before_bed || initialValues?.stress_level || initialValues?.note),
  )
  const [caffeine, setCaffeine] = useState(initialValues?.caffeine ?? false)
  const [screenBed, setScreenBed] = useState(initialValues?.screen_before_bed ?? false)
  const [stressLevel, setStressLevel] = useState(initialValues?.stress_level ?? 0)
  const [note, setNote] = useState(initialValues?.note ?? '')

  const duration = useMemo(() => calcDuration(bedtime, wakeTime), [bedtime, wakeTime])

  const isValid = bedtime !== '' && wakeTime !== '' && quality >= 1 && quality <= 5

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid) return
    const data: SleepFormData = {
      bedtime,
      wake_time: wakeTime,
      awakenings,
      quality,
      duration_minutes: duration,
    }
    if (expanded) {
      data.caffeine = caffeine
      data.screen_before_bed = screenBed
      if (stressLevel > 0) data.stress_level = stressLevel
      if (note.trim()) data.note = note.trim()
    }
    onSubmit(data)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* ── Duration display ──────────────────────────────────────────── */}
      <div className="text-center py-3">
        <div className="text-[10px] text-muted-foreground tracking-[0.3em] uppercase mb-1">{t('sleep.duration')}</div>
        <div className={cn(
          'font-bebas text-4xl leading-none transition-colors',
          duration > 0 ? (duration >= 420 ? 'text-lime' : duration >= 360 ? 'text-amber-400' : 'text-red-500') : 'text-muted-foreground',
        )}>
          {formatDuration(duration)}
        </div>
      </div>

      {/* ── Time inputs ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-[11px] text-muted-foreground tracking-wide uppercase mb-1.5 block">
            {t('sleep.bedtime')}
          </Label>
          <Input
            type="time"
            value={bedtime}
            onChange={(e) => setBedtime(e.target.value)}
            className="h-11 text-center text-base tabular-nums"
            required
          />
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground tracking-wide uppercase mb-1.5 block">
            {t('sleep.wakeTime')}
          </Label>
          <Input
            type="time"
            value={wakeTime}
            onChange={(e) => setWakeTime(e.target.value)}
            className="h-11 text-center text-base tabular-nums"
            required
          />
        </div>
      </div>

      {/* ── Awakenings stepper ────────────────────────────────────────── */}
      <div>
        <Label className="text-[11px] text-muted-foreground tracking-wide uppercase mb-1.5 block">
          {t('sleep.awakenings')}
        </Label>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAwakenings(Math.max(0, awakenings - 1))}
            className="size-10 p-0 text-lg hover:border-indigo-400 hover:text-indigo-400"
            disabled={awakenings <= 0}
          >
            -
          </Button>
          <span className="font-bebas text-2xl w-8 text-center tabular-nums">{awakenings}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAwakenings(awakenings + 1)}
            className="size-10 p-0 text-lg hover:border-indigo-400 hover:text-indigo-400"
          >
            +
          </Button>
          <span className="text-[11px] text-muted-foreground ml-1">
            {awakenings === 0 ? t('sleep.none') : t('sleep.times', { count: awakenings })}
          </span>
        </div>
      </div>

      {/* ── Quality selector ──────────────────────────────────────────── */}
      <div>
        <Label className="text-[11px] text-muted-foreground tracking-wide uppercase mb-2 block">
          {t('sleep.quality')}
        </Label>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setQuality(q)}
              className={cn(
                'flex-1 h-11 rounded-lg border-2 transition-all flex flex-col items-center justify-center gap-0.5',
                quality === q
                  ? QUALITY_COLORS[q]
                  : 'border-border text-muted-foreground hover:border-muted-foreground/40',
              )}
            >
              <div className="flex">
                {Array.from({ length: q }).map((_, i) => (
                  <svg key={i} className="size-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                ))}
              </div>
              <span className="text-[9px] leading-none">{t(QUALITY_LABEL_KEYS[q])}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Expand toggle ─────────────────────────────────────────────── */}
      {!expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-indigo-400 transition-colors tracking-wide"
        >
          <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="8" y1="3" x2="8" y2="13" />
            <line x1="3" y1="8" x2="13" y2="8" />
          </svg>
          {t('sleep.moreDetail')}
        </button>
      )}

      {/* ── Expanded fields ───────────────────────────────────────────── */}
      {expanded && (
        <div className="space-y-4 pt-2 border-t border-border/60 motion-safe:animate-fade-in">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-indigo-400 transition-colors tracking-wide"
          >
            <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="8" x2="13" y2="8" />
            </svg>
            {t('sleep.lessDetail')}
          </button>

          {/* Caffeine toggle */}
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[13px] text-foreground">{t('sleep.caffeineAfter14')}</div>
              <div className="text-[10px] text-muted-foreground">{t('sleep.caffeineExamples')}</div>
            </div>
            <button
              type="button"
              onClick={() => setCaffeine(!caffeine)}
              className={cn(
                'w-12 h-7 rounded-full transition-colors relative shrink-0',
                caffeine ? 'bg-indigo-500' : 'bg-muted',
              )}
            >
              <div
                className={cn(
                  'size-5 rounded-full bg-white shadow-sm absolute top-1 transition-transform',
                  caffeine ? 'translate-x-6' : 'translate-x-1',
                )}
              />
            </button>
          </div>

          {/* Screen before bed toggle */}
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[13px] text-foreground">{t('sleep.screenBeforeBed')}</div>
              <div className="text-[10px] text-muted-foreground">{t('sleep.screenLastHour')}</div>
            </div>
            <button
              type="button"
              onClick={() => setScreenBed(!screenBed)}
              className={cn(
                'w-12 h-7 rounded-full transition-colors relative shrink-0',
                screenBed ? 'bg-indigo-500' : 'bg-muted',
              )}
            >
              <div
                className={cn(
                  'size-5 rounded-full bg-white shadow-sm absolute top-1 transition-transform',
                  screenBed ? 'translate-x-6' : 'translate-x-1',
                )}
              />
            </button>
          </div>

          {/* Stress level */}
          <div>
            <Label className="text-[11px] text-muted-foreground tracking-wide uppercase mb-2 block">
              {t('sleep.stressLevel')}
            </Label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStressLevel(stressLevel === s ? 0 : s)}
                  className={cn(
                    'flex-1 h-9 rounded-lg border transition-all text-[11px]',
                    stressLevel === s
                      ? s <= 2
                        ? 'border-emerald-500 text-emerald-500 bg-emerald-500/10'
                        : s === 3
                          ? 'border-amber-400 text-amber-400 bg-amber-400/10'
                          : 'border-red-500 text-red-500 bg-red-500/10'
                      : 'border-border text-muted-foreground hover:border-muted-foreground/40',
                  )}
                >
                  {t(STRESS_LABEL_KEYS[s])}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <Label className="text-[11px] text-muted-foreground tracking-wide uppercase mb-1.5 block">
              {t('sleep.noteOptional')}
            </Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('sleep.notePlaceholder')}
              className="resize-none h-20 text-sm"
              maxLength={500}
            />
          </div>
        </div>
      )}

      {/* ── Actions ───────────────────────────────────────────────────── */}
      <div className="flex gap-3 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1 h-11 tracking-wide">
            {t('common.cancel').toUpperCase()}
          </Button>
        )}
        <Button
          type="submit"
          disabled={!isValid}
          className={cn(
            'flex-1 h-11 font-bebas text-lg tracking-wide',
            'bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40',
          )}
        >
          {t('common.save').toUpperCase()}
        </Button>
      </div>
    </form>
  )
}
