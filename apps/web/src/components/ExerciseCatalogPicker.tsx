/**
 * Picker de ejercicios del catálogo para el editor de programas.
 *
 * Desde el #609 la lista sale de `useCatalogExerciseList()` de core, que fusiona
 * el catálogo empaquetado con `exercises_catalog` de PB por identidad canónica.
 * Antes esto leía PB por su cuenta y, si no respondía, caía a un
 * `extractFallbackCatalog()` local sobre `WORKOUTS` — unas decenas de
 * ejercicios frente a los 1.578 del bundle. `WORKOUTS` sigue estando en la base
 * estática compartida, así que ese suelo no se ha perdido: sólo dejó de ser una
 * lista aparte.
 */
import { useState, useMemo } from 'react'
import { cn } from '../lib/utils'
import { pb } from '@calistenia/core/lib/pocketbase'
import { Button } from './ui/button'
import { Loader } from './ui/loader'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog'
import { useTranslation } from 'react-i18next'
import { useWgerSearch } from '@calistenia/core/hooks/useWgerSearch'
import WgerResultCard from './WgerResultCard'
import type { EditorExercise } from '@calistenia/core/hooks/useProgramEditor'
import { useLocalize } from '@calistenia/core/hooks/useLocalize'
import { useCatalogExerciseList } from '@calistenia/core/hooks/useExerciseCatalog'
import {
  CATALOG_CATEGORIES,
  mapCatalogRecord,
  type CatalogExercise,
} from '@calistenia/core/lib/exerciseCatalog'
import { qk } from '@calistenia/core/lib/query-keys'
import { useQueryClient } from '@tanstack/react-query'

interface ExerciseCatalogPickerProps {
  onAdd: (exercise: EditorExercise) => void
  onClose: () => void
}

/**
 * Etiquetas de las píldoras. Las claves son las categorías canónicas que emite
 * `inferCategory()`; la lista de antes traía `mobility`, que no casaba con el
 * `movilidad` del catálogo, así que esa píldora no podía filtrar nada.
 */
const CATEGORY_LABELS: Record<string, string> = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  core: 'Core',
  lumbar: 'Lumbar',
  full: 'Full',
  movilidad: 'Movilidad',
  skill: 'Skill',
  yoga: 'Yoga',
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-red-400 border-red-400/30',
  med:  'text-amber-400 border-amber-400/30',
  low:  'text-emerald-400 border-emerald-400/30',
}

