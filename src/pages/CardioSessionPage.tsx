import { useState, useEffect } from 'react'
import { useCardioSessionContext } from '../contexts/CardioSessionContext'
import { useCardioStats } from '../hooks/useCardioStats'
import { formatDuration, formatPace, formatSpeed, pointsToGPX } from '../lib/geo'
import { CARDIO_ACTIVITY } from '../lib/style-tokens'
import RouteMap from '../components/cardio/RouteMap'
import CardioHistory from '../components/cardio/CardioHistory'
import SplitsTable from '../components/cardio/SplitsTable'
import CardioStats from '../components/cardio/CardioStats'
import CardioShareCard from '../components/cardio/CardioShareCard'
import ElevationProfile from '../components/cardio/ElevationProfile'
import { Button } from '../components/ui/button'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { cn } from '../lib/utils'
import type { CardioActivityType, CardioSession } from '../types'

const ACTIVITIES: { id: CardioActivityType; label: string; icon: string }[] = [
  { id: 'running', label: CARDIO_ACTIVITY.running.label, icon: CARDIO_ACTIVITY.running.icon },
  { id: 'walking', label: CARDIO_ACTIVITY.walking.label, icon: CARDIO_ACTIVITY.walking.icon },
  { id: 'cycling', label: CARDIO_ACTIVITY.cycling.label, icon: CARDIO_ACTIVITY.cycling.icon },
]

interface CardioSessionPageProps {
  userId: string
}

