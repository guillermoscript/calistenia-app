import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkDay } from '../hooks/useWorkDay'
import Timer from '../components/Timer'
import YoutubeModal from '../components/YoutubeModal'
import LumbarCheckModal from '../components/LumbarCheckModal'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { cn } from '../lib/utils'
import { todayStr } from '../lib/dateUtils'
import type { Protocol, ProtocolExercise, Pause } from '../types'
import { RecordModel } from 'pocketbase'

// ─── Training protocols ───────────────────────────────────────────────────────
function getProtocols(t: (key: string) => string): Protocol[] {
  return [
    {
      id: 'emergency', name: t('lumbar.emergency.name'),
      desc: t('lumbar.emergency.desc'),
      accent: 'text-red-500', border: 'border-red-500', badge: 'border-red-500/40 text-red-500 bg-red-500/5',
      dot: 'bg-red-500', duration: '15-20 min',
      exercises: [
        { name: 'Knees to Chest', time: 120, reps: t('lumbar.emergency.ex0.reps'), note: t('lumbar.emergency.ex0.note'), youtube: 'knees to chest stretch lower back pain relief', isTimer: true },
        { name: 'Pigeon Pose bilateral', time: 90, reps: t('lumbar.emergency.ex1.reps'), note: t('lumbar.emergency.ex1.note'), youtube: 'pigeon pose piriformis stretch relief', isTimer: true },
        { name: t('lumbar.emergency.ex2.name'), time: 180, reps: t('lumbar.emergency.ex2.reps'), note: t('lumbar.emergency.ex2.note'), youtube: 'child pose extended arms spine decompression', isTimer: true },
        { name: t('lumbar.emergency.ex3.name'), time: null, reps: t('lumbar.emergency.ex3.reps'), note: t('lumbar.emergency.ex3.note'), youtube: 'cat cow yoga spine mobility relief' },
        { name: t('lumbar.emergency.ex4.name'), time: 120, reps: t('lumbar.emergency.ex4.reps'), note: t('lumbar.emergency.ex4.note'), youtube: 'deep hip flexor stretch psoas pain relief', isTimer: true },
      ]
    },
    {
      id: 'morning', name: t('lumbar.morning.name'),
      desc: t('lumbar.morning.desc'),
      accent: 'text-amber-400', border: 'border-amber-400', badge: 'border-amber-400/40 text-amber-400 bg-amber-400/5',
      dot: 'bg-amber-400', duration: '10 min',
      exercises: [
        { name: t('lumbar.morning.ex0.name'), time: null, reps: t('lumbar.morning.ex0.reps'), note: t('lumbar.morning.ex0.note'), youtube: 'morning cat cow yoga spine warm up' },
        { name: 'Hip Flexor Stretch', time: 60, reps: t('lumbar.morning.ex1.reps'), note: t('lumbar.morning.ex1.note'), youtube: 'morning hip flexor stretch psoas', isTimer: true },
        { name: t('lumbar.morning.ex2.name'), time: null, reps: '3 × 15', note: t('lumbar.morning.ex2.note'), youtube: 'morning glute activation bridge' },
        { name: "World's Greatest Stretch", time: null, reps: t('lumbar.morning.ex3.reps'), note: t('lumbar.morning.ex3.note'), youtube: "world's greatest stretch morning routine" },
        { name: 'Thoracic Rotation', time: null, reps: t('lumbar.morning.ex4.reps'), note: t('lumbar.morning.ex4.note'), youtube: 'thoracic rotation stretch morning' },
      ]
    },
    {
      id: 'pausa25', name: t('lumbar.pausa25.name'),
      desc: t('lumbar.pausa25.desc'),
      accent: 'text-sky-500', border: 'border-sky-500', badge: 'border-sky-500/40 text-sky-500 bg-sky-500/5',
      dot: 'bg-sky-500', duration: '2-3 min',
      exercises: [
        { name: t('lumbar.pausa25.ex0.name'), time: 30, reps: '30s', note: t('lumbar.pausa25.ex0.note'), youtube: 'standing desk break programmer exercises', isTimer: true },
        { name: t('lumbar.pausa25.ex1.name'), time: 40, reps: t('lumbar.pausa25.ex1.reps'), note: t('lumbar.pausa25.ex1.note'), youtube: 'standing hip flexor stretch desk break', isTimer: true },
        { name: t('lumbar.pausa25.ex2.name'), time: null, reps: t('lumbar.pausa25.ex2.reps'), note: t('lumbar.pausa25.ex2.note'), youtube: 'standing thoracic rotation desk stretch' },
      ]
    },
    {
      id: 'pausa60', name: t('lumbar.pausa60.name'),
      desc: t('lumbar.pausa60.desc'),
      accent: 'text-lime', border: 'border-lime', badge: 'border-lime/40 text-lime bg-lime/5',
      dot: 'bg-lime', duration: '5 min',
      exercises: [
        { name: 'Glute Bridge', time: null, reps: '10 reps', note: t('lumbar.pausa60.ex0.note'), youtube: 'hourly glute bridge desk worker' },
        { name: 'Cat-Cow', time: null, reps: t('lumbar.pausa60.ex1.reps'), note: t('lumbar.pausa60.ex1.note'), youtube: 'cat cow desk break office worker' },
        { name: t('lumbar.pausa60.ex2.name'), time: null, reps: t('lumbar.pausa60.ex2.reps'), note: t('lumbar.pausa60.ex2.note'), youtube: 'thoracic rotation supine tutorial' },
        { name: 'Neck stretches', time: 30, reps: t('lumbar.pausa60.ex3.reps'), note: t('lumbar.pausa60.ex3.note'), youtube: 'neck stretch programmer tension relief', isTimer: true },
        { name: 'Shoulder rolls + retraction', time: null, reps: '10 + 10', note: t('lumbar.pausa60.ex4.note'), youtube: 'shoulder rolls retraction posture fix programmer' },
      ]
    },
  ]
}

