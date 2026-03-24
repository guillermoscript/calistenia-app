import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { WORKOUTS } from '../data/workouts'
import { Badge } from '../components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { cn } from '../lib/utils'
import { relativeDate } from '../lib/dateUtils'
import { PHASE_COLORS } from '../lib/style-tokens'
import { useWorkoutState } from '../contexts/WorkoutContext'
import { useAuthState } from '../contexts/AuthContext'
import type { ExerciseLog } from '../types'
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

interface SessionLog {
  date: string
  workoutKey: string
  title: string
  phase: number | undefined
  note: string
  isFree: boolean
  exerciseCount: number
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
        const exerciseCount = isFree
          ? Object.keys(progress).filter(k =>
              !k.startsWith('done_') && k.includes(workoutKey) && k.includes(date)
            ).length
          : 0
        return {
          date, workoutKey,
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

  const programName = activeProgram?.name || null
  const freeLogCount = allLogs.filter(l => l.isFree).length

  return (
    <div className="max-w-[860px] mx-auto px-4 py-6 md:px-6 md:py-8">
      <div className="flex items-end gap-4 mb-6 flex-wrap">
        <div className="font-bebas text-[36px] md:text-[52px] leading-none">PROGRESO</div>
        {programName && (
          <Badge variant="outline" className="border-lime/25 text-lime bg-lime/5 mb-1.5">
            {programName.toUpperCase()}
          </Badge>
        )}
      </div>

      {allLogs.length === 0 ? (
        <div className="text-center py-20 px-5 text-muted-foreground">
          <div className="font-bebas text-3xl mb-2">Aún no hay datos</div>
          <div className="text-sm leading-relaxed max-w-sm mx-auto">
            Completa tu primer entrenamiento y anota las series para ver tu progreso aquí.
          </div>
        </div>
      ) : (
        <Tabs defaultValue="resumen" className="w-full">
          <TabsList className="w-full mb-6">
            <TabsTrigger value="resumen" className="flex-1 text-xs tracking-[1.5px] uppercase">Resumen</TabsTrigger>
            <TabsTrigger value="graficas" className="flex-1 text-xs tracking-[1.5px] uppercase">Gráficas</TabsTrigger>
            <TabsTrigger value="cuerpo" className="flex-1 text-xs tracking-[1.5px] uppercase">Cuerpo</TabsTrigger>
          </TabsList>

          {/* ── Tab 1: Resumen ── */}
          <TabsContent value="resumen">
            {/* Progress Summary */}
            <div id="tour-progress-summary">
              <ProgressSummary progress={progress} settings={settings} />
            </div>

            {/* Link to Free Progress */}
            {freeLogCount > 0 && (
              <button
                onClick={() => navigate('/progress/free')}
                className="w-full mb-8 px-4 py-3 bg-violet-400/5 border border-violet-400/20 rounded-lg hover:border-violet-400/40 transition-colors flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <span className="text-violet-400 text-sm font-medium">Progreso de sesiones libres</span>
                  <span className="text-[11px] text-muted-foreground">
                    {freeLogCount} {freeLogCount !== 1 ? 'sesiones' : 'sesión'}
                  </span>
                </div>
                <svg className="size-4 text-violet-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="6,3 11,8 6,13" /></svg>
              </button>
            )}

            {/* Recent Sessions */}
            <div className="mb-8">
              <div className="text-[10px] text-muted-foreground tracking-[3px] mb-3 uppercase">Sesiones recientes</div>
              <div className="flex flex-col gap-1.5">
                {allLogs.slice(0, 15).map((log, i) => {
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
                            <div className="text-[11px] text-muted-foreground">{log.exerciseCount} {log.exerciseCount !== 1 ? 'ejercicios' : 'ejercicio'}</div>
                          )}
                        </div>
                      </div>
                      {log.note && (
                        <div className="text-[11px] text-muted-foreground italic truncate max-w-[120px] hidden sm:block">"{log.note}"</div>
                      )}
                      <svg className="size-4 text-muted-foreground shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="6,3 11,8 6,13" /></svg>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Export */}
            <ExportData progress={progress} weights={weights} />
          </TabsContent>

          {/* ── Tab 2: Gráficas ── */}
          <TabsContent value="graficas">
            {/* Exercise Charts */}
            {Object.keys(exerciseLogs).length > 0 && (
              <div id="tour-exercise-charts" className="mb-8">
                <div className="text-[10px] text-muted-foreground tracking-[3px] mb-4 uppercase">Gráficas por ejercicio</div>
                <div className="flex flex-col gap-2.5">
                  {Object.entries(exerciseLogs).map(([exId, logs]) => (
                    <ExerciseChart
                      key={exId}
                      exerciseName={exId}
                      logs={logs}
                      showSessionType
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Weight Progression (lastre) */}
            <WeightProgressionChart exerciseLogs={exerciseLogs} />

            {/* Volume Load */}
            <VolumeLoadChart progress={progress} />

            {/* Muscle Volume */}
            <MuscleVolumeChart progress={progress} />

            {/* 1RM Calculator */}
            <OneRepMaxCalculator exerciseLogs={exerciseLogs} />

            {Object.keys(exerciseLogs).length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <div className="font-bebas text-2xl mb-2">Sin datos todavía</div>
                <div className="text-sm mb-4">Anota series en tus entrenamientos para ver tus gráficas.</div>
                <button
                  onClick={() => navigate('/')}
                  className="text-sm text-lime hover:underline"
                >
                  Ir a entrenar
                </button>
              </div>
            )}
          </TabsContent>

          {/* ── Tab 3: Cuerpo ── */}
          <TabsContent value="cuerpo">
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
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
