/**
 * Paso 1 del editor de programas web (#223/#478): información básica.
 * Extraído de ProgramEditorPage.tsx:237-320, sin cambios de markup.
 *
 * La segunda tarjeta («catálogo y recomendación», #613) expone los campos que
 * `lib/matchPrograms.ts` necesita para poder recomendar el programa. Hasta que
 * existió solo se podían fijar por script, así que ningún programa creado desde
 * aquí entraba nunca en el «PARA TI» del onboarding.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import type { ProgramEditorState } from '@calistenia/core/hooks/useProgramEditor'
import {
  coverObjectPosition,
  focusFromPoint,
  formatCoverFocus,
  nudgeCoverFocus,
  parseCoverFocus,
  type CoverFocus,
} from '@calistenia/core/lib/coverFocus'
import { COVER_ACCEPT, pickCover } from '../../lib/program-media'

/** Dirección de cada flecha al mover el foco con teclado. */
const FOCUS_KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

/**
 * Los recortes reales de la portada: 16:9 en la tarjeta del catálogo y en la
 * ficha de móvil, 2:1 en la ficha de escritorio (`ProgramCover`).
 */
const CROP_PREVIEWS = [
  { label: '16:9', className: 'aspect-video w-32' },
  { label: '2:1', className: 'aspect-[2/1] w-36' },
] as const
import { EQUIPMENT_CATALOG, getEquipmentLabelKey } from '@calistenia/core/lib/equipment'
import { CONDITION_IDS, INJURY_IDS } from '@calistenia/core/types/onboarding'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { Card, CardContent } from '../ui/card'

const GOAL_TYPES = ['fat_loss', 'muscle_gain', 'maintain', 'skill'] as const
const SKILLS = ['pull_up', 'handstand', 'muscle_up', 'planche'] as const
const INTENSITIES = ['light', 'moderate', 'intense'] as const
const DAYS_PER_WEEK = [1, 2, 3, 4, 5, 6, 7] as const

/**
 * Vocabulario de `contraindications`: la unión de lesiones y condiciones, que
 * es exactamente contra lo que `matchPrograms` cruza el historial de salud del
 * usuario. Se deduplica porque `other` aparece en las dos listas.
 */
const CONTRAINDICATION_IDS: string[] = [
  ...INJURY_IDS,
  ...CONDITION_IDS.filter(c => !(INJURY_IDS as readonly string[]).includes(c)),
]

function contraindicationLabelKey(id: string): string {
  return (INJURY_IDS as readonly string[]).includes(id)
    ? `onboarding.injuries.${id}`
    : `onboarding.conditions.${id}`
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter(x => x !== id) : [...list, id]
}

const LABEL_CLASS = 'text-[11px] text-muted-foreground tracking-widest uppercase block mb-1.5'
const HELP_CLASS = 'text-[11px] text-muted-foreground mt-1.5'

/**
 * A nivel de módulo a propósito: declarada dentro de `StepInfo` sería un tipo
 * de componente nuevo en cada render y React desmontaría y remontaría todos los
 * chips en cada pulsación.
 */
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-lg text-[11px] font-mono tracking-widest border transition-all uppercase',
        active
          ? 'bg-[hsl(var(--lime))]/10 border-[hsl(var(--lime))]/30 text-[hsl(var(--lime))]'
          : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

/**
 * Selector de portada (#618). A nivel de módulo por lo mismo que `Chip`: dentro
 * de `StepInfo` sería un tipo de componente nuevo en cada render y React
 * remontaría el `<input type=file>`, perdiendo la selección en curso.
 */
