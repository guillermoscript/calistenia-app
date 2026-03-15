import { useState, useMemo } from 'react'
import { cn } from '../lib/utils'
import { Card, CardContent } from '../components/ui/card'
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
    <Card
      className={cn(
        'cursor-pointer transition-all duration-200 hover:border-[hsl(var(--lime))]/30 hover:shadow-lg hover:shadow-lime/5 group',
        isActive && 'border-[hsl(var(--lime))]/40 bg-[hsl(var(--lime))]/[0.03]',
      )}
      onClick={onSelect}
    >
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className={cn(
            'font-bebas text-xl tracking-wide leading-tight',
            isActive ? 'text-[hsl(var(--lime))]' : 'text-foreground group-hover:text-[hsl(var(--lime))]',
          )}>
            {program.name}
          </h3>
          <div className="flex items-center gap-1.5 shrink-0">
            {isActive && (
              <Badge variant="outline" className="text-[9px] text-emerald-400 border-emerald-400/30 font-mono">
                ACTIVO
              </Badge>
            )}
          </div>
        </div>

        {/* Description */}
        {program.description && (
          <p className="text-[12px] text-muted-foreground leading-relaxed mb-3 line-clamp-2">
            {program.description}
          </p>
        )}

        {/* Badges row */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {program.duration_weeks > 0 && (
            <Badge variant="secondary" className="text-[10px] font-mono bg-zinc-800 text-zinc-300 border-zinc-700">
              {program.duration_weeks} semanas
            </Badge>
          )}
          {isOwn && (
            <Badge variant="secondary" className="text-[10px] font-mono bg-sky-500/10 text-sky-400 border-sky-500/20">
              Creado por ti
            </Badge>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onShare() }}
            className="h-7 px-2.5 text-[10px] tracking-wide hover:border-pink-500 hover:text-pink-500"
          >
            <ShareIcon className="size-3 mr-1" />
            COMPARTIR
          </Button>
        </div>
      </CardContent>
    </Card>
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

  const filteredPrograms = useMemo(() => {
    switch (activeFilter) {
      case 'mis':
        return programs.filter(p => p.created_by === userId)
      case 'explorar':
        return programs.filter(p => p.created_by !== userId)
      default:
        return programs
    }
  }, [programs, activeFilter, userId])

  const myProgramsCount = useMemo(() => programs.filter(p => p.created_by === userId).length, [programs, userId])

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-1 uppercase">Catálogo</div>
          <h1 className="font-bebas text-4xl md:text-5xl leading-none">PROGRAMAS</h1>
        </div>
        <Button
          onClick={onCreateProgram}
          className="bg-[hsl(var(--lime))] hover:bg-[hsl(var(--lime))]/90 text-zinc-900 font-bebas text-lg tracking-wide px-5"
        >
          <PlusIcon className="size-4 mr-1.5" />
          CREAR PROGRAMA
        </Button>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
        {FILTER_PILLS.map(pill => (
          <button
            key={pill.id}
            onClick={() => setActiveFilter(pill.id)}
            className={cn(
              'px-4 py-1.5 rounded-full text-[11px] font-mono tracking-wide transition-all whitespace-nowrap border',
              activeFilter === pill.id
                ? 'bg-[hsl(var(--lime))]/10 border-[hsl(var(--lime))]/30 text-[hsl(var(--lime))]'
                : 'bg-transparent border-border text-muted-foreground hover:border-[hsl(var(--lime))]/20 hover:text-foreground',
            )}
          >
            {pill.label}
            {pill.id === 'mis' && myProgramsCount > 0 && (
              <span className="ml-1.5 text-[10px] opacity-60">({myProgramsCount})</span>
            )}
          </button>
        ))}
      </div>

      {/* Programs Grid */}
      {filteredPrograms.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-muted-foreground text-sm mb-4">
            {activeFilter === 'mis'
              ? 'No has creado ningún programa todavía.'
              : 'No hay programas disponibles.'}
          </div>
          {activeFilter === 'mis' && (
            <Button
              variant="outline"
              onClick={onCreateProgram}
              className="text-[11px] tracking-widest hover:border-[hsl(var(--lime))] hover:text-[hsl(var(--lime))]"
            >
              + CREAR TU PRIMER PROGRAMA
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

      {/* Summary */}
      <div className="mt-8 text-center">
        <div className="text-[10px] text-muted-foreground tracking-widest uppercase">
          {filteredPrograms.length} programa{filteredPrograms.length !== 1 ? 's' : ''} disponible{filteredPrograms.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  )
}
