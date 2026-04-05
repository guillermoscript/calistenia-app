import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { pb } from '../lib/pocketbase'
import type { TranslatableField } from '../lib/i18n-db'
import { useLocalize } from '../hooks/useLocalize'

// ── Types for the PB record ────────────────────────────────────────────────

interface CircuitExerciseRecord {
  exerciseId: string
  name: TranslatableField
  reps?: string
  workSecondsOverride?: number
  restSecondsOverride?: number
}

interface CircuitConfigRecord {
  mode: 'circuit' | 'timed'
  rounds: number
  restBetweenExercises: number
  restBetweenRounds: number
  workSeconds?: number
  restSeconds?: number
}

interface CircuitSessionRecord {
  id: string
  circuit_name: TranslatableField
  mode: 'circuit' | 'timed'
  exercises: CircuitExerciseRecord[]
  rounds_completed: number
  rounds_target: number
  duration_seconds: number
  started_at: string
  finished_at: string
  note: string
  config: CircuitConfigRecord
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatDate(isoStr: string, language: string): string {
  const d = new Date(isoStr)
  return d.toLocaleDateString(language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatSeconds(seconds: number): string {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return s > 0 ? `${m}m ${s}s` : `${m}m`
  }
  return `${seconds}s`
}

// ── Component ──────────────────────────────────────────────────────────────

export default function CircuitSessionDetailPage() {
  const { t, i18n } = useTranslation()
  const l = useLocalize()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [session, setSession] = useState<CircuitSessionRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false

    const load = async () => {
      try {
        const record = await pb.collection('circuit_sessions').getOne(id, { $autoCancel: false })
        if (cancelled) return
        setSession(record as unknown as CircuitSessionRecord)
      } catch {
        if (!cancelled) setError(t('session.notFound'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [id, t])

  // ── Back button helper ─────────────────────────────────────────────────

  const backButton = (
    <button
      onClick={() => navigate(-1)}
      className="text-sm text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1"
    >
      <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <polyline points="10,3 5,8 10,13" />
      </svg>
      {t('common.back')}
    </button>
  )

  // ── Loading state ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {backButton}
        <div className="flex justify-center py-16">
          <div className="size-6 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  // ── Error / not found state ────────────────────────────────────────────

  if (error || !session) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {backButton}
        <div className="text-center py-16">
          <div className="text-muted-foreground text-sm">{error ?? t('session.notFound')}</div>
        </div>
      </div>
    )
  }

  // ── Main content ───────────────────────────────────────────────────────

  const exercises = session.exercises ?? []
  const config = session.config
  const isTimed = session.mode === 'timed'

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">
      {backButton}

      {/* Header */}
      <div className="mb-6">
        <div className="text-[10px] text-muted-foreground tracking-[0.3em] uppercase mb-1">
          {formatDate(session.started_at, i18n.language)}
        </div>
        <h1 className="font-bebas text-3xl md:text-4xl leading-none mb-2">
          {l(session.circuit_name)}
        </h1>

        {/* Mode badge */}
        <span className="inline-block text-[10px] tracking-widest uppercase px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
          {isTimed ? t('circuit.modes.timed') : t('circuit.modes.circuit')}
        </span>
      </div>

      {/* Stats grid (2x2) */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard
          label={t('circuit.rounds')}
          value={`${session.rounds_completed} / ${session.rounds_target}`}
        />
        <StatCard
          label={t('session.duration', { defaultValue: 'Duration' })}
          value={formatDuration(session.duration_seconds)}
        />
        <StatCard
          label={t('circuit.totalExercises', { count: exercises.length })}
          value={String(exercises.length)}
        />
        <StatCard
          label={t('common.mode', { defaultValue: 'Mode' })}
          value={isTimed ? t('circuit.modes.timed') : t('circuit.modes.circuit')}
        />
      </div>

      {/* Exercises list */}
      {exercises.length > 0 && (
        <div className="mb-6">
          <h2 className="text-[10px] text-muted-foreground tracking-widest uppercase mb-3">
            {t('circuit.addExercises', { defaultValue: 'Exercises' })}
          </h2>
          <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
            {exercises.map((ex, i) => (
              <div key={ex.exerciseId + '-' + i} className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-5 text-center">{i + 1}</span>
                  <span className="text-sm text-foreground">{l(ex.name)}</span>
                </div>
                {ex.reps && (
                  <span className="text-xs text-muted-foreground">{ex.reps}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Config details */}
      {config && (
        <div className="mb-6">
          <h2 className="text-[10px] text-muted-foreground tracking-widest uppercase mb-3">
            {t('common.settings', { defaultValue: 'Settings' })}
          </h2>
          <div className="space-y-2 text-sm">
            {isTimed && config.workSeconds != null && (
              <ConfigRow
                label={t('circuit.workTime')}
                value={formatSeconds(config.workSeconds)}
              />
            )}
            {isTimed && config.restSeconds != null && (
              <ConfigRow
                label={t('circuit.restTime')}
                value={formatSeconds(config.restSeconds)}
              />
            )}
            {config.restBetweenExercises > 0 && (
              <ConfigRow
                label={t('circuit.restBetweenExercises')}
                value={formatSeconds(config.restBetweenExercises)}
              />
            )}
            {config.restBetweenRounds > 0 && (
              <ConfigRow
                label={t('circuit.restBetweenRounds')}
                value={formatSeconds(config.restBetweenRounds)}
              />
            )}
          </div>
        </div>
      )}

      {/* Note */}
      {session.note && (
        <div className="mt-6 px-4 py-3 bg-muted/30 rounded-lg border border-border">
          <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-1">
            {t('session.notes')}
          </div>
          <div className="text-sm text-muted-foreground italic">{session.note}</div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
      <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-1">{label}</div>
      <div className="text-lg font-bebas text-foreground">{value}</div>
    </div>
  )
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-muted/20 rounded-lg">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  )
}