export default function CardioSessionPage({ userId }: CardioSessionPageProps) {
  const {
    state, activityType, points: pointsRef, pointsCount, distance, duration,
    currentPace, currentSpeed, currentSplit, error, note, setNote, gpsAccuracy,
    start, pause, resume, finish, discard, getHistory, deleteSession,
  } = useCardioSessionContext()

  const { weeklyStats, monthlyStats, records, weeklyTrend, loadStats } = useCardioStats(userId)

  const [selectedActivity, setSelectedActivity] = useState<CardioActivityType>('running')
  const [history, setHistory] = useState<CardioSession[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [savedSession, setSavedSession] = useState<CardioSession | null>(null)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)

  // Load history and stats on mount and when returning to idle (after finishing a session)
  const isIdle = state === 'idle'
  useEffect(() => {
    if (!isIdle && !savedSession) return
    setHistoryLoading(true)
    getHistory(20).then(setHistory).catch(() => {}).finally(() => setHistoryLoading(false))
    loadStats()
  }, [isIdle, getHistory, loadStats]) // eslint-disable-line react-hooks/exhaustive-deps

  const isCycling = (type: CardioActivityType) => type === 'cycling'

  const handleFinish = async () => {
    const session = await finish(note.trim() || undefined)
    setSavedSession(session)
  }

  const handleDiscard = () => {
    discard()
    setSavedSession(null)
  }

  const handleNewSession = () => {
    discard()
    setSavedSession(null)
  }

  const handleDeleteSession = async (id: string) => {
    await deleteSession(id)
    setHistory(prev => prev.filter(s => s.id !== id))
  }

  const handleExportGPX = () => {
    const pts = pointsRef.current
    if (pts.length === 0) return
    const gpx = pointsToGPX(pts, activityType)
    const blob = new Blob([gpx], { type: 'application/gpx+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activityType}-${new Date().toISOString().slice(0, 10)}.gpx`
    a.click()
    URL.revokeObjectURL(url)
  }

  const displaySession = savedSession

  const isTracking = state === 'tracking' || state === 'paused'

  return (
    <div className={cn(
      'max-w-2xl mx-auto pb-24',
      // During tracking: tighter padding, less vertical space — maximize data density
      isTracking ? 'px-4 py-4 md:px-6 md:py-6' : 'px-4 md:px-6 py-8 md:py-12',
    )}>
      {/* Header — hidden during tracking to save screen space */}
      {!isTracking && (
        <div className="mb-8">
          <h1 className="font-bebas text-5xl md:text-7xl leading-none tracking-wide">CARDIO</h1>
          <p className="text-sm text-muted-foreground mt-1 font-mono tracking-wide">
            Seguimiento GPS
          </p>
        </div>
      )}

      {error && (
        <div className={cn('p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400', isTracking ? 'mb-3' : 'mb-4')}>
          {error}
        </div>
      )}

      {/* Pre-session view */}
      {state === 'idle' && !savedSession && (
        <div className="space-y-6">
          {/* Activity selector */}
          <div id="tour-cardio-activity" className="flex gap-2 p-1 bg-muted/50 rounded-xl" role="radiogroup" aria-label="Tipo de actividad">
            {ACTIVITIES.map(act => (
              <button
                key={act.id}
                role="radio"
                aria-checked={selectedActivity === act.id}
                aria-label={act.label}
                onClick={() => setSelectedActivity(act.id)}
                className={cn(
                  'flex-1 flex flex-col items-center gap-1 py-4 rounded-lg transition-all focus-visible:ring-2 focus-visible:ring-lime/40 focus-visible:outline-none',
                  selectedActivity === act.id
                    ? 'bg-background shadow-sm ring-1 ring-lime/30 text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span className="text-2xl" aria-hidden="true">{act.icon}</span>
                <span className="text-[11px] font-mono tracking-widest">{act.label}</span>
              </button>
            ))}
          </div>

          {/* Start button */}
          <Button
            id="tour-cardio-start"
            onClick={() => start(selectedActivity)}
            className="w-full h-14 bg-lime hover:bg-lime/90 text-zinc-900 font-bebas text-xl tracking-widest shadow-lg shadow-lime/10"
          >
            INICIAR {ACTIVITIES.find(a => a.id === selectedActivity)?.label.toUpperCase()}
          </Button>

          {/* History */}
          <div id="tour-cardio-history">
            <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-4 uppercase">Historial</div>
            <CardioHistory sessions={history} loading={historyLoading} onDelete={handleDeleteSession} />
          </div>

          {/* Stats section */}
          {(weeklyStats.totalSessions > 0 || monthlyStats.totalSessions > 0) && (
            <div id="tour-cardio-stats">
              <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-4 uppercase">Estadísticas</div>
              <CardioStats weeklyStats={weeklyStats} monthlyStats={monthlyStats} records={records} weeklyTrend={weeklyTrend} />
            </div>
          )}
        </div>
      )}

      {/* Tracking / Paused view — optimized for glanceability during exercise */}
      {isTracking && (
        <div className="space-y-4 sm:space-y-6">
          {/* Compact activity bar with status + GPS quality */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">{ACTIVITIES.find(a => a.id === activityType)?.icon}</span>
              <span className="font-bebas text-lg tracking-widest uppercase">
                {ACTIVITIES.find(a => a.id === activityType)?.label}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {/* GPS signal indicator */}
              {state === 'tracking' && (
                <div className="flex items-center gap-1" title={gpsAccuracy != null ? `Precisión: ${Math.round(gpsAccuracy)}m` : 'Sin señal GPS'}>
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a7 7 0 017 7c0 5-7 13-7 13S5 14 5 9a7 7 0 017-7z" />
                    <circle cx="12" cy="9" r="2.5" />
                  </svg>
                  <span className={cn(
                    'text-[10px] font-mono tabular-nums',
                    gpsAccuracy == null ? 'text-red-400' :
                    gpsAccuracy <= 10 ? 'text-lime' :
                    gpsAccuracy <= 20 ? 'text-amber-400' : 'text-red-400'
                  )}>
                    {gpsAccuracy != null ? `${Math.round(gpsAccuracy)}m` : '---'}
                  </span>
                </div>
              )}
              {state === 'tracking' ? (
                <div className="flex items-center gap-1.5">
                  <div className="size-2.5 rounded-full bg-red-500 motion-safe:animate-pulse" />
                  <span className="text-[11px] font-mono tracking-widest text-red-400">GRABANDO</span>
                </div>
              ) : (
                <span className="text-[11px] font-mono tracking-widest text-amber-400 px-2.5 py-1 rounded-lg bg-amber-400/10">PAUSADO</span>
              )}
            </div>
          </div>

          {/* Duration — the hero metric, readable from arm's length */}
          <div className="text-center">
            <div className="font-bebas text-6xl sm:text-7xl tabular-nums leading-none">{formatDuration(duration)}</div>
            <div className="text-[11px] font-mono tracking-[0.3em] text-muted-foreground mt-1.5">DURACIÓN</div>
          </div>

          {/* Secondary stats — distance + pace/speed */}
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center p-4 sm:p-5 bg-muted/60 rounded-xl">
              <div className="font-bebas text-4xl sm:text-5xl text-lime tabular-nums leading-none">{distance.toFixed(2)}</div>
              <div className="text-[11px] font-mono tracking-[0.2em] text-muted-foreground mt-1.5">KM</div>
            </div>
            <div className="text-center p-4 sm:p-5 bg-muted/60 rounded-xl">
              {isCycling(activityType) ? (
                <>
                  <div className="font-bebas text-4xl sm:text-5xl text-sky-500 tabular-nums leading-none">{formatSpeed(currentSpeed)}</div>
                  <div className="text-[11px] font-mono tracking-[0.2em] text-muted-foreground mt-1.5">KM/H</div>
                </>
              ) : (
                <>
                  <div className="font-bebas text-4xl sm:text-5xl text-sky-500 tabular-nums leading-none">{formatPace(currentPace)}</div>
                  <div className="text-[11px] font-mono tracking-[0.2em] text-muted-foreground mt-1.5">MIN/KM</div>
                </>
              )}
            </div>
          </div>

          {/* Split indicator */}
          {currentSplit && distance > 0.1 && (
            <div className="text-center py-2.5 bg-muted/40 rounded-lg">
              <span className="font-bebas text-base tracking-widest text-muted-foreground">KM {currentSplit.km}</span>
              <span className="mx-2 text-muted-foreground/40">—</span>
              <span className="font-bebas text-base text-sky-500 tabular-nums">{formatDuration(currentSplit.elapsed)}</span>
            </div>
          )}

          {/* Live map — taller for route visibility */}
          {pointsCount > 1 && (
            <RouteMap points={pointsRef.current} height="220px" live activityType={activityType} />
          )}

          {/* Controls — large touch targets for sweaty/gloved hands */}
          <div className="flex gap-3">
            {state === 'tracking' ? (
              <>
                <Button
                  onClick={pause}
                  variant="outline"
                  className="flex-1 h-16 font-bebas text-xl tracking-widest border-amber-400/30 text-amber-400 hover:bg-amber-400/10 active:bg-amber-400/20"
                >
                  PAUSAR
                </Button>
                <Button
                  onClick={handleFinish}
                  className="flex-1 h-16 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white font-bebas text-xl tracking-widest"
                >
                  PARAR
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={resume}
                  className="flex-1 h-16 bg-lime hover:bg-lime/90 active:bg-lime/80 text-zinc-900 font-bebas text-xl tracking-widest"
                >
                  REANUDAR
                </Button>
                <Button
                  onClick={handleFinish}
                  className="flex-1 h-16 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white font-bebas text-xl tracking-widest"
                >
                  TERMINAR
                </Button>
              </>
            )}
          </div>

          {/* Note — available during pause for mid-session thoughts */}
          {state === 'paused' && (
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Notas rápidas..."
              maxLength={500}
              rows={2}
              className="w-full text-sm px-3.5 py-2.5 rounded-xl border border-border bg-muted/30 focus:outline-none focus:border-lime/40 focus:ring-1 focus:ring-lime/20 placeholder:text-muted-foreground/40 transition-all resize-none"
            />
          )}

          {/* Discard — with confirmation */}
          <div className="pt-2">
            <button
              onClick={() => setShowDiscardConfirm(true)}
              className="w-full text-center text-xs text-muted-foreground hover:text-red-400 transition-colors py-3"
            >
              Descartar sesión
            </button>
          </div>

          <ConfirmDialog
            open={showDiscardConfirm}
            onOpenChange={setShowDiscardConfirm}
            title="Descartar sesión"
            description={`¿Descartar esta sesión de ${ACTIVITIES.find(a => a.id === activityType)?.label.toLowerCase()}? Se perderán todos los datos.`}
            confirmLabel="DESCARTAR"
            cancelLabel="SEGUIR"
            variant="destructive"
            onConfirm={handleDiscard}
          />
        </div>
      )}

      {/* Finished view */}
      {(state === 'finished' || savedSession) && (
        <div className="space-y-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center size-14 rounded-full bg-lime/10 border border-lime/20 mb-3">
              <svg className="size-7 text-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="text-lime font-bebas text-2xl tracking-wide">¡Sesión completada!</div>
          </div>

          {/* Map */}
          {pointsCount > 1 && (
            <RouteMap points={pointsRef.current} height="250px" activityType={activityType} />
          )}

          {/* Elevation profile */}
          {pointsCount > 2 && (
            <ElevationProfile points={pointsRef.current} height={80} />
          )}

          {/* Expanded stats grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-4 bg-muted/60 rounded-xl">
              <div className="font-bebas text-3xl text-lime tabular-nums">{(displaySession?.distance_km ?? distance).toFixed(2)}</div>
              <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-1">KM</div>
            </div>
            <div className="text-center p-4 bg-muted/60 rounded-xl">
              <div className="font-bebas text-3xl tabular-nums">{formatDuration(displaySession?.duration_seconds ?? duration)}</div>
              <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-1">DURACIÓN</div>
            </div>
            {isCycling(displaySession?.activity_type ?? activityType) ? (
              <div className="text-center p-4 bg-muted/60 rounded-xl">
                <div className="font-bebas text-3xl text-sky-500 tabular-nums">{formatSpeed(displaySession?.avg_speed_kmh ?? 0)}</div>
                <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-1">KM/H</div>
              </div>
            ) : (
              <div className="text-center p-4 bg-muted/60 rounded-xl">
                <div className="font-bebas text-3xl text-sky-500 tabular-nums">{formatPace(displaySession?.avg_pace ?? currentPace)}</div>
                <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-1">RITMO</div>
              </div>
            )}
          </div>

          {/* Secondary stats row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 bg-muted/40 rounded-xl">
              <div className="font-bebas text-2xl text-amber-400 tabular-nums">{displaySession?.calories_burned ?? 0}</div>
              <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-1">CALORÍAS</div>
            </div>
            <div className="text-center p-3 bg-muted/40 rounded-xl">
              <div className="font-bebas text-2xl text-amber-400 tabular-nums">{displaySession?.elevation_gain ?? 0}m</div>
              <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-1">DESNIVEL</div>
            </div>
            <div className="text-center p-3 bg-muted/40 rounded-xl">
              {isCycling(displaySession?.activity_type ?? activityType) ? (
                <>
                  <div className="font-bebas text-2xl text-pink-500 tabular-nums">{formatSpeed(displaySession?.max_speed_kmh ?? 0)}</div>
                  <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-1">VEL. MÁX</div>
                </>
              ) : (
                <>
                  <div className="font-bebas text-2xl text-pink-500 tabular-nums">{formatPace(displaySession?.max_pace ?? 0)}</div>
                  <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-1">RITMO MÁX</div>
                </>
              )}
            </div>
          </div>

          {/* Splits table */}
          {displaySession?.splits && displaySession.splits.length > 0 && (
            <div>
              <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-3 uppercase">Splits</div>
              <SplitsTable splits={displaySession.splits} />
            </div>
          )}

          {/* Note */}
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Notas sobre la sesión..."
            aria-label="Notas sobre la sesión"
            maxLength={500}
            rows={2}
            className="w-full text-base px-3.5 py-3 rounded-xl border border-border bg-muted/30 focus:outline-none focus:border-lime/40 focus:ring-1 focus:ring-lime/20 placeholder:text-muted-foreground/40 transition-all resize-none"
          />

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              onClick={handleNewSession}
              className="flex-1 h-11 bg-lime hover:bg-lime/90 text-zinc-900 font-bebas text-lg tracking-wide"
            >
              NUEVA SESIÓN
            </Button>
            {pointsCount > 0 && (
              <Button
                variant="outline"
                onClick={handleExportGPX}
                className="h-11 font-bebas text-lg tracking-wide border-border"
              >
                GPX
              </Button>
            )}
            {displaySession && <CardioShareCard session={displaySession} />}
          </div>
        </div>
      )}
    </div>
  )
}
