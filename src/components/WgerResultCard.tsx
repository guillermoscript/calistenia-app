import { cn } from '../lib/utils'
import type { WgerSearchSuggestion } from '../lib/wger'

interface WgerResultCardProps {
  suggestion: WgerSearchSuggestion
  onImport: (wgerId: number) => void
  importing: boolean
  imported: boolean
  /** Compact mode for picker dialogs */
  compact?: boolean
  /** Extra label for the import button */
  importLabel?: string
}

export default function WgerResultCard({
  suggestion,
  onImport,
  importing,
  imported,
  compact = false,
  importLabel = 'IMPORTAR',
}: WgerResultCardProps) {
  const { id, name, category } = suggestion.data

  if (compact) {
    return (
      <div className="flex items-center gap-3 px-3 py-2.5 border border-dashed border-sky-500/30 bg-sky-500/5 rounded-lg">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-foreground truncate">{name}</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 font-mono tracking-wider shrink-0">
              WGER
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {category.name}
          </div>
        </div>
        <button
          onClick={() => onImport(id)}
          disabled={importing || imported}
          className={cn(
            'h-7 px-3 text-[10px] tracking-wide font-medium rounded-md shrink-0 transition-all',
            imported
              ? 'bg-emerald-500/15 text-emerald-400 cursor-default'
              : importing
                ? 'bg-muted text-muted-foreground cursor-wait'
                : 'bg-sky-500/15 text-sky-400 hover:bg-sky-500/25 active:scale-95'
          )}
        >
          {imported ? '✓' : importing ? '...' : importLabel}
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => !imported && !importing && onImport(id)}
      disabled={importing || imported}
      className={cn(
        'group text-left rounded-xl overflow-hidden transition-all duration-200 focus:outline-none border-2 border-dashed',
        imported
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : importing
            ? 'border-sky-500/20 bg-sky-500/5 cursor-wait'
            : 'border-sky-500/30 bg-sky-500/5 hover:border-sky-400/50 hover:bg-sky-500/10 focus:ring-1 focus:ring-sky-400/30'
      )}
    >
      {/* Placeholder thumbnail */}
      <div className="h-24 bg-sky-500/5 flex items-center justify-center relative">
        <svg className="size-8 text-sky-400/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v8M8 12h8" />
        </svg>
        <span className="absolute top-2 right-2 text-[9px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 font-mono tracking-wider">
          WGER
        </span>
      </div>

      <div className="p-4">
        <div className="flex items-start gap-2.5 mb-2">
          <div className="size-2 rounded-full mt-1.5 flex-shrink-0 bg-sky-400" />
          <span className="font-bebas text-lg tracking-wide leading-tight line-clamp-2 group-hover:text-sky-400 transition-colors duration-150 uppercase">
            {name}
          </span>
        </div>

        <p className="text-[11px] text-muted-foreground line-clamp-1 mb-3 pl-[18px]">
          {category.name}
        </p>

        <div className="flex items-center justify-between gap-2 pl-[18px]">
          <span className="text-[9px] px-2 py-0.5 font-mono tracking-widest border rounded-full text-sky-400 bg-sky-500/10 border-sky-500/20">
            {category.name.toUpperCase()}
          </span>
          <span className={cn(
            'text-[11px] font-bebas tracking-wide',
            imported ? 'text-emerald-400' : importing ? 'text-muted-foreground' : 'text-sky-400'
          )}>
            {imported ? '✓ IMPORTADO' : importing ? 'IMPORTANDO...' : 'IMPORTAR →'}
          </span>
        </div>
      </div>
    </button>
  )
}
