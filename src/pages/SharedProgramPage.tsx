import { useState, useEffect, useCallback } from 'react'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { Button } from '../components/ui/button'
import type { ProgramMeta } from '../types'
import type { RecordModel } from 'pocketbase'
import ProgramDetailPage from './ProgramDetailPage'

// ── Types ──────────────────────────────────────────────────────────────────

interface PreviewExercise {
  name: string
  sets: number | string
  reps: string
  muscles: string
}

// ── Icons ──────────────────────────────────────────────────────────────────

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="13" y1="8" x2="3" y2="8" />
      <polyline points="7,4 3,8 7,12" />
    </svg>
  )
}

// ── SharedProgramPage ──────────────────────────────────────────────────────

interface SharedProgramPageProps {
  programId: string
  userId?: string
  activeProgram?: ProgramMeta | null
  onNavigateToProgram?: (programId: string) => void
  onSelectProgram?: (programId: string) => Promise<void>
  onDuplicateProgram?: (programId: string) => Promise<void>
  onBack: () => void
  onLogin: () => void
}

export default function SharedProgramPage({
  programId,
  userId,
  activeProgram,
  onNavigateToProgram,
  onSelectProgram,
  onDuplicateProgram,
  onBack,
  onLogin,
}: SharedProgramPageProps) {
  const isLoggedIn = !!userId

  // If logged in, show the full program detail page
  if (isLoggedIn) {
    return (
      <ProgramDetailPage
        programId={programId}
        userId={userId}
        activeProgram={activeProgram}
        onBack={onBack}
        onNavigateToProgram={onNavigateToProgram}
        onSelectProgram={onSelectProgram}
        onDuplicateProgram={onDuplicateProgram}
        isSharedView={true}
        onLogin={onLogin}
      />
    )
  }

  // Not logged in: show a welcoming landing page
  return <SharedLanding programId={programId} onBack={onBack} onLogin={onLogin} />
}

// ── Landing for non-logged-in users ────────────────────────────────────────

function SharedLanding({
  programId,
  onBack,
  onLogin,
}: {
  programId: string
  onBack: () => void
  onLogin: () => void
}) {
  const [program, setProgram] = useState<ProgramMeta | null>(null)
  const [exercises, setExercises] = useState<PreviewExercise[]>([])
  const [loading, setLoading] = useState(true)
  const [phaseCount, setPhaseCount] = useState(0)

  const fetchPreview = useCallback(async () => {
    setLoading(true)
    try {
      const available = await isPocketBaseAvailable()
      if (!available) {
        setLoading(false)
        return
      }

      const progRecord = await pb.collection('programs').getOne(programId)
      setProgram({
        id: progRecord.id,
        name: progRecord.name,
        description: progRecord.description,
        duration_weeks: progRecord.duration_weeks,
        created_by: progRecord.created_by || undefined,
      })

      // Fetch phases count
      try {
        const phasesRes = await pb.collection('program_phases').getList(1, 1, {
          filter: pb.filter('program = {:pid}', { pid: programId }),
        })
        setPhaseCount(phasesRes.totalItems)
      } catch { /* ok */ }

      // Fetch first few exercises for preview
      try {
        const exRes = await pb.collection('program_exercises').getList(1, 8, {
          filter: pb.filter('program = {:pid}', { pid: programId }),
          sort: 'phase_number,sort_order',
        })
        setExercises(exRes.items.map((r: RecordModel) => ({
          name: r.exercise_name,
          sets: r.sets,
          reps: r.reps,
          muscles: r.muscles,
        })))
      } catch { /* ok */ }
    } catch {
      // Program not found
    } finally {
      setLoading(false)
    }
  }, [programId])

  useEffect(() => {
    fetchPreview()
  }, [fetchPreview])

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-12 md:py-20">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-zinc-800 rounded w-1/3" />
          <div className="h-16 bg-zinc-800 rounded w-2/3" />
          <div className="h-4 bg-zinc-800 rounded w-1/2" />
          <div className="h-12 bg-zinc-800 rounded w-48" />
        </div>
      </div>
    )
  }

  if (!program) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-12 md:py-20 text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-zinc-900 flex items-center justify-center">
          <svg className="size-8 text-zinc-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
        <p className="text-zinc-400 text-sm mb-4">Programa no encontrado</p>
        <button onClick={onBack} className="text-[11px] font-mono tracking-widest text-zinc-500 hover:text-foreground transition-colors uppercase">
          <ArrowLeftIcon className="size-4 inline mr-1.5" />
          Volver
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-12 md:py-20">
      {/* Back */}
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-foreground transition-colors mb-10">
        <ArrowLeftIcon className="size-4" />
        <span className="font-mono text-[11px] tracking-widest uppercase">Volver</span>
      </button>

      {/* Badge */}
      <div className="inline-block mb-4">
        <span className="text-[10px] font-mono tracking-[0.3em] text-lime-400 bg-lime-400/10 px-3 py-1 rounded-full uppercase">
          Programa compartido
        </span>
      </div>

      {/* Program name */}
      <h1 className="font-bebas text-4xl md:text-7xl leading-none tracking-wide mb-4">{program.name}</h1>

      {program.description && (
        <p className="text-sm text-zinc-400 leading-relaxed max-w-xl mb-6">{program.description}</p>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4 flex-wrap mb-10">
        {program.duration_weeks > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-lime-400 font-bebas text-xl">{program.duration_weeks}</span>
            <span className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">semanas</span>
          </div>
        )}
        {phaseCount > 0 && (
          <>
            <div className="w-px h-5 bg-zinc-800" />
            <div className="flex items-center gap-2">
              <span className="text-lime-400 font-bebas text-xl">{phaseCount}</span>
              <span className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">fase{phaseCount !== 1 ? 's' : ''}</span>
            </div>
          </>
        )}
        {exercises.length > 0 && (
          <>
            <div className="w-px h-5 bg-zinc-800" />
            <div className="flex items-center gap-2">
              <span className="text-lime-400 font-bebas text-xl">{exercises.length}+</span>
              <span className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">ejercicios</span>
            </div>
          </>
        )}
      </div>

      {/* Exercise preview list */}
      {exercises.length > 0 && (
        <div className="mb-10">
          <h2 className="font-bebas text-xl tracking-widest mb-4 uppercase text-zinc-400">Vista previa de ejercicios</h2>
          <div className="rounded-xl bg-zinc-900/60 overflow-hidden divide-y divide-zinc-800/50">
            {exercises.map((ex, idx) => (
              <div key={idx} className="flex items-center gap-4 px-5 py-3.5">
                <span className="font-bebas text-base text-lime-400 w-14 text-center shrink-0 tracking-wide">
                  {ex.sets}x{ex.reps}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-foreground truncate">{ex.name}</div>
                  {ex.muscles && (
                    <div className="text-[11px] text-zinc-500">
                      {ex.muscles.split(',').map(m => m.trim()).filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          onClick={onLogin}
          className="bg-lime-400 hover:bg-lime-300 text-zinc-900 font-bebas text-lg tracking-widest px-8 h-12 shadow-lg shadow-lime-400/10"
        >
          REGISTRATE PARA USAR ESTE PROGRAMA
        </Button>
        <Button
          variant="outline"
          onClick={onLogin}
          className="font-mono text-[11px] tracking-widest h-12 px-6 border-zinc-700 hover:border-zinc-500 hover:text-foreground"
        >
          YA TENGO CUENTA
        </Button>
      </div>
    </div>
  )
}
