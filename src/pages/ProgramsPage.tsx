import { useState, useMemo, useRef, useEffect } from 'react'
import { cn } from '../lib/utils'
import { inferDifficulty, DIFFICULTY_COLORS, type DifficultyLevel } from '../lib/difficulty'
import { calculateWorkoutDuration, formatDuration } from '../lib/duration'
import { WORKOUTS } from '../data/workouts'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import type { ProgramMeta, UserRole } from '../types'

// ── Filter categories ──────────────────────────────────────────────────────

const FILTER_PILLS = [
  { id: 'oficiales', label: 'Oficiales' },
  { id: 'comunidad', label: 'Comunidad' },
  { id: 'mis', label: 'Mis Programas' },
] as const

type FilterId = typeof FILTER_PILLS[number]['id']

// ── Share helper ───────────────────────────────────────────────────────────

async function shareProgram(programId: string, programName: string) {
  const url = `${window.location.origin}/shared/${programId}`
  const shareData = {
    title: programName,
    text: `Mira este programa de calistenia: ${programName}`,
    url,
  }

  if (navigator.share && navigator.canShare?.(shareData)) {
    try {
      await navigator.share(shareData)
      return
    } catch {
      // User cancelled or share failed — fall through to clipboard
    }
  }

  // Fallback: copy to clipboard
  try {
    await navigator.clipboard.writeText(url)
    alert('Enlace copiado al portapapeles')
  } catch {
    // Last resort
    prompt('Copia este enlace:', url)
  }
}

// ── Program Card ───────────────────────────────────────────────────────────

// Compute default difficulty from hardcoded workouts
const defaultDifficulty: DifficultyLevel = inferDifficulty(
  Object.values(WORKOUTS).flatMap(w => w.exercises)
)
const defaultTotalDuration: number = Object.values(WORKOUTS).reduce(
  (sum, w) => sum + calculateWorkoutDuration(w.exercises), 0
)

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: 'PRINCIPIANTE',
  intermediate: 'INTERMEDIO',
  advanced: 'AVANZADO',
}

interface ProgramCardProps {
  program: ProgramMeta
  isOwn: boolean
  canEdit: boolean
  isActive: boolean
  onSelect: () => void
  onShare: () => void
  onDelete?: () => void
  onEdit?: () => void
  onView?: () => void
}

