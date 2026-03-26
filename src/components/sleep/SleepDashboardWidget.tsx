import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '../ui/card'
import { cn } from '../../lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

export interface SleepLastEntry {
  date: string
  duration_minutes: number
  quality: number
  bedtime: string
  wake_time: string
}

interface SleepDashboardWidgetProps {
  lastEntry: SleepLastEntry | null
  onRegister: () => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

const QUALITY_LABEL_KEYS = ['', 'sleep.quality.1', 'sleep.quality.2', 'sleep.quality.3', 'sleep.quality.4', 'sleep.quality.5']

function qualityAccent(q: number): string {
  if (q <= 2) return 'text-red-500'
  if (q === 3) return 'text-amber-400'
  return 'text-emerald-500'
}

function qualityBorder(q: number): string {
  if (q <= 2) return 'border-l-red-500'
  if (q === 3) return 'border-l-amber-400'
  return 'border-l-indigo-500'
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SleepDashboardWidget({ lastEntry, onRegister }: SleepDashboardWidgetProps) {
  const { t } = useTranslation()
  // No entry — show CTA
  if (!lastEntry) {
    return (
      <button onClick={onRegister} className="text-left w-full">
        <Card className="border-l-[3px] border-l-indigo-500 hover:border-indigo-500/50 transition-colors">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="size-14 rounded-full bg-indigo-500/10 flex items-center justify-center shrink-0">
                <svg className="size-7 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-1">{t('sleep.title')}</div>
                <div className="text-sm text-indigo-400 font-medium">{t('sleep.howDidYouSleep')}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{t('sleep.tapToRegister')}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </button>
    )
  }

  // Has entry — show summary
  return (
    <button onClick={onRegister} className="text-left w-full">
      <Card className={cn('border-l-[3px] hover:border-indigo-500/50 transition-colors', qualityBorder(lastEntry.quality))}>
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <div className="relative size-14 shrink-0">
              <svg width="56" height="56" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="22" fill="none" stroke="currentColor" className="text-muted" strokeWidth="5" />
                <circle
                  cx="28" cy="28" r="22"
                  fill="none" stroke="currentColor"
                  className={cn(
                    lastEntry.quality >= 4 ? 'text-emerald-500'
                    : lastEntry.quality === 3 ? 'text-amber-400'
                    : 'text-red-500'
                  )}
                  strokeWidth="5" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 22}
                  strokeDashoffset={2 * Math.PI * 22 * (1 - Math.min(lastEntry.duration_minutes / 480, 1))}
                  transform="rotate(-90 28 28)"
                  style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="size-5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
                </svg>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-1">{t('sleep.title')}</div>
              <div className="text-sm">
                <span className="text-foreground font-medium">{formatDuration(lastEntry.duration_minutes)}</span>
                <span className="text-muted-foreground"> · </span>
                <span className={qualityAccent(lastEntry.quality)}>{t(QUALITY_LABEL_KEYS[lastEntry.quality])}</span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {lastEntry.bedtime} — {lastEntry.wake_time}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </button>
  )
}