function CoverPicker({
  info,
  updateInfo,
}: {
  info: ProgramEditorState['info']
  updateInfo: (info: Partial<ProgramEditorState['info']>) => void
}) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)

  // La vista previa de un fichero recién elegido es un blob URL, y hay que
  // revocarlo o el navegador se queda con la imagen entera en memoria mientras
  // viva la pestaña.
  useEffect(() => {
    if (!info.coverFile) {
      setLocalPreview(null)
      return
    }
    const url = URL.createObjectURL(info.coverFile.blob)
    setLocalPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [info.coverFile])

  // Lo elegido ahora gana a lo que hay en el servidor; si se ha quitado, no se
  // enseña nada aunque el registro todavía tenga fichero.
  const preview = localPreview || (info.coverRemoved ? null : info.coverUrl)

  const handleFile = (file: File | undefined) => {
    if (!file) return
    const result = pickCover(file)
    if (!result.ok) {
      setError(t(result.reason === 'size' ? 'programEditor.coverTooLarge' : 'programEditor.coverUnsupported'))
      return
    }
    setError(null)
    // Foco a cero: el de la foto anterior no dice nada de esta.
    updateInfo({ coverFile: result.file, coverRemoved: false, coverFocus: '' })
  }

  const handleRemove = () => {
    setError(null)
    // `coverRemoved` solo tiene efecto sobre lo que YA está en el servidor;
    // descartar un fichero recién elegido es simplemente soltarlo.
    updateInfo({ coverFile: null, coverRemoved: true, coverFocus: '' })
    if (inputRef.current) inputRef.current.value = ''
  }

  const focus = parseCoverFocus(info.coverFocus)
  const setFocus = (next: CoverFocus) => updateInfo({ coverFocus: formatCoverFocus(next) })

  const handleFocusKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = FOCUS_KEYS[e.key]
    if (!delta) return
    e.preventDefault()
    const step = e.shiftKey ? 10 : 2
    setFocus(nudgeCoverFocus(focus, delta[0] * step, delta[1] * step))
  }

  return (
    <div>
      <label className={LABEL_CLASS} htmlFor="pe-cover">{t('programEditor.coverLabel')}</label>
      {preview ? (
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start">
          {/* La foto ENTERA, sin recortar: se pulsa donde está lo importante y
              el punto blanco marca el foco. Con teclado, flechas (Mayús = paso
              largo). */}
          <div
            role="group"
            tabIndex={0}
            aria-label={t('programEditor.coverFocusLabel')}
            aria-describedby="pe-cover-focus-hint"
            onKeyDown={handleFocusKey}
            className="relative self-start overflow-hidden rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--lime))]"
          >
            <img
              src={preview}
              alt={t('programEditor.coverPreviewAlt')}
              draggable={false}
              onClick={e => {
                const r = e.currentTarget.getBoundingClientRect()
                setFocus(focusFromPoint(e.clientX - r.left, e.clientY - r.top, r.width, r.height))
              }}
              className="block max-h-56 max-w-full cursor-crosshair select-none"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,0.45)]"
              style={{ left: `${focus.x}%`, top: `${focus.y}%` }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {t('programEditor.coverFocusPreview')}
            </span>
            <div className="flex items-start gap-2">
              {CROP_PREVIEWS.map(crop => (
                <div key={crop.label} className="flex flex-col gap-1">
                  <div className={cn('overflow-hidden rounded-md border border-border bg-muted', crop.className)}>
                    <img
                      src={preview}
                      alt=""
                      className="size-full object-cover"
                      style={{ objectPosition: coverObjectPosition(info.coverFocus) }}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">{crop.label}</span>
                </div>
              ))}
            </div>
            <span id="pe-cover-focus-hint" className="max-w-xs text-[11px] text-muted-foreground">
              {t('programEditor.coverFocusHint')}
            </span>
          </div>
        </div>
      ) : (
        <div className="mb-3 flex h-24 w-40 items-center justify-center rounded-lg border border-dashed border-border text-[10px] uppercase tracking-widest text-muted-foreground">
          {t('programEditor.coverEmpty')}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <input
          ref={inputRef}
          id="pe-cover"
          type="file"
          accept={COVER_ACCEPT}
          onChange={e => handleFile(e.target.files?.[0])}
          className="text-[11px] file:mr-2 file:rounded-md file:border file:border-border file:bg-transparent file:px-2.5 file:py-1 file:text-[10px] file:uppercase file:tracking-widest file:text-foreground"
        />
        {preview && info.coverFocus && (
          <button
            type="button"
            onClick={() => updateInfo({ coverFocus: '' })}
            className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            {t('programEditor.coverFocusReset')}
          </button>
        )}
        {preview && (
          <button
            type="button"
            onClick={handleRemove}
            className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-red-400"
          >
            {t('programEditor.coverRemove')}
          </button>
        )}
      </div>
      {error
        ? <div className="mt-1.5 text-[11px] text-red-400" role="alert">{error}</div>
        : <div className={HELP_CLASS}>{t('programEditor.coverDesc')}</div>}
    </div>
  )
}

