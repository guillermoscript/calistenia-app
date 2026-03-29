/**
 * SleepLumbarSection — Shows sleep data integrated into the Lumbar page:
 * 1. Last night's sleep summary
 * 2. Quick-log form if no entry exists
 * 3. Sleep-lumbar correlation chart (7 days)
 * 4. Weekly sleep mini-chart (reuses SleepWeekChart)
 */
import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { daysAgoStr, todayStr, toLocalDateStr } from '../../lib/dateUtils'
import { useSleep, calculateDurationMinutes } from '../../hooks/useSleep'
import type { SleepEntry, LumbarCheck } from '../../types'
import type { SleepEntryInput } from '../../hooks/useSleep'
import SleepWeekChart from '../sleep/SleepWeekChart'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Card, CardContent } from '../ui/card'

// ── Helpers ────────────────────────────────────────────────────────────────

const LS_LUMBAR_KEY = 'calistenia_lumbar_checks'

function loadLumbarChecks(): LumbarCheck[] {
  try { return JSON.parse(localStorage.getItem(LS_LUMBAR_KEY) || '[]') } catch { return [] }
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) return '--'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function qualityStars(q: number): string {
  return '\u2605'.repeat(q) + '\u2606'.repeat(5 - q)
}

function qualityColor(q: number): string {
  if (q <= 2) return 'text-red-500'
  if (q === 3) return 'text-amber-400'
  return 'text-emerald-400'
}

const QUALITY_COLORS_CSS = [
  '',
  'text-red-500 border-red-500 bg-red-500/10',
  'text-orange-400 border-orange-400 bg-orange-400/10',
  'text-amber-400 border-amber-400 bg-amber-400/10',
  'text-lime border-lime bg-lime/10',
  'text-emerald-500 border-emerald-500 bg-emerald-500/10',
]

// ── Quick Log Form ─────────────────────────────────────────────────────────

interface QuickLogFormProps {
  onSave: (input: SleepEntryInput) => Promise<void>
}

