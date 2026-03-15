import { useState, useMemo } from 'react'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import type { ProgramMeta } from '../types'

// ── Filter categories ──────────────────────────────────────────────────────

const FILTER_PILLS = [
  { id: 'todos', label: 'Todos' },
  { id: 'mis', label: 'Mis Programas' },
  { id: 'explorar', label: 'Explorar' },
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

interface ProgramCardProps {
  program: ProgramMeta
  isOwn: boolean
  isActive: boolean
  onSelect: () => void
  onShare: () => void
}

function ProgramCard({ program, isOwn, isActive, onSelect, onShare }: ProgramCardProps) {
  return (
    <div
      className={cn(
        'group relative cursor-pointer rounded-xl bg-zinc-900/80 p-5 transition-all duration-200',
        'hover:bg-zinc-800/80 hover:shadow-lg hover:shadow-lime-400/5',
        isActive && 'ring-1 ring-lime-400/30 bg-lime-400/[0.03]',
      )}
      onClick={onSelect}
    >
      {/* Active indicator bar */}
      {isActive && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-lime-400/60 via-lime-400 to-lime-400/60 rounded-t-xl" />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className={cn(
          'font-bebas text-xl tracking-wide leading-tight uppercase',
          isActive ? 'text-lime-400' : 'text-foreground group-hover:text-lime-400',
        )}>
          {program.name}
        </h3>
        {isActive && (
          <span className="shrink-0 text-[9px] font-mono tracking-widest text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
            ACTIVO
          </span>
        )}
      </div>

      {/* Description */}
      {program.description && (
        <p className="text-[12px] text-zinc-400 leading-relaxed mb-4 line-clamp-2">
          {program.description}
        </p>
      )}

      {/* Meta row */}
      <div className="flex items-center gap-3 mb-4">
        {program.duration_weeks > 0 && (
          <span className="text-[10px] font-mono tracking-wide text-zinc-500 uppercase">
            {program.duration_weeks} semanas
          </span>
        )}
        {isOwn && (
          <span className="text-[10px] font-mono tracking-wide text-sky-400/70">
            Creado por ti
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={(e) => { e.stopPropagation() }}
          className="h-8 px-4 text-[11px] font-bebas tracking-widest bg-lime-400 hover:bg-lime-300 text-zinc-900"
        >
          VER
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => { e.stopPropagation(); onShare() }}
          className="h-8 px-3 text-[10px] font-mono tracking-widest border-zinc-700 text-zinc-400 hover:border-pink-500/50 hover:text-pink-400"
        >
          <ShareIcon className="size-3 mr-1.5" />
          COMPARTIR
        </Button>
      </div>
    </div>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────

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
  onSelectProgram: (programId: string) => void
  onCreateProgram: () => void
}

export default function ProgramsPage({
  programs,
  activeProgram,
  userId,
  onSelectProgram,
  onCreateProgram,
}: ProgramsPageProps) {
  const [activeFilter, setActiveFilter] = useState<FilterId>('todos')
  const [search, setSearch] = useState('')

  const filteredPrograms = useMemo(() => {
    let result = programs
    switch (activeFilter) {
      case 'mis':
        result = result.filter(p => p.created_by === userId)
        break
      case 'explorar':
        result = result.filter(p => p.created_by !== userId)
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

  const myProgramsCount = useMemo(() => programs.filter(p => p.created_by === userId).length, [programs, userId])

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-12">

      {/* Hero header */}
      <div className="flex items-end justify-between gap-4 mb-8 flex-wrap">
        <div>
          <h1 className="font-bebas text-5xl md:text-7xl leading-none tracking-wide">PROGRAMAS</h1>
          <p className="text-sm text-zinc-500 mt-1 font-mono tracking-wide">
            {filteredPrograms.length} programa{filteredPrograms.length !== 1 ? 's' : ''} disponible{filteredPrograms.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button
          onClick={onCreateProgram}
          className="bg-lime-400 hover:bg-lime-300 text-zinc-900 font-bebas text-lg tracking-widest px-6 h-11 shadow-lg shadow-lime-400/10"
        >
          <PlusIcon className="size-4 mr-2" />
          CREAR PROGRAMA
        </Button>
      </div>

      {/* Search bar */}
      <div className="relative mb-6">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar programas..."
          className="w-full h-12 pl-11 pr-4 rounded-xl bg-zinc-900 border border-zinc-800 text-foreground placeholder:text-zinc-600 focus:outline-none focus:border-lime-400/30 focus:ring-1 focus:ring-lime-400/20 transition-all text-sm"
        />
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 mb-8">
        {FILTER_PILLS.map(pill => (
          <button
            key={pill.id}
            onClick={() => setActiveFilter(pill.id)}
            className={cn(
              'px-5 py-2.5 rounded-full text-[12px] font-mono tracking-widest transition-all whitespace-nowrap border uppercase',
              activeFilter === pill.id
                ? 'bg-lime-400/10 border-lime-400/30 text-lime-400'
                : 'bg-transparent border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300',
            )}
          >
            {pill.label}
            {pill.id === 'mis' && myProgramsCount > 0 && (
              <span className="ml-2 text-[10px] opacity-60">({myProgramsCount})</span>
            )}
          </button>
        ))}

        {(activeFilter !== 'todos' || search) && (
          <button
            onClick={() => { setActiveFilter('todos'); setSearch('') }}
            className="ml-auto text-[11px] font-mono tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors uppercase"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Programs Grid */}
      {filteredPrograms.length === 0 ? (
        <div className="text-center py-24">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-zinc-900 flex items-center justify-center">
            <svg className="size-8 text-zinc-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <line x1="8" y1="9" x2="16" y2="9" />
              <line x1="8" y1="13" x2="14" y2="13" />
              <line x1="8" y1="17" x2="11" y2="17" />
            </svg>
          </div>
          <p className="text-zinc-400 text-sm mb-2">
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
              className="mt-4 text-[11px] font-mono tracking-widest border-zinc-700 hover:border-lime-400/40 hover:text-lime-400"
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
              isActive={program.id === activeProgram?.id}
              onSelect={() => onSelectProgram(program.id)}
              onShare={() => shareProgram(program.id, program.name)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
