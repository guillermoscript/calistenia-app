import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { WORKOUTS } from '../data/workouts'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Separator } from '../components/ui/separator'
import { Progress } from '../components/ui/progress'
import { cn } from '../lib/utils'
import { PHASE_COLORS } from '../lib/style-tokens'
import { useWorkoutState } from '../contexts/WorkoutContext'
import { useAuthState } from '../contexts/AuthContext'
import type { ProgressMap, Settings, ProgramMeta, ExerciseLog, SetData } from '../types'
import ProgressSummary from '../components/progress/ProgressSummary'
import ExerciseChart from '../components/progress/ExerciseChart'
import WeightTracker from '../components/progress/WeightTracker'
import BodyPhotosTimeline from '../components/progress/BodyPhotosTimeline'
import WeightProgressionChart from '../components/progress/WeightProgressionChart'
import MuscleVolumeChart from '../components/progress/MuscleVolumeChart'
import VolumeLoadChart from '../components/progress/VolumeLoadChart'
import OneRepMaxCalculator from '../components/progress/OneRepMaxCalculator'
import PhotoComparator from '../components/progress/PhotoComparator'
import BodyMeasurementsTracker from '../components/progress/BodyMeasurementsTracker'
import ExportData from '../components/progress/ExportData'
import { useWeight } from '../hooks/useWeight'
import { useBodyPhotos } from '../hooks/useBodyPhotos'

const LS_LUMBAR = 'calistenia_lumbar_checks'

interface LumbarCheckLocal {
  date: string
  lumbarScore: number
  sleptWell: boolean
  sittingHours: number
}

function getLumbarChecks(): LumbarCheckLocal[] {
  try { return JSON.parse(localStorage.getItem(LS_LUMBAR) || '[]') } catch { return [] }
}


// Lumbar score → semantic color class
function lumbarColor(score: number | null): string {
  if (score === null) return 'text-muted-foreground'
  if (score >= 4) return 'text-emerald-500'
  if (score >= 2.5) return 'text-amber-400'
  return 'text-red-500'
}

interface SessionLog {
  type: 'session'
  date: string
  workoutKey: string
  title: string
  phase: number | undefined
  note: string
  isFree: boolean
  exerciseCount: number
}

interface ProgressPageProps {
  // All data now comes from WorkoutContext
}