function fmtTimeShort(sec: number | null): string {
  if (!sec || sec < 0) return '--:--'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function fmtTimeOfDay(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

// ─── WorkDayClock ─────────────────────────────────────────────────────────────
function WorkDayClock() {
  const { t } = useTranslation()
  const { workStart, workEnd, pauses, elapsed, next25, next60,
    isClockedIn, isClockedOut, checkIn, checkOut, formatTime } = useWorkDay()

  const pauseCount25 = pauses.filter((p: Pause) => p.type === '25').length
  const pauseCount60 = pauses.filter((p: Pause) => p.type === '60').length
  const totalPauses  = pauses.length

  return (
    <div className={cn(
      'mb-8 p-6 bg-card rounded-xl relative overflow-hidden border transition-colors',
      isClockedIn ? 'border-lime/25' : 'border-border'
    )}>
      {isClockedIn && (
        <div className="absolute top-5 right-5 size-2 rounded-full bg-lime animate-workday-pulse" />
      )}

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="text-[10px] text-muted-foreground tracking-[3px] mb-1.5 uppercase">{t('lumbar.workday')}</div>
          <div className={cn(
            'font-bebas text-[56px] leading-none tracking-[2px] mb-1',
            isClockedIn ? 'text-lime' : isClockedOut ? 'text-emerald-500' : 'text-muted-foreground/30'
          )}>
            {formatTime(elapsed)}
          </div>
          <div className="text-[11px] text-muted-foreground/60 flex gap-4 font-mono">
            {workStart && <span>{t('lumbar.clockIn')} <span className="text-muted-foreground">{fmtTimeOfDay(workStart)}</span></span>}
            {workEnd   && <span>{t('lumbar.clockOut')} <span className="text-emerald-500">{fmtTimeOfDay(workEnd)}</span></span>}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2.5">
          {isClockedIn && (
            <div className="flex gap-2.5 flex-wrap justify-end">
              <CountdownPill label={t('lumbar.next2min')} seconds={next25} accentClass="text-sky-500" urgentBg="bg-sky-500/10" urgentBorder="border-sky-500/30" />
              <CountdownPill label={t('lumbar.next5min')} seconds={next60} accentClass="text-lime" urgentBg="bg-lime/10" urgentBorder="border-lime/30" />
            </div>
          )}
          {!workStart && (
            <Button
              onClick={checkIn}
              className="bg-lime text-lime-foreground hover:bg-lime/90 font-bebas text-lg tracking-wide"
            >
              {t('lumbar.startWorkday')}
            </Button>
          )}
          {isClockedIn && (
            <Button
              variant="outline"
              onClick={checkOut}
              className="border-red-500/30 text-red-500 bg-red-500/10 hover:bg-red-500/20 hover:text-red-400 font-bebas text-lg tracking-wide"
            >
              {t('lumbar.endWorkday')}
            </Button>
          )}
          {isClockedOut && (
            <div className="text-[11px] text-emerald-500 font-mono px-3.5 py-2 border border-emerald-500/20 rounded-md">
              {t('lumbar.workdayComplete')}
            </div>
          )}
        </div>
      </div>

      {totalPauses > 0 && (
        <div className="mt-5 pt-4 border-t border-border">
          <div className="flex items-center gap-4 mb-2.5">
            <div className="text-[10px] text-muted-foreground tracking-[2px] uppercase">{t('lumbar.pausesToday')}</div>
            <span className="font-mono text-[11px] text-sky-500"><span className="font-bebas text-base">{pauseCount25}</span> × 2min</span>
            <span className="font-mono text-[11px] text-lime"><span className="font-bebas text-base">{pauseCount60}</span> × 5min</span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {pauses.map((p: Pause, i: number) => (
              <span key={i} className={cn(
                'font-mono text-[10px] px-2 py-0.5 rounded border',
                p.type === '60'
                  ? 'bg-lime/8 text-lime border-lime/15'
                  : 'bg-sky-500/8 text-sky-500 border-sky-500/15'
              )}>
                {fmtTimeOfDay(p.at)} {p.type === '60' ? '5min' : '2min'}
              </span>
            ))}
          </div>
        </div>
      )}

      {!workStart && (
        <div className="mt-3 text-[12px] text-muted-foreground/60 font-mono">
          {t('lumbar.notificationHint')}
        </div>
      )}
    </div>
  )
}

interface CountdownPillProps {
  label: string
  seconds: number | null
  accentClass: string
  urgentBg: string
  urgentBorder: string
}

function CountdownPill({ label, seconds, accentClass, urgentBg, urgentBorder }: CountdownPillProps) {
  if (seconds == null) return null
  const isUrgent = seconds < 120
  return (
    <div className={cn(
      'flex flex-col items-center px-3.5 py-2 rounded-lg border transition-all duration-300',
      isUrgent ? cn(urgentBg, urgentBorder) : 'bg-transparent border-border'
    )}>
      <div className={cn('font-mono text-lg leading-none tracking-wide', isUrgent ? accentClass : 'text-muted-foreground/40')}>
        {fmtTimeShort(seconds)}
      </div>
      <div className="text-[9px] text-muted-foreground/40 tracking-[1.5px] mt-0.5 font-mono uppercase">
        {label}
      </div>
    </div>
  )
}

// ─── Root LumbarPage ──────────────────────────────────────────────────────────

interface LumbarPageProps {
  user: RecordModel
}

export default function LumbarPage({ user }: LumbarPageProps) {
  const { t } = useTranslation()
  const [activeProtocol, setActiveProtocol] = useState<string | null>(null)
  const [youtubeQuery, setYoutubeQuery]     = useState<string | null>(null)
  const [showLumbarCheck, setShowLumbarCheck] = useState(() => {
    const lastCheck = localStorage.getItem('calistenia_lumbar_check_date')
    return lastCheck !== todayStr()
  })

  const handleLumbarCheckDone = useCallback(() => {
    const today = todayStr()
    localStorage.setItem('calistenia_lumbar_check_date', today)
    setShowLumbarCheck(false)
  }, [])

  const handleLumbarCheckSkip = useCallback(() => {
    setShowLumbarCheck(false)
  }, [])

  return (
    <div className="max-w-[860px] mx-auto px-4 py-6 md:px-6 md:py-8">
      <div className="text-[10px] text-muted-foreground tracking-[3px] mb-2 uppercase">{t('lumbar.section')}</div>
      <div className="font-bebas text-[36px] md:text-[52px] leading-none mb-2">{t('lumbar.title')}</div>
      <p className="text-muted-foreground text-sm leading-relaxed mb-8 max-w-[600px]">
        {t('lumbar.subtitle')}
      </p>

      <WorkDayClock />

      {/* Root Causes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-8">
        {[
          { title: t('lumbar.cause1.title'), desc: t('lumbar.cause1.desc'), fix: t('lumbar.cause1.fix') },
          { title: t('lumbar.cause2.title'), desc: t('lumbar.cause2.desc'), fix: t('lumbar.cause2.fix') },
          { title: t('lumbar.cause3.title'), desc: t('lumbar.cause3.desc'), fix: t('lumbar.cause3.fix') },
        ].map(c => (
          <div key={c.title} className="p-4 bg-card border border-red-500/20 rounded-lg">
            <div className="size-2 rounded-full bg-red-500 mb-2.5" />
            <div className="font-semibold text-sm mb-1.5">{c.title}</div>
            <div className="text-[12px] text-muted-foreground leading-relaxed mb-2">{c.desc}</div>
            <div className="text-[10px] text-sky-600 dark:text-sky-400 font-mono tracking-wide">{t('lumbar.fixLabel')}: {c.fix}</div>
          </div>
        ))}
      </div>

      {/* Protocol Selector */}
      <div className="flex flex-col gap-2.5">
        {getProtocols(t).map(p => (
          <div key={p.id}>
            <button
              onClick={() => setActiveProtocol(activeProtocol === p.id ? null : p.id)}
              className={cn(
                'w-full px-5 py-4 rounded-xl border text-left flex justify-between items-center transition-all duration-200 cursor-pointer bg-card',
                activeProtocol === p.id ? cn('border-current', p.border) : 'border-border'
              )}
            >
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <div className={cn('size-2.5 rounded-full', p.dot)} />
                  <span className="font-semibold text-[15px]">{p.name}</span>
                  <Badge variant="outline" className={cn('text-[10px]', p.badge)}>{p.duration}</Badge>
                </div>
                <div className="text-[13px] text-muted-foreground pl-[22px]">{p.desc}</div>
              </div>
              <span className={cn(
                'text-muted-foreground text-lg transition-transform duration-200',
                activeProtocol === p.id ? 'rotate-180' : 'rotate-0'
              )}>▾</span>
            </button>

            {activeProtocol === p.id && (
              <div className={cn('mt-2 p-5 bg-card rounded-xl flex flex-col gap-3.5 border', `border-current`, p.border, 'border-opacity-20')}>
                {p.exercises.map((ex: ProtocolExercise, i: number) => (
                  <div key={i} className="px-4 py-3.5 bg-background rounded-lg border border-border">
                    <div className="flex justify-between items-start gap-3 flex-wrap">
                      <div className="flex-1">
                        <div className="flex items-center gap-2.5 mb-1.5">
                          <span className="text-[10px] text-muted-foreground/60 font-mono tracking-wide">{String(i + 1).padStart(2, '0')}</span>
                          <span className="font-semibold text-sm">{ex.name}</span>
                          <span className={cn('text-[11px] font-mono', p.accent)}>{ex.reps}</span>
                        </div>
                        <div className="text-[12px] text-muted-foreground leading-relaxed mb-2.5">{ex.note}</div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setYoutubeQuery(ex.youtube)}
                          className="h-7 px-3 text-[10px] border-red-500/20 bg-red-500/5 text-red-500 hover:bg-red-500/10 hover:text-red-400 tracking-wide"
                        >
                          {t('lumbar.tutorial')}
                        </Button>
                      </div>
                      {ex.isTimer && ex.time && (
                        <div className="flex-shrink-0">
                          <Timer initialSeconds={ex.time} label={ex.name.split(' ')[0]} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {youtubeQuery && <YoutubeModal query={youtubeQuery} onClose={() => setYoutubeQuery(null)} />}
      {showLumbarCheck && (
        <LumbarCheckModal
          user={user}
          onDone={handleLumbarCheckDone}
          onSkip={handleLumbarCheckSkip}
        />
      )}
    </div>
  )
}
