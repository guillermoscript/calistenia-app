import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../lib/i18n'
import { daysAgoStr } from '../lib/dateUtils'
import { useSleep, type SleepEntryInput } from '../hooks/useSleep'
import SleepForm, { type SleepFormData } from '../components/sleep/SleepForm'
import SleepWeekChart from '../components/sleep/SleepWeekChart'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import { cn } from '../lib/utils'
import { Loader } from '../components/ui/loader'
import type { SleepEntry } from '../types'


// ── Quality helpers ─────────────────────────────────────────────────────────
const QUALITY_COLORS: Record<number, string> = {
  1: 'text-red-500',
  2: 'text-orange-400',
  3: 'text-amber-400',
  4: 'text-emerald-400',
  5: 'text-emerald-500',
}
const QUALITY_BG: Record<number, string> = {
  1: 'bg-red-500/10 border-red-500/30',
  2: 'bg-orange-400/10 border-orange-400/30',
  3: 'bg-amber-400/10 border-amber-400/30',
  4: 'bg-emerald-400/10 border-emerald-400/30',
  5: 'bg-emerald-500/10 border-emerald-500/30',
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

function formatQualityStars(quality: number): string {
  return '\u2605'.repeat(quality) + '\u2606'.repeat(5 - quality)
}


// ── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="text-center p-3 bg-card border border-border rounded-lg">
      <div className={cn('font-bebas text-2xl leading-none mb-1', accent || 'text-foreground')}>{value}</div>
      <div className="text-[10px] text-muted-foreground tracking-wide uppercase">{label}</div>
    </div>
  )
}


// ── Sleep Entry Row ─────────────────────────────────────────────────────────

interface SleepEntryRowProps {
  entry: SleepEntry
  onEdit: (entry: SleepEntry) => void
  onDelete: (id: string) => void
}

function SleepEntryRow({ entry, onEdit, onDelete }: SleepEntryRowProps) {
  const { t } = useTranslation()
  const [showConfirm, setShowConfirm] = useState(false)

  const dateLabel = useMemo(() => {
    const d = new Date(entry.date + 'T12:00:00')
    return d.toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })
  }, [entry.date])

  return (
    <div
      className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg hover:border-indigo-400/30 transition-colors cursor-pointer group"
      onClick={() => onEdit(entry)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onEdit(entry) }}
    >
      {/* Quality indicator */}
      <div className={cn(
        'size-10 rounded-lg flex items-center justify-center border shrink-0',
        QUALITY_BG[entry.quality] || QUALITY_BG[3],
      )}>
        <span className={cn('font-bebas text-lg', QUALITY_COLORS[entry.quality] || 'text-foreground')}>
          {entry.quality}
        </span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground capitalize">{dateLabel}</div>
        <div className="text-[11px] text-muted-foreground">
          {entry.bedtime} - {entry.wake_time} · {formatDuration(entry.duration_minutes)} · {entry.awakenings} {t('sleep.awakenings')}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); setShowConfirm(true) }}
          className="size-8 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors rounded-md"
          aria-label={t('common.delete')}
        >
          <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M10 7v5M3 4l1 10a1 1 0 001 1h6a1 1 0 001-1l1-10" />
          </svg>
        </button>
      </div>

      {/* Delete confirmation dialog */}
      {showConfirm && (
        <Dialog open onOpenChange={() => setShowConfirm(false)}>
          <DialogContent className="max-w-sm" onClick={(e) => e.stopPropagation()}>
            <DialogHeader>
              <DialogTitle>{t('sleep.deleteEntry')}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mb-4">
              {t('sleep.deleteConfirm', { date: dateLabel })}
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setShowConfirm(false) }}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onDelete(entry.id); setShowConfirm(false) }}
              >
                {t('common.delete')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}


// ── Main Sleep Page ─────────────────────────────────────────────────────────

interface SleepPageProps {
  userId: string
}