function QuickLogForm({ onSave }: QuickLogFormProps) {
  const { t } = useTranslation()
  const [bedtime, setBedtime] = useState('23:00')
  const [wakeTime, setWakeTime] = useState('07:00')
  const [quality, setQuality] = useState(0)
  const [saving, setSaving] = useState(false)

  const duration = useMemo(() => {
    if (!bedtime || !wakeTime) return 0
    return calculateDurationMinutes(bedtime, wakeTime)
  }, [bedtime, wakeTime])

  const isValid = bedtime !== '' && wakeTime !== '' && quality >= 1

  const handleSubmit = useCallback(async () => {
    if (!isValid) return
    setSaving(true)
    const yesterday = daysAgoStr(1)
    await onSave({
      date: yesterday,
      bedtime,
      wake_time: wakeTime,
      awakenings: 0,
      quality,
    })
    setSaving(false)
  }, [isValid, bedtime, wakeTime, quality, onSave])

  return (
    <div className="p-4 bg-card border border-indigo-500/20 rounded-xl">
      <div className="text-[11px] text-muted-foreground tracking-[2px] uppercase mb-3">
        {t('lumbar.sleep.quickLog')}
      </div>

      {/* Duration preview */}
      <div className="text-center mb-3">
        <span className={cn(
          'font-bebas text-2xl',
          duration >= 420 ? 'text-lime' : duration >= 360 ? 'text-amber-400' : duration > 0 ? 'text-red-500' : 'text-muted-foreground',
        )}>
          {formatDuration(duration)}
        </span>
      </div>

      {/* Time inputs */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <div className="text-[10px] text-muted-foreground tracking-wide uppercase mb-1">{t('lumbar.sleep.bedtime')}</div>
          <Input
            type="time"
            value={bedtime}
            onChange={(e) => setBedtime(e.target.value)}
            className="h-9 text-center text-sm tabular-nums"
          />
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground tracking-wide uppercase mb-1">{t('lumbar.sleep.wakeTime')}</div>
          <Input
            type="time"
            value={wakeTime}
            onChange={(e) => setWakeTime(e.target.value)}
            className="h-9 text-center text-sm tabular-nums"
          />
        </div>
      </div>

      {/* Quality selector */}
      <div className="mb-3">
        <div className="text-[10px] text-muted-foreground tracking-wide uppercase mb-1.5">{t('lumbar.sleep.quality')}</div>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setQuality(q)}
              className={cn(
                'flex-1 h-9 rounded-lg border transition-all flex items-center justify-center cursor-pointer',
                quality === q
                  ? QUALITY_COLORS_CSS[q]
                  : 'border-border text-muted-foreground hover:border-muted-foreground/40',
              )}
            >
              <div className="flex">
                {Array.from({ length: q }).map((_, i) => (
                  <svg key={i} className="size-3" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>

      <Button
        onClick={handleSubmit}
        disabled={!isValid || saving}
        className="w-full h-9 font-bebas text-base tracking-wide bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40"
      >
        {saving ? '...' : t('lumbar.sleep.logSleep')}
      </Button>
    </div>
  )
}

// ── Correlation Chart ──────────────────────────────────────────────────────

interface CorrelationChartProps {
  sleepEntries: SleepEntry[]
  lumbarChecks: LumbarCheck[]
}

function SleepPainCorrelation({ sleepEntries, lumbarChecks }: CorrelationChartProps) {
  const { t } = useTranslation()

  const data = useMemo(() => {
    const today = new Date()
    const days: { date: string; dayLabel: string; sleepQ: number | null; painScore: number | null }[] = []

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const dateStr = toLocalDateStr(d)
      const dayName = d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2).toUpperCase()

      // Sleep quality for the previous night (entry date = day before)
      const prevDate = new Date(d)
      prevDate.setDate(prevDate.getDate() - 1)
      const sleepDateStr = toLocalDateStr(prevDate)
      const sleepEntry = sleepEntries.find(e => e.date === sleepDateStr)

      // Lumbar pain score for this day
      const lumbarCheck = lumbarChecks.find(c => c.date === dateStr)

      days.push({
        date: dateStr,
        dayLabel: dayName,
        sleepQ: sleepEntry?.quality ?? null,
        painScore: lumbarCheck?.lumbar_score ?? null,
      })
    }
    return days
  }, [sleepEntries, lumbarChecks])

  const hasData = data.some(d => d.sleepQ !== null || d.painScore !== null)

  if (!hasData) {
    return (
      <Card>
        <CardContent className="p-4 text-center">
          <div className="text-[12px] text-muted-foreground/60">{t('lumbar.sleep.noCorrelationData')}</div>
        </CardContent>
      </Card>
    )
  }

  const maxVal = 5

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-6 justify-center mb-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-indigo-500" />
            <span className="text-[10px] text-muted-foreground">{t('lumbar.sleep.sleepQuality')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-red-500" />
            <span className="text-[10px] text-muted-foreground">{t('lumbar.sleep.painScore')}</span>
          </div>
        </div>

        {/* Simple dual-bar chart */}
        <div className="flex items-end gap-1.5 h-[100px]">
          {data.map((d) => (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5">
              <div className="flex gap-[2px] items-end w-full h-[80px]">
                {/* Sleep quality bar */}
                <div className="flex-1 flex flex-col justify-end h-full">
                  {d.sleepQ !== null ? (
                    <div
                      className="bg-indigo-500/70 rounded-t-sm w-full transition-all"
                      style={{ height: `${(d.sleepQ / maxVal) * 100}%` }}
                    />
                  ) : (
                    <div className="bg-muted/30 rounded-t-sm w-full h-[4px]" />
                  )}
                </div>
                {/* Pain score bar */}
                <div className="flex-1 flex flex-col justify-end h-full">
                  {d.painScore !== null ? (
                    <div
                      className="bg-red-500/70 rounded-t-sm w-full transition-all"
                      style={{ height: `${(d.painScore / maxVal) * 100}%` }}
                    />
                  ) : (
                    <div className="bg-muted/30 rounded-t-sm w-full h-[4px]" />
                  )}
                </div>
              </div>
              <span className="text-[9px] text-muted-foreground/60 font-mono">{d.dayLabel}</span>
            </div>
          ))}
        </div>

        <div className="text-[10px] text-muted-foreground/50 text-center mt-2">
          {t('lumbar.sleep.correlationHint')}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Main Section ───────────────────────────────────────────────────────────

interface SleepLumbarSectionProps {
  userId: string | null
}

export default function SleepLumbarSection({ userId }: SleepLumbarSectionProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { entries, isReady, saveSleepEntry } = useSleep(userId)

  const yesterday = daysAgoStr(1)
  const lastNightEntry = useMemo(
    () => entries.find(e => e.date === yesterday),
    [entries, yesterday],
  )

  const lumbarChecks = useMemo(() => loadLumbarChecks(), [])

  if (!isReady) return null

  return (
    <div className="mb-8">
      <div className="text-[10px] text-muted-foreground tracking-[3px] mb-2 uppercase">
        {t('lumbar.sleep.section')}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left column: Last night + quick log */}
        <div className="flex flex-col gap-4">
          {lastNightEntry ? (
            /* Last night's sleep summary */
            <div className="p-4 bg-card border border-indigo-500/20 rounded-xl">
              <div className="flex items-start justify-between mb-3">
                <div className="text-[11px] text-muted-foreground tracking-[2px] uppercase">
                  {t('lumbar.sleep.lastNight')}
                </div>
                <button
                  onClick={() => navigate('/sleep')}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors tracking-wide"
                >
                  {t('lumbar.sleep.goToSleep')}
                </button>
              </div>

              {/* Duration large */}
              <div className="text-center mb-3">
                <div className={cn(
                  'font-bebas text-[40px] leading-none',
                  lastNightEntry.duration_minutes >= 420 ? 'text-lime' :
                  lastNightEntry.duration_minutes >= 360 ? 'text-amber-400' : 'text-red-500',
                )}>
                  {formatDuration(lastNightEntry.duration_minutes)}
                </div>
              </div>

              {/* Quality stars */}
              <div className="text-center mb-3">
                <span className={cn('text-lg tracking-wider', qualityColor(lastNightEntry.quality))}>
                  {qualityStars(lastNightEntry.quality)}
                </span>
              </div>

              {/* Schedule row */}
              <div className="flex justify-center gap-6 text-[12px]">
                <div className="text-center">
                  <div className="text-[9px] text-muted-foreground/60 tracking-wide uppercase mb-0.5">
                    {t('lumbar.sleep.bedtime')}
                  </div>
                  <div className="font-mono text-muted-foreground">{lastNightEntry.bedtime}</div>
                </div>
                <div className="text-muted-foreground/30 self-center">→</div>
                <div className="text-center">
                  <div className="text-[9px] text-muted-foreground/60 tracking-wide uppercase mb-0.5">
                    {t('lumbar.sleep.wakeTime')}
                  </div>
                  <div className="font-mono text-muted-foreground">{lastNightEntry.wake_time}</div>
                </div>
              </div>
            </div>
          ) : (
            /* Quick-log form */
            <QuickLogForm onSave={saveSleepEntry} />
          )}

          {/* Correlation chart */}
          <div>
            <div className="text-[11px] text-muted-foreground tracking-[2px] uppercase mb-2">
              {t('lumbar.sleep.correlation')}
            </div>
            <SleepPainCorrelation
              sleepEntries={entries}
              lumbarChecks={lumbarChecks}
            />
          </div>
        </div>

        {/* Right column: Weekly sleep mini-chart */}
        <div>
          <SleepWeekChart entries={entries} />
        </div>
      </div>
    </div>
  )
}