interface StepInfoProps {
  info: ProgramEditorState['info']
  updateInfo: (info: Partial<ProgramEditorState['info']>) => void
  redistributeWeeks: () => void
  canPublishOfficial: boolean
  /** Días de entrenamiento contados en la fase 1, para enseñar qué haría el modo automático. */
  derivedDaysPerWeek: number
}

export function StepInfo({ info, updateInfo, redistributeWeeks, canPublishOfficial, derivedDaysPerWeek }: StepInfoProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5 md:p-6 space-y-4">
          <div className="font-bebas text-2xl tracking-wide">{t('programEditor.programInfo')}</div>

          <div>
            <label className="text-[11px] text-muted-foreground tracking-widest uppercase block mb-1.5">{t('programEditor.nameLabel')}</label>
            <Input
              value={info.name}
              onChange={e => updateInfo({ name: e.target.value })}
              placeholder={t('programEditor.namePlaceholder')}
              className="text-sm"
            />
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground tracking-widest uppercase block mb-1.5">{t('programEditor.descLabel')}</label>
            <Textarea
              value={info.description}
              onChange={e => updateInfo({ description: e.target.value })}
              placeholder={t('programEditor.descPlaceholder')}
              rows={3}
              className="text-sm"
            />
          </div>

          <CoverPicker info={info} updateInfo={updateInfo} />

          <div>
            <label className={LABEL_CLASS} htmlFor="pe-instructions">{t('programEditor.instructionsLabel')}</label>
            <Textarea
              id="pe-instructions"
              value={info.instructions}
              onChange={e => updateInfo({ instructions: e.target.value })}
              placeholder={t('programEditor.instructionsPlaceholder')}
              rows={5}
              className="text-sm"
            />
            <div className={HELP_CLASS}>{t('programEditor.instructionsDesc')}</div>
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground tracking-widest uppercase block mb-1.5">{t('programEditor.durationLabel')}</label>
            <Input
              type="number"
              min={1}
              max={104}
              value={info.durationWeeks}
              onChange={e => updateInfo({ durationWeeks: parseInt(e.target.value) || 1 })}
              onBlur={redistributeWeeks}
              className="text-sm w-32"
            />
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground tracking-widest uppercase block mb-1.5">{t('programEditor.difficultyLabel')}</label>
            <div className="flex gap-2">
              {(['beginner', 'intermediate', 'advanced'] as const).map(d => (
                <button
                  key={d}
                  onClick={() => updateInfo({ difficulty: d })}
                  className={cn(
                    'px-4 py-2 rounded-lg text-[11px] font-mono tracking-widest border transition-all uppercase',
                    info.difficulty === d
                      ? d === 'beginner' ? 'bg-emerald-400/10 border-emerald-400/30 text-emerald-400'
                        : d === 'intermediate' ? 'bg-amber-400/10 border-amber-400/30 text-amber-400'
                        : 'bg-red-400/10 border-red-400/30 text-red-400'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t(`difficulty.${d}`)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground tracking-widest uppercase block mb-1.5">{t('programEditor.visibilityLabel')}</label>
            <div className="flex gap-2">
              {(['private', 'link', 'public'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => updateInfo({ visibility: v })}
                  className={cn(
                    'px-4 py-2 rounded-lg text-[11px] font-mono tracking-widest border transition-all uppercase',
                    info.visibility === v
                      ? 'bg-[hsl(var(--lime))]/10 border-[hsl(var(--lime))]/30 text-[hsl(var(--lime))]'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t(`programEditor.visibility.${v}`)}
                </button>
              ))}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1.5">
              {t(`programEditor.visibilityDesc.${info.visibility}`)}
            </div>
          </div>

          {canPublishOfficial && (
            <div className="pt-2 border-t border-border">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={info.isOfficial}
                  onChange={e => updateInfo({ isOfficial: e.target.checked })}
                  className="size-4 rounded accent-[hsl(var(--lime))]"
                />
                <div>
                  <div className="text-sm font-medium">{t('programEditor.publishOfficial')}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {t('programEditor.publishDesc')}
                  </div>
                </div>
              </label>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 md:p-6 space-y-4">
          <div>
            <div className="font-bebas text-2xl tracking-wide">{t('programEditor.catalogTitle')}</div>
            <div className="text-[11px] text-muted-foreground mt-1">{t('programEditor.catalogDesc')}</div>
          </div>

          <div>
            <label className={LABEL_CLASS}>{t('programEditor.goalLabel')}</label>
            <div className="flex flex-wrap gap-2">
              <Chip active={info.goalType === ''} onClick={() => updateInfo({ goalType: '', skill: '' })}>
                {t('programEditor.unset')}
              </Chip>
              {GOAL_TYPES.map(g => (
                <Chip
                  key={g}
                  active={info.goalType === g}
                  // La skill se limpia aquí, en el estado, y no solo al guardar:
                  // si no, volver a «habilidad» reaparecería con la marca vieja
                  // ya seleccionada sin que el autor la haya vuelto a elegir.
                  onClick={() => updateInfo({ goalType: g, skill: g === 'skill' ? info.skill : '' })}
                >
                  {t(`programEditor.goal.${g}`)}
                </Chip>
              ))}
            </div>
          </div>

          {info.goalType === 'skill' && (
            <div>
              <label className={LABEL_CLASS}>{t('programEditor.skillLabel')}</label>
              <div className="flex flex-wrap gap-2">
                {SKILLS.map(sk => (
                  <Chip key={sk} active={info.skill === sk} onClick={() => updateInfo({ skill: sk })}>
                    {t(`onboarding.focus.${sk}`)}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className={LABEL_CLASS}>{t('programEditor.intensityLabel')}</label>
            <div className="flex flex-wrap gap-2">
              <Chip active={info.intensity === ''} onClick={() => updateInfo({ intensity: '' })}>
                {t('programEditor.unset')}
              </Chip>
              {INTENSITIES.map(i => (
                <Chip key={i} active={info.intensity === i} onClick={() => updateInfo({ intensity: i })}>
                  {t(`programEditor.intensity.${i}`)}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>{t('programEditor.daysPerWeekLabel')}</label>
            <div className="flex flex-wrap gap-2">
              <Chip active={info.daysPerWeek === null} onClick={() => updateInfo({ daysPerWeek: null })}>
                {t('programEditor.daysPerWeekAuto', { n: derivedDaysPerWeek })}
              </Chip>
              {DAYS_PER_WEEK.map(n => (
                <Chip key={n} active={info.daysPerWeek === n} onClick={() => updateInfo({ daysPerWeek: n })}>
                  {n}
                </Chip>
              ))}
            </div>
            <div className={HELP_CLASS}>{t('programEditor.daysPerWeekDesc')}</div>
          </div>

          <div>
            <label className={LABEL_CLASS}>{t('programEditor.equipmentLabel')}</label>
            <div className="flex flex-wrap gap-2">
              {EQUIPMENT_CATALOG.map(eq => (
                <Chip
                  key={eq.id}
                  active={info.equipmentRequired.includes(eq.id)}
                  onClick={() => updateInfo({ equipmentRequired: toggle(info.equipmentRequired, eq.id) })}
                >
                  {eq.icon} {t(getEquipmentLabelKey(eq.id))}
                </Chip>
              ))}
            </div>
            <div className={HELP_CLASS}>{t('programEditor.equipmentDesc')}</div>
          </div>

          <div>
            <label className={LABEL_CLASS}>{t('programEditor.contraindicationsLabel')}</label>
            <div className="flex flex-wrap gap-2">
              {CONTRAINDICATION_IDS.map(id => (
                <Chip
                  key={id}
                  active={info.contraindications.includes(id)}
                  onClick={() => updateInfo({ contraindications: toggle(info.contraindications, id) })}
                >
                  {t(contraindicationLabelKey(id))}
                </Chip>
              ))}
            </div>
            <div className={HELP_CLASS}>{t('programEditor.contraindicationsDesc')}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