function relativeDate(dateStr: string): string {
  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  if (dateStr === today) return 'Hoy'
  if (dateStr === yesterday) return 'Ayer'
  const diff = Math.floor((new Date(today).getTime() - new Date(dateStr).getTime()) / 86400000)
  if (diff <= 7) return `Hace ${diff} dias`
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

export default function ProgressPage() {
  const { progress, settings, activeProgram } = useWorkoutState()
  const { userId } = useAuthState()
  const navigate = useNavigate()
  const { weights } = useWeight(userId || null)
  const { photos } = useBodyPhotos(userId || null)
  const allLogs = useMemo<SessionLog[]>(() => {
    return Object.entries(progress)
      .filter(([k]) => k.startsWith('done_'))
      .map(([key, val]) => {
        const parts = key.split('_')
        const date = parts[1]
        const workoutKey = parts.slice(2).join('_')
        const isFree = workoutKey.startsWith('free_')
        const workout = isFree ? null : WORKOUTS[workoutKey]
        // Count exercises logged in this session
        const exerciseCount = isFree
          ? Object.keys(progress).filter(k =>
              !k.startsWith('done_') && k.includes(workoutKey) && k.includes(date)
            ).length
          : 0
        return {
          type: 'session' as const, date, workoutKey,
          title: isFree ? 'Sesión Libre' : (workout?.title || workoutKey),
          phase: isFree ? undefined : workout?.phase,
          note: (val as { note?: string }).note || '',
          isFree,
          exerciseCount,
        }
      })
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [progress])

  const exerciseLogs = useMemo<Record<string, ExerciseLog[]>>(() => {
    const logs: Record<string, ExerciseLog[]> = {}
    Object.values(progress).forEach(val => {
      const v = val as ExerciseLog
      if (v.exerciseId && v.sets) {
        if (!logs[v.exerciseId]) logs[v.exerciseId] = []
        logs[v.exerciseId].push(v)
      }
    })
    return logs
  }, [progress])

  const lumbarChecks = useMemo<LumbarCheckLocal[]>(() => {
    const checks = getLumbarChecks()
    return checks.sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 14)
  }, [])

  const totalSetsCount = Object.values(exerciseLogs).reduce((acc, logs) => acc + logs.reduce((a, l) => a + l.sets.length, 0), 0)

  const byDate = useMemo<Record<string, SessionLog[]>>(() => {
    const groups: Record<string, SessionLog[]> = {}
    allLogs.forEach(log => { if (!groups[log.date]) groups[log.date] = []; groups[log.date].push(log) })
    return groups
  }, [allLogs])

  const avgLumbar = useMemo<number | null>(() => {
    if (!lumbarChecks.length) return null
    const last7 = lumbarChecks.slice(0, 7)
    const avg = last7.reduce((s, c) => s + (c.lumbarScore || 0), 0) / last7.length
    return Math.round(avg * 10) / 10
  }, [lumbarChecks])

  const programName = activeProgram?.name || null

  return (
    <div className="max-w-[860px] mx-auto px-4 py-6 md:px-6 md:py-8">
      <div className="text-[10px] text-muted-foreground tracking-[3px] mb-2 uppercase">Historial</div>
      <div className="flex items-end gap-4 mb-8 flex-wrap">
        <div className="font-bebas text-[36px] md:text-[52px] leading-none">PROGRESO</div>
        {programName && (
          <Badge variant="outline" className="border-lime/25 text-lime bg-lime/5 mb-1.5">
            {programName.toUpperCase()}
          </Badge>
        )}
      </div>

      {/* Sesiones recientes */}
      {allLogs.length > 0 && (
        <div className="mb-8">
          <div className="text-[10px] text-muted-foreground tracking-[3px] mb-3 uppercase">Sesiones recientes</div>
          <div className="flex flex-col gap-1.5">
            {allLogs.slice(0, 10).map((log, i) => {
              const phaseColor = log.phase ? PHASE_COLORS[log.phase] : null
              return (
                <button
                  key={`${log.date}-${log.workoutKey}-${i}`}
                  onClick={() => navigate(`/session/${log.date}/${log.workoutKey}`)}
                  className="w-full text-left px-4 py-3 bg-card border border-border rounded-lg hover:border-lime/30 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="text-xs text-muted-foreground w-16 shrink-0">{relativeDate(log.date)}</div>
                    <div className="min-w-0">
                      <div className={cn('text-sm font-medium truncate', log.isFree ? 'text-violet-400' : phaseColor?.text)}>{log.title}</div>
                      {log.isFree && log.exerciseCount > 0 && (
                        <div className="text-[11px] text-muted-foreground">{log.exerciseCount} ejercicios</div>
                      )}
                    </div>
                  </div>
                  <svg className="size-4 text-muted-foreground shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="6,3 11,8 6,13" /></svg>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {allLogs.length === 0 ? (
        <div className="text-center py-20 px-5 text-muted-foreground">
          <div className="text-6xl mb-5">📊</div>
          <div className="font-bebas text-3xl mb-2">Aún no hay datos</div>
          <div className="text-sm leading-relaxed">Cuando completes tu primer entrenamiento y marques las series, aquí verás todo tu historial.</div>
          <Card className="mt-6 inline-block text-left border-lime/20">
            <CardContent className="px-6 py-4">
              <div className="text-[11px] text-lime mb-2 tracking-[2px] uppercase">Cómo usar:</div>
              <div className="text-[13px] text-muted-foreground leading-relaxed">
                1. Ve a "Entrenar" y selecciona tu día<br/>
                2. En cada ejercicio haz clic en "+ ANOTAR SERIE"<br/>
                3. Escribe las reps que hiciste y guarda<br/>
                4. Al terminar haz clic en "MARCAR COMPLETADO"
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div>
          {/* Progress Summary */}
          <div id="tour-progress-summary">
            <ProgressSummary progress={progress} settings={settings} />
          </div>

          {/* Exercise Charts */}
          {Object.keys(exerciseLogs).length > 0 && (
            <div id="tour-exercise-charts" className="mb-8">
              <div className="text-[10px] text-muted-foreground tracking-[3px] mb-4 uppercase">Gráficas por ejercicio</div>
              <div className="flex flex-col gap-2.5">
                {Object.entries(exerciseLogs).map(([exId, logs]) => (
                  <ExerciseChart
                    key={exId}
                    exerciseId={exId}
                    exerciseName={exId}
                    logs={logs}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Weight Progression Chart (lastre) */}
          <WeightProgressionChart exerciseLogs={exerciseLogs} />

          {/* Volume Load */}
          <VolumeLoadChart progress={progress} />

          {/* Muscle Volume Chart */}
          <MuscleVolumeChart progress={progress} />

          {/* 1RM Calculator */}
          <OneRepMaxCalculator exerciseLogs={exerciseLogs} />

          {/* Weight Tracker */}
          <div className="mb-8">
            <WeightTracker userId={userId || null} />
          </div>

          {/* Body Measurements */}
          <BodyMeasurementsTracker userId={userId || null} />

          {/* Body Photos */}
          <div className="mb-8">
            <BodyPhotosTimeline userId={userId || null} />
          </div>

          {/* Photo Comparator */}
          <PhotoComparator photos={photos} />

          {/* Export Data */}
          <ExportData progress={progress} weights={weights} />

          {/* Session History */}
          <div id="tour-session-history" className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="text-[10px] text-muted-foreground tracking-[3px] uppercase">Historial de sesiones</div>
              {programName && (
                <Badge variant="outline" className="text-[9px] tracking-[1.5px]">
                  {programName.toUpperCase()}
                </Badge>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {Object.entries(byDate).slice(0, 30).map(([date, logs]) => (
                <Card key={date}>
                  <CardContent className="px-4 py-3.5">
                    <div className="flex gap-4 items-center flex-wrap md:flex-nowrap">
                      <div className="text-[11px] text-sky-600 dark:text-sky-400 font-mono whitespace-nowrap">{date}</div>
                      <div className="flex-1 flex gap-2 flex-wrap">
                        {logs.map((log, i) => {
                          const pc = log.isFree
                            ? { badge: 'border-violet-400/30 text-violet-400 bg-violet-400/10' }
                            : (PHASE_COLORS[log.phase ?? 0] || { badge: 'border-border text-muted-foreground bg-transparent' })
                          return (
                            <Badge key={i} variant="outline" className={cn('text-[11px] font-mono', pc.badge)}>
                              {log.title}
                              {log.isFree && log.exerciseCount > 0 && (
                                <span className="ml-1 text-[10px] opacity-70">· {log.exerciseCount} ej.</span>
                              )}
                            </Badge>
                          )
                        })}
                      </div>
                      {programName && (
                        <Badge variant="outline" className="text-[8px] tracking-wide whitespace-nowrap flex-shrink-0">
                          {programName.toUpperCase()}
                        </Badge>
                      )}
                      <div className="text-emerald-500 text-base">✓</div>
                    </div>
                    {logs.some(l => l.note) && (
                      <div className="mt-2.5 pt-2.5 border-t border-border/60">
                        {logs.filter(l => l.note).map((log, i) => (
                          <div key={i} className="text-[12px] text-muted-foreground leading-relaxed italic pl-1 border-l-2 border-lime/25">
                            "{log.note}"
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Lumbar Trend */}
          {lumbarChecks.length > 0 && (
            <div className="mb-8">
              <div className="text-[10px] text-muted-foreground tracking-[3px] mb-4 uppercase">Tendencia Lumbar</div>
              <Card>
                <CardContent className="px-6 py-5">
                  <div className="flex gap-6 items-center mb-5">
                    <div>
                      <div className={cn('font-bebas text-5xl leading-none', lumbarColor(avgLumbar))}>
                        {avgLumbar ?? '–'}
                      </div>
                      <div className="text-[10px] text-muted-foreground tracking-[1.5px] mt-1 uppercase">Promedio (últimas 7)</div>
                    </div>
                    <div className="flex-1">
                      <Progress value={((avgLumbar || 0) / 5) * 100} className="h-1.5 mb-1.5" />
                      <div className="text-[11px] text-muted-foreground">
                        {avgLumbar !== null && avgLumbar >= 4 ? 'Tu lumbar está bien' : avgLumbar !== null && avgLumbar >= 2.5 ? 'Molestias lumbares moderadas — presta atención' : 'Tu lumbar necesita cuidado — considera descansar'}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-1.5 flex-wrap">
                    {lumbarChecks.map((c, i) => {
                      const score = c.lumbarScore || 0
                      const col = lumbarColor(score)
                      return (
                        <div key={i}
                          title={`${c.date} — Lumbar: ${score}/5, Sueño: ${c.sleptWell ? 'Si' : 'No'}, Sentado: ${c.sittingHours}h`}
                          className="text-center px-2.5 py-2 bg-muted/30 rounded-md min-w-[48px] border border-border/50">
                          <div className={cn('font-bebas text-xl leading-none', col)}>{score}</div>
                          <div className="text-[9px] text-muted-foreground mt-0.5 font-mono">{c.date?.slice(5) || ''}</div>
                        </div>
                      )
                    })}
                  </div>

                  {lumbarChecks.length >= 3 && (() => {
                    const recent = lumbarChecks.slice(0, 7)
                    const sleptWellPct = Math.round((recent.filter(c => c.sleptWell).length / recent.length) * 100)
                    const avgSitting = Math.round(recent.reduce((s, c) => s + (c.sittingHours || 0), 0) / recent.length)
                    return (
                      <div className="flex gap-4 mt-4 pt-4 border-t border-border/60">
                        <div className="text-[12px] text-muted-foreground">
                          <span className={sleptWellPct >= 70 ? 'text-emerald-500' : 'text-amber-400'}>{sleptWellPct}%</span> de noches con buen sueño
                        </div>
                        <div className="text-[12px] text-muted-foreground">
                          Promedio sentado: <span className={avgSitting <= 6 ? 'text-emerald-500' : avgSitting <= 9 ? 'text-amber-400' : 'text-red-500'}>{avgSitting}h/día</span>
                        </div>
                      </div>
                    )
                  })()}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Exercise PR Tracker */}
          {Object.keys(exerciseLogs).length > 0 && (
            <div>
              <div className="text-[10px] text-muted-foreground tracking-[3px] mb-4 uppercase">Resumen por ejercicio</div>
              <div className="flex flex-col gap-2.5">
                {Object.entries(exerciseLogs).map(([exId, logs]) => {
                  const allSets = logs.flatMap(l => l.sets)
                  const latest = logs.sort((a, b) => b.date.localeCompare(a.date))[0]
                  return (
                    <Card key={exId}>
                      <CardContent className="px-4 py-4">
                        <div className="flex justify-between items-center mb-2">
                          <div className="font-medium text-sm capitalize">{exId.replace(/_/g, ' ')}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{allSets.length} series totales</div>
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          {latest?.sets.map((s: SetData, i: number) => (
                            <span key={i} className="px-2.5 py-1 bg-lime/5 border border-lime/15 rounded font-mono text-[11px] text-lime">
                              S{i + 1}: {s.reps}
                            </span>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