function ProgramCard({ program, isOwn, canEdit, isActive, onSelect, onShare, onDelete, onEdit, onView }: ProgramCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])
  const diff = program.difficulty || 'beginner'
  const diffStyle = DIFFICULTY_COLORS[diff] || DIFFICULTY_COLORS[defaultDifficulty]
  return (
    <div
      className={cn(
        'group relative cursor-pointer rounded-xl bg-muted/80 p-5 transition-all duration-200',
        'hover:bg-muted/80 hover:shadow-lg hover:shadow-lime-400/5',
        program.is_featured && 'ring-1 ring-amber-400/30 bg-amber-400/[0.03]',
        isActive && !program.is_featured && 'ring-1 ring-lime-400/30 bg-lime-400/[0.03]',
      )}
      onClick={onSelect}
    >
      {/* Featured indicator bar */}
      {program.is_featured && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-400/60 via-amber-400 to-amber-400/60 rounded-t-xl" />
      )}
      {/* Active indicator bar (if not featured) */}
      {isActive && !program.is_featured && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-lime-400/60 via-lime-400 to-lime-400/60 rounded-t-xl" />
      )}

      {/* Cover image */}
      {program.cover_image_url && (
        <div className="-mx-5 -mt-5 mb-4 h-36 rounded-t-xl overflow-hidden bg-muted">
          <img src={program.cover_image_url} alt={program.name} className="w-full h-full object-cover" />
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className={cn(
          'font-bebas text-xl tracking-wide leading-tight uppercase min-w-0 break-words',
          isActive ? 'text-lime-400' : 'text-foreground group-hover:text-lime-400',
        )}>
          {program.name}
        </h3>
        <div className="flex items-center gap-1.5 shrink-0">
          {program.is_featured && (
            <span className="text-[9px] font-mono tracking-widest text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
              RECOMENDADO
            </span>
          )}
          {program.is_official && !program.is_featured && (
            <span className="text-[9px] font-mono tracking-widest text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
              OFICIAL
            </span>
          )}
          {isActive && (
            <span className="text-[9px] font-mono tracking-widest text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
              ACTIVO
            </span>
          )}
          {(canEdit || (isOwn && onDelete)) && (
            <div ref={menuRef} className="relative" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted-foreground/10 transition-colors"
                aria-label="Más opciones"
              >
                <DotsIcon className="size-3.5" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 min-w-[130px] rounded-lg border border-border bg-popover shadow-lg py-1">
                  {canEdit && onEdit && (
                    <button
                      onClick={() => { setMenuOpen(false); onEdit() }}
                      className="w-full text-left px-3 py-2 text-[12px] font-mono tracking-wide text-foreground hover:bg-muted transition-colors"
                    >
                      Editar
                    </button>
                  )}
                  {onDelete && isOwn && (
                    <button
                      disabled={isActive}
                      onClick={() => {
                        setMenuOpen(false)
                        if (!isActive) setShowDeleteConfirm(true)
                      }}
                      className={cn(
                        'w-full text-left px-3 py-2 text-[12px] font-mono tracking-wide transition-colors',
                        isActive
                          ? 'text-muted-foreground/40 cursor-not-allowed'
                          : 'text-red-400 hover:bg-red-400/10',
                      )}
                    >
                      {isActive ? 'Eliminar (activo)' : 'Eliminar'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      {program.description && (
        <p className="text-[12px] text-muted-foreground leading-relaxed mb-4 line-clamp-2">
          {program.description}
        </p>
      )}

      {/* Meta row */}
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap mb-4">
        {program.duration_weeks > 0 && (
          <span className="text-[10px] font-mono tracking-wide text-muted-foreground uppercase">
            {program.duration_weeks} semanas
          </span>
        )}
        <Badge
          variant="outline"
          className={cn(
            'text-[8px] px-2 py-0.5 font-mono tracking-widest border',
            diffStyle.text, diffStyle.bg, diffStyle.border
          )}
        >
          {DIFFICULTY_LABELS[diff] || diff.toUpperCase()}
        </Badge>
        {isOwn && (
          <span className="text-[10px] font-mono tracking-wide text-sky-400/70">
            Creado por ti
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {isActive ? (
          <Button
            size="sm"
            onClick={(e) => { e.stopPropagation(); onView?.() }}
            className="h-8 px-4 text-[11px] font-bebas tracking-widest bg-emerald-500 hover:bg-emerald-400 text-white"
          >
            ACTIVO — IR A ENTRENAR
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={(e) => { e.stopPropagation(); onSelect() }}
            className="h-8 px-4 text-[11px] font-bebas tracking-widest bg-lime-400 hover:bg-lime-300 text-zinc-900"
          >
            USAR ESTE PROGRAMA
          </Button>
        )}
        {canEdit && onEdit && (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onEdit() }}
            className="h-8 px-3 text-[10px] font-mono tracking-widest border-border text-muted-foreground hover:border-amber-500/50 hover:text-amber-400"
          >
            <EditIcon className="size-3 mr-1.5" />
            EDITAR
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => { e.stopPropagation(); onShare() }}
          className="h-8 px-3 text-[10px] font-mono tracking-widest border-border text-muted-foreground hover:border-pink-500/50 hover:text-pink-400"
        >
          <ShareIcon className="size-3 mr-1.5" />
          COMPARTIR
        </Button>
      </div>

      {onDelete && (
        <ConfirmDialog
          open={showDeleteConfirm}
          onOpenChange={setShowDeleteConfirm}
          title="Eliminar programa"
          description="¿Eliminar este programa? Esta accion no se puede deshacer."
          confirmLabel="ELIMINAR"
          cancelLabel="CANCELAR"
          variant="destructive"
          onConfirm={() => onDelete()}
        />
      )}
    </div>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────

function DotsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <circle cx="8" cy="3" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="8" cy="13" r="1.5" />
    </svg>
  )
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="3" r="2" />
      <circle cx="12" cy="13" r="2" />
      <circle cx="4" cy="8" r="2" />
      <line x1="5.8" y1="7" x2="10.2" y2="4" />
      <line x1="5.8" y1="9" x2="10.2" y2="12" />
    </svg>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="8" y1="3" x2="8" y2="13" />
      <line x1="3" y1="8" x2="13" y2="8" />
    </svg>
  )
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M11.5 2.5l2 2L5 13H3v-2z" />
      <line x1="9.5" y1="4.5" x2="11.5" y2="6.5" />
    </svg>
  )
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="7" cy="7" r="5" />
      <line x1="11" y1="11" x2="15" y2="15" />
    </svg>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

interface ProgramsPageProps {
  programs: ProgramMeta[]
  activeProgram: ProgramMeta | null
  userId?: string
  userRole?: UserRole
  onSelectProgram: (programId: string) => void
  onCreateProgram: () => void
  onDeleteProgram?: (programId: string) => void
  onEditProgram?: (programId: string) => void
  onViewProgram?: (programId: string) => void
}

export default function ProgramsPage({
  programs,
  activeProgram,
  userId,
  userRole = 'user',
  onSelectProgram,
  onCreateProgram,
  onDeleteProgram,
  onEditProgram,
  onViewProgram,
}: ProgramsPageProps) {
  const isAdmin = userRole === 'admin' || userRole === 'editor'
  const [activeFilter, setActiveFilter] = useState<FilterId>('oficiales')
  const [search, setSearch] = useState('')

  const filteredPrograms = useMemo(() => {
    let result = programs
    switch (activeFilter) {
      case 'oficiales':
        result = result.filter(p => p.is_official)
        // Sort: featured first, then alphabetical
        result.sort((a, b) => {
          if (a.is_featured && !b.is_featured) return -1
          if (!a.is_featured && b.is_featured) return 1
          return a.name.localeCompare(b.name)
        })
        break
      case 'comunidad':
        result = result.filter(p => !p.is_official)
        break
      case 'mis':
        result = result.filter(p => p.created_by === userId)
        break
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
      )
    }
    return result
  }, [programs, activeFilter, userId, search])

  const officialCount = useMemo(() => programs.filter(p => p.is_official).length, [programs])
  const communityCount = useMemo(() => programs.filter(p => !p.is_official).length, [programs])
  const myProgramsCount = useMemo(() => programs.filter(p => p.created_by === userId).length, [programs, userId])

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-12 overflow-x-hidden">

      {/* Hero header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div className="min-w-0">
          <h1 className="font-bebas text-4xl sm:text-5xl md:text-7xl leading-none tracking-wide truncate">PROGRAMAS</h1>
          <p className="text-sm text-muted-foreground mt-1 font-mono tracking-wide">
            {filteredPrograms.length} programa{filteredPrograms.length !== 1 ? 's' : ''} disponible{filteredPrograms.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button
          id="tour-create-program"
          onClick={onCreateProgram}
          className="bg-lime-400 hover:bg-lime-300 text-zinc-900 font-bebas text-lg tracking-widest px-6 h-11 shadow-lg shadow-lime-400/10 w-full sm:w-auto shrink-0"
        >
          <PlusIcon className="size-4 mr-2" />
          CREAR PROGRAMA
        </Button>
      </div>

      {/* Explainer for users without active program or new users */}
      {!activeProgram && (
        <div className="mb-6 p-5 rounded-xl border-2 border-dashed border-[hsl(var(--lime))]/30 bg-[hsl(var(--lime))]/5">
          <div className="flex items-start gap-3">
            <div className="text-2xl shrink-0">📋</div>
            <div>
              <div className="font-bebas text-xl text-[hsl(var(--lime))] mb-1">ELIGE UN PROGRAMA PARA EMPEZAR</div>
              <div className="text-sm text-muted-foreground leading-relaxed">
                Un programa es tu <strong className="text-foreground">plan de entrenamiento semanal</strong>.
                Tiene ejercicios para cada día (Push, Pull, Legs...) y fases que van subiendo de dificultad.
                Elige uno y empieza a entrenar hoy.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search bar */}
      <div id="tour-programs-search" className="relative mb-6">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar programas..."
          className="w-full h-12 pl-11 pr-4 rounded-xl bg-muted border border-border text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-lime-400/30 focus:ring-1 focus:ring-lime-400/20 transition-all text-sm"
        />
      </div>

      {/* Filter pills */}
      <div id="tour-programs-filters" className="flex items-center gap-2 mb-8 overflow-x-auto scrollbar-none -mx-4 px-4 md:mx-0 md:px-0">
        {FILTER_PILLS.map(pill => (
          <button
            key={pill.id}
            onClick={() => setActiveFilter(pill.id)}
            className={cn(
              'px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-[11px] sm:text-[12px] font-mono tracking-widest transition-all whitespace-nowrap border uppercase shrink-0',
              activeFilter === pill.id
                ? 'bg-lime-400/10 border-lime-400/30 text-lime-400'
                : 'bg-transparent border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground',
            )}
          >
            {pill.label}
            {pill.id === 'oficiales' && officialCount > 0 && (
              <span className="ml-2 text-[10px] opacity-60">({officialCount})</span>
            )}
            {pill.id === 'comunidad' && communityCount > 0 && (
              <span className="ml-2 text-[10px] opacity-60">({communityCount})</span>
            )}
            {pill.id === 'mis' && myProgramsCount > 0 && (
              <span className="ml-2 text-[10px] opacity-60">({myProgramsCount})</span>
            )}
          </button>
        ))}

        {(activeFilter !== 'oficiales' || search) && (
          <button
            onClick={() => { setActiveFilter('oficiales'); setSearch('') }}
            className="ml-auto text-[11px] font-mono tracking-widest text-muted-foreground/60 hover:text-muted-foreground transition-colors uppercase shrink-0"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Programs Grid */}
      {filteredPrograms.length === 0 ? (
        <div className="text-center py-24">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-muted flex items-center justify-center">
            <svg className="size-8 text-muted-foreground/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <line x1="8" y1="9" x2="16" y2="9" />
              <line x1="8" y1="13" x2="14" y2="13" />
              <line x1="8" y1="17" x2="11" y2="17" />
            </svg>
          </div>
          <p className="text-muted-foreground text-sm mb-2">
            {activeFilter === 'mis'
              ? 'No has creado ningun programa todavia.'
              : search
                ? 'No se encontraron programas con esa busqueda.'
                : 'No hay programas disponibles.'}
          </p>
          {activeFilter === 'mis' && (
            <Button
              variant="outline"
              onClick={onCreateProgram}
              className="mt-4 text-[11px] font-mono tracking-widest border-border hover:border-lime-400/40 hover:text-lime-400"
            >
              <PlusIcon className="size-3 mr-2" />
              CREAR TU PRIMER PROGRAMA
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPrograms.map(program => (
            <ProgramCard
              key={program.id}
              program={program}
              isOwn={program.created_by === userId}
              canEdit={isAdmin || program.created_by === userId}
              isActive={program.id === activeProgram?.id}
              onSelect={() => onSelectProgram(program.id)}
              onShare={() => shareProgram(program.id, program.name)}
              onDelete={onDeleteProgram ? () => onDeleteProgram(program.id) : undefined}
              onEdit={onEditProgram ? () => onEditProgram(program.id) : undefined}
              onView={onViewProgram ? () => onViewProgram(program.id) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}
