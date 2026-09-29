import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { PHASES as FALLBACK_PHASES } from '@calistenia/core/data/workouts'
import { PHASE_COLORS } from '@calistenia/core/lib/style-tokens'
import { useWorkoutState, useWorkoutActions } from '../../contexts/WorkoutContext'
import { useAuthState } from '../../contexts/AuthContext'
import ProgramSelectorModal from '../ProgramSelectorModal'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'

/**
 * Cambiar de programa desde cualquier pantalla (#856). Lo que antes solo vivía
 * en la «Configuración» del inicio: el modal de programas con su toast y los
 * atajos a duplicar y editar.
 */
export function useProgramSwitcher() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { userId } = useAuthState()
  const { programs, activeProgram } = useWorkoutState()
  const { selectProgram, duplicateProgram } = useWorkoutActions()
  const [open, setOpen] = useState(false)

  const modal = open ? (
    <ProgramSelectorModal
      programs={programs}
      activeProgram={activeProgram}
      onSelect={async (id: string) => {
        const ok = await selectProgram(id)
        if (ok) {
          toast.success(t('programs.switchSuccess'))
          setOpen(false)
        } else {
          toast.error(t('programs.switchError'))
        }
        return ok
      }}
      onClose={() => setOpen(false)}
      onDuplicate={async (id: string) => {
        setOpen(false)
        const newId = await duplicateProgram(id)
        if (newId) navigate(`/programs/${newId}/edit`)
      }}
      onEdit={(id: string) => { setOpen(false); navigate(`/programs/${id}/edit`) }}
      userId={userId ?? undefined}
    />
  ) : null

  return { openSwitcher: useCallback(() => setOpen(true), []), switcherModal: modal }
}

/**
 * Programa y fase, para Perfil: cambiar o crear programa y fijar la fase a mano.
 *
 * La fase manual se guarda en `user_programs.current_phase` (#616). Sin
 * programa activo `setPhaseOverride` no tiene dónde escribir, así que cae a
 * `settings.phase`, que es de donde la lee el fallback del hook.
 */
export function ProgramPhaseControls() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { activeProgram, phases, programProgress } = useWorkoutState()
  const { setPhaseOverride, updateSettings } = useWorkoutActions()
  const { openSwitcher, switcherModal } = useProgramSwitcher()
  const PHASES = phases || FALLBACK_PHASES

  const selectPhase = useCallback(async (phaseId: number) => {
    const saved = await setPhaseOverride(phaseId)
    if (!saved) await updateSettings({ phase: phaseId })
  }, [setPhaseOverride, updateSettings])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-muted-foreground tracking-widest uppercase">{t('dashboard.program')}</div>
          <div className="font-bebas text-xl truncate">{activeProgram?.name ?? t('train.noProgram')}</div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={openSwitcher} className="h-10 sm:h-8">
            {t('train.change')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/programs/new')} className="h-10 sm:h-8">
            {t('dashboard.createProgram')}
          </Button>
        </div>
      </div>
      {activeProgram && PHASES.length > 1 ? (
        <div>
          <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-2">{t('profile.jumpToPhase')}</div>
          <div className="flex gap-2 flex-wrap" role="group" aria-label={t('profile.jumpToPhase')}>
            {PHASES.map(p => {
              const isSelected = programProgress.currentPhase === p.id
              const accent = PHASE_COLORS[p.id] || PHASE_COLORS[1]
              return (
                <Button
                  key={p.id} variant="outline" size="sm"
                  onClick={() => selectPhase(p.id)} aria-pressed={isSelected}
                  className={cn('h-10 sm:h-8 px-3 text-xs', isSelected && cn('border-current', accent.text))}
                >
                  F{p.id} · {p.nameKey ? t(p.nameKey) : p.name}
                </Button>
              )
            })}
          </div>
        </div>
      ) : null}
      {switcherModal}
    </div>
  )
}