export default function SleepPage({ userId }: SleepPageProps) {
  const { t } = useTranslation()
  const {
    entries,
    isReady,
    weeklyStats,
    saveSleepEntry,
    updateSleepEntry,
    deleteSleepEntry,
  } = useSleep(userId)

  const [formOpen, setFormOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<SleepEntry | null>(null)

  // Last night's date = yesterday
  const lastNightDate = useMemo(() => {
    return daysAgoStr(1)
  }, [])

  const todayEntry = useMemo(() => {
    return entries.find(e => e.date === lastNightDate) || null
  }, [entries, lastNightDate])

  const handleOpenCreate = () => {
    setEditingEntry(null)
    setFormOpen(true)
  }

  const handleOpenEdit = (entry: SleepEntry) => {
    setEditingEntry(entry)
    setFormOpen(true)
  }

  const handleSave = async (formData: SleepFormData) => {
    const date = editingEntry?.date || lastNightDate
    const input: SleepEntryInput = {
      date,
      bedtime: formData.bedtime,
      wake_time: formData.wake_time,
      awakenings: formData.awakenings,
      quality: formData.quality,
      caffeine: formData.caffeine,
      screen_before_bed: formData.screen_before_bed,
      stress_level: formData.stress_level,
      note: formData.note,
    }
    if (editingEntry) {
      await updateSleepEntry(editingEntry.id, input)
    } else {
      await saveSleepEntry(input)
    }
    setFormOpen(false)
    setEditingEntry(null)
  }

  const handleDelete = async (id: string) => {
    await deleteSleepEntry(id)
  }

  if (!isReady) {
    return <Loader label={t('sleep.loadingData')} />
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-bebas text-4xl md:text-5xl leading-none mb-1">{t('sleep.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('sleep.subtitle')}</p>
      </div>

      {/* ═══ TODAY SUMMARY ══════════════════════════════════════════════════ */}
      {todayEntry ? (
        <Card
          className={cn(
            'mb-6 border-l-[3px] cursor-pointer hover:border-indigo-400/40 transition-colors',
            todayEntry.quality >= 4
              ? 'border-l-emerald-500'
              : todayEntry.quality >= 3
                ? 'border-l-amber-400'
                : 'border-l-red-500',
          )}
          onClick={() => handleOpenEdit(todayEntry)}
        >
          <CardContent className="p-4 md:p-5">
            <div className="text-[10px] text-muted-foreground tracking-[3px] uppercase mb-2">{t('sleep.lastNight')}</div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-bebas text-2xl leading-none mb-1">
                  {formatDuration(todayEntry.duration_minutes)}
                </div>
                <div className="text-sm text-muted-foreground">
                  {todayEntry.bedtime} - {todayEntry.wake_time}
                  {todayEntry.awakenings > 0 && ` · ${todayEntry.awakenings} ${t('sleep.awakenings')}`}
                </div>
              </div>
              <div className="text-right">
                <div className={cn('text-lg', QUALITY_COLORS[todayEntry.quality])}>
                  {formatQualityStars(todayEntry.quality)}
                </div>
                <div className={cn('text-xs', QUALITY_COLORS[todayEntry.quality])}>
                  {t(`sleep.quality.${todayEntry.quality}`)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <button
          onClick={handleOpenCreate}
          className={cn(
            'w-full mb-6 p-5 rounded-xl border-2 border-dashed border-indigo-400/30',
            'bg-indigo-400/5 hover:border-indigo-400/50 hover:bg-indigo-400/10',
            'transition-all active:scale-[0.99] text-left',
          )}
        >
          <div className="flex items-center gap-4">
            <div className="size-12 rounded-full bg-indigo-400/10 flex items-center justify-center shrink-0">
              <svg className="size-6 text-indigo-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M13.5 10A6 6 0 0 1 6 2.5a6 6 0 1 0 7.5 7.5z" />
              </svg>
            </div>
            <div>
              <div className="font-bebas text-xl text-indigo-400 leading-none mb-0.5">{t('sleep.register')}</div>
              <div className="text-xs text-muted-foreground">{t('sleep.howSleptLastNight')}</div>
            </div>
          </div>
        </button>
      )}

      {/* ═══ WEEKLY CHART ═══════════════════════════════════════════════════ */}
      {entries.length > 0 && (
        <div className="mb-6">
          <div className="text-[10px] text-muted-foreground tracking-[3px] uppercase mb-3">{t('sleep.lastWeek')}</div>
          <Card>
            <CardContent className="p-4">
              <SleepWeekChart entries={entries} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══ STATS ══════════════════════════════════════════════════════════ */}
      {weeklyStats.entryCount > 0 && (
        <div className="mb-6">
          <div className="text-[10px] text-muted-foreground tracking-[3px] uppercase mb-3">{t('sleep.stats7days')}</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label={t('sleep.avgDuration')}
              value={formatDuration(Math.round(weeklyStats.avgDuration))}
              accent="text-indigo-400"
            />
            <StatCard
              label={t('sleep.avgQuality')}
              value={`${weeklyStats.avgQuality.toFixed(1)} / 5`}
              accent={weeklyStats.avgQuality >= 3 ? 'text-emerald-400' : 'text-amber-400'}
            />
            <StatCard
              label={t('sleep.avgAwakenings')}
              value={weeklyStats.avgAwakenings.toFixed(1)}
              accent={weeklyStats.avgAwakenings <= 1 ? 'text-emerald-400' : 'text-amber-400'}
            />
            <StatCard
              label={t('sleep.scheduleRegularity')}
              value={`±${Math.round(weeklyStats.scheduleRegularity)} min`}
              accent={weeklyStats.scheduleRegularity <= 30 ? 'text-emerald-400' : 'text-amber-400'}
            />
          </div>
        </div>
      )}

      {/* ═══ HISTORY ════════════════════════════════════════════════════════ */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] text-muted-foreground tracking-[3px] uppercase">{t('sleep.historyLabel')}</div>
          <Button
            size="sm"
            onClick={handleOpenCreate}
            className="h-8 px-3 text-xs font-bebas tracking-wide"
          >
            {t('sleep.addEntry')}
          </Button>
        </div>

        {entries.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <div className="text-3xl mb-3">😴</div>
              <div className="text-sm text-muted-foreground mb-1">{t('sleep.noEntries')}</div>
              <div className="text-xs text-muted-foreground">{t('sleep.startTracking')}</div>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto pr-1">
            {entries.map(entry => (
              <SleepEntryRow
                key={entry.id}
                entry={entry}
                onEdit={handleOpenEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* ═══ SLEEP FORM DIALOG ══════════════════════════════════════════════ */}
      <Dialog open={formOpen} onOpenChange={(open) => {
        if (!open) {
          setFormOpen(false)
          setEditingEntry(null)
        }
      }}>
        <DialogContent className="max-w-md max-sm:max-w-[95vw]">
          <DialogHeader>
            <DialogTitle className="font-bebas text-2xl">
              {editingEntry ? t('sleep.editEntry') : t('sleep.register')}
            </DialogTitle>
          </DialogHeader>
          <SleepForm
            initialValues={editingEntry ? {
              bedtime: editingEntry.bedtime,
              wake_time: editingEntry.wake_time,
              awakenings: editingEntry.awakenings,
              quality: editingEntry.quality,
              duration_minutes: editingEntry.duration_minutes,
              caffeine: editingEntry.caffeine,
              screen_before_bed: editingEntry.screen_before_bed,
              stress_level: editingEntry.stress_level,
              note: editingEntry.note,
            } : undefined}
            onSubmit={handleSave}
            onCancel={() => { setFormOpen(false); setEditingEntry(null) }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