export default function ExerciseCatalogPicker({ onAdd, onClose }: ExerciseCatalogPickerProps) {
  const { t } = useTranslation()
  const l = useLocalize()
  const { exercises: catalog, loading } = useCatalogExerciseList()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [importedIds, setImportedIds] = useState<Set<number>>(new Set())

  const { wgerResults, wgerLoading, wgerError, searchWger: doWgerSearch, importExercise, importing, clearResults } = useWgerSearch()

  const filtered = useMemo(() => {
    let items = catalog
    if (category !== 'all') {
      items = items.filter(ex => ex.category === category)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter(ex =>
        l(ex.name).toLowerCase().includes(q) ||
        l(ex.muscles).toLowerCase().includes(q)
      )
    }
    // Alfabético en el idioma que se está viendo. El orden lo pone el picker y
    // no core, porque es lo único de esta lista que depende del locale.
    return [...items].sort((a, b) => l(a.name).localeCompare(l(b.name)))
    // `l` cambia de identidad al cambiar de idioma (useLocalize → useCallback
    // sobre el locale): sin él, el buscador seguía filtrando por los nombres
    // del idioma anterior. (#484)
  }, [catalog, search, category, l])

  const handleAdd = (ex: CatalogExercise) => {
    onAdd({
      exerciseId: ex.slug,
      name: l(ex.name),
      sets: ex.sets,
      reps: ex.reps,
      rest: ex.rest,
      muscles: l(ex.muscles),
      note: l(ex.note),
      youtube: ex.youtube,
      priority: ex.priority,
      isTimer: ex.isTimer ?? false,
      timerSeconds: ex.timerSeconds ?? 0,
    })
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-[600px] max-sm:max-w-[95vw] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="font-mono text-[10px] text-muted-foreground tracking-[3px] mb-1">{t('exercisePicker.catalogLabel')}</div>
          <DialogTitle className="font-bebas text-[28px] leading-none">{t('exercisePicker.addExercise')}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {t('exercisePicker.description')}
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <Input
          placeholder={t('exercisePicker.searchPlaceholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="text-sm"
        />

        {/* Category pills */}
        <div className="flex gap-1.5 flex-wrap">
          {['all', ...CATALOG_CATEGORIES].map(cat => (
            <Button
              key={cat}
              variant={category === cat ? 'limeSolid' : 'outline'}
              size="sm"
              onClick={() => setCategory(cat)}
              className="h-7 px-2.5 text-[10px] tracking-wide"
            >
              {cat === 'all' ? 'Todos' : CATEGORY_LABELS[cat] ?? cat}
            </Button>
          ))}
        </div>

        {/* Exercise list */}
        <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6 space-y-1.5">
          {loading ? (
            <Loader label={t('exercisePicker.loading')} className="py-12" />
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground mb-4">{t('exercisePicker.noResults')}</p>
              {search.length >= 3 && wgerResults.length === 0 && (
                <button
                  onClick={() => doWgerSearch(search)}
                  disabled={wgerLoading}
                  className="px-4 py-2 rounded-lg text-xs font-mono tracking-wide bg-sky-500/10 text-sky-400 border border-sky-500/20 hover:bg-sky-500/20 transition-all disabled:opacity-50"
                >
                  {wgerLoading ? t('exercisePicker.searching') : t('exercisePicker.searchWger')}
                </button>
              )}
              {wgerError && wgerResults.length === 0 && !wgerLoading && (
                <p className="text-xs text-muted-foreground/60 mt-2">{wgerError}</p>
              )}
            </div>
          ) : (
            filtered.map(ex => (
              <div
                key={ex.slug}
                className="flex items-center gap-3 px-3 py-2.5 bg-card border border-border rounded-lg hover:border-[hsl(var(--lime))]/25 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-foreground truncate">{l(ex.name)}</span>
                    <Badge variant="outline" className={cn('text-[9px] shrink-0', PRIORITY_COLORS[ex.priority])}>
                      {ex.priority.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {l(ex.muscles)} · {ex.sets}×{ex.reps} · {ex.rest}s
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="limeSolid"
                  onClick={() => handleAdd(ex)}
                  className="h-7 px-3 text-[10px] tracking-wide shrink-0"
                >
                  AGREGAR
                </Button>
              </div>
            ))
          )}
        </div>

        {/* wger results */}
        {wgerResults.length > 0 && (
          <div className="space-y-1.5 -mx-6 px-6 pb-2">
            <div className="flex items-center justify-between pt-2 pb-1">
              <span className="text-[10px] font-mono tracking-widest text-sky-400 uppercase">wger ({wgerResults.length})</span>
              <button onClick={clearResults} className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground">✕</button>
            </div>
            {wgerResults.map(suggestion => (
              <WgerResultCard
                key={suggestion.data.id}
                suggestion={suggestion}
                compact
                importLabel={t('wger.importAndAdd')}
                onImport={async (wgerId) => {
                  try {
                    const recordId = await importExercise(wgerId)
                    setImportedIds(prev => new Set(prev).add(wgerId))
                    // Fetch the created record and add to program
                    const rec = await pb.collection('exercises_catalog').getOne(recordId, { requestKey: null })
                    // Mismo mapper que la lista: antes esto repetía la conversión
                    // a mano y era donde se veía que `timer_seconds` no existe.
                    handleAdd(mapCatalogRecord(rec))
                    // El catálogo está cacheado media hora (#609): sin esto, el
                    // ejercicio recién importado no saldría en la lista al
                    // reabrir el picker.
                    queryClient.invalidateQueries({ queryKey: qk.exerciseCatalog })
                  } catch (err) {
                    console.error('Import failed:', err)
                  }
                }}
                importing={importing.has(suggestion.data.id)}
                imported={importedIds.has(suggestion.data.id)}
              />
            ))}
          </div>
        )}

        {/* Footer count */}
        <div className="text-[10px] text-muted-foreground text-center pt-1">
          {filtered.length} ejercicio{filtered.length !== 1 ? 's' : ''}
        </div>
      </DialogContent>
    </Dialog>
  )
}
