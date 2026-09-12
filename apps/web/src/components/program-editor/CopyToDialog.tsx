/**
 * «Copiar a…» del editor web (#621): elegir a qué día —o a qué fase— se
 * vuelca lo que ya está montado.
 *
 * Es un componente y no un menú suelto en cada paso porque el paso 3 y el
 * paso 4 ofrecen la misma acción, y porque el aviso de que copiar **reemplaza
 * y no fusiona** tiene que salir igual en los dos sitios.
 *
 * La confirmación vive dentro de este mismo diálogo en vez de abrir un
 * `ConfirmDialog` encima: apilar dos modales de Radix deja el foco atrapado en
 * el de abajo cuando el de arriba se cierra.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog'
import { Button } from '../ui/button'

export interface CopyTargetOption {
  /** Lo que se devuelve al elegir: la clave del día o el índice de la fase. */
  id: string
  label: string
  /** Título del grupo bajo el que se lista la opción (la fase, para los días). */
  group?: string
  /** Ejercicios que ya hay en el destino; 0 se pinta como «vacío». */
  exerciseCount: number
}

interface CopyToDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  targets: CopyTargetOption[]
  onSelect: (id: string) => void
}

export function CopyToDialog({ open, onOpenChange, title, description, targets, onSelect }: CopyToDialogProps) {
  const { t } = useTranslation()
  const [pending, setPending] = useState<CopyTargetOption | null>(null)

  // Cerrar y volver a abrir no debe reaparecer con la confirmación a medias.
  useEffect(() => {
    if (!open) setPending(null)
  }, [open])

  const choose = (target: CopyTargetOption) => {
    // Pisar un destino vacío no destruye nada: no hay nada que confirmar.
    if (target.exerciseCount === 0) {
      onSelect(target.id)
      onOpenChange(false)
      return
    }
    setPending(target)
  }

  const confirm = () => {
    if (!pending) return
    onSelect(pending.id)
    onOpenChange(false)
  }

  // Los grupos se pintan en el orden en que aparecen, que es el de
  // `copyDayTargets`: fase por fase y, dentro, en el orden de la semana.
  const groups: { name?: string; options: CopyTargetOption[] }[] = []
  for (const target of targets) {
    const last = groups[groups.length - 1]
    if (last && last.name === target.group) last.options.push(target)
    else groups.push({ name: target.group, options: [target] })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] max-sm:max-w-[92vw]">
        {pending ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-bebas text-[26px] tracking-[2px]">
                {t('programEditor.copy.overwriteTitle', { target: pending.label })}
              </DialogTitle>
              <DialogDescription className="text-[13px] leading-relaxed">
                {t('programEditor.copy.overwriteBody', { target: pending.label })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col gap-2.5 sm:flex-col pt-2">
              <Button onClick={confirm} variant="limeSolid" className="font-bebas text-lg tracking-wide">
                {t('programEditor.copy.overwriteConfirm')}
              </Button>
              <Button onClick={() => setPending(null)} variant="ghost" className="text-xs tracking-wide">
                {t('common.cancel')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-bebas text-[26px] tracking-[2px]">{title}</DialogTitle>
              <DialogDescription className="text-[13px] leading-relaxed">
                {description}
                <span className="mt-1.5 block text-muted-foreground/70">{t('programEditor.copy.mediaNote')}</span>
              </DialogDescription>
            </DialogHeader>

            {targets.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {t('programEditor.copy.noTargets')}
              </div>
            ) : (
              <div className="max-h-[52vh] space-y-3 overflow-y-auto">
                {groups.map((group, gi) => (
                  <div key={group.name ?? gi} className="space-y-1">
                    {group.name && (
                      <div className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
                        {group.name}
                      </div>
                    )}
                    {group.options.map(option => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => choose(option)}
                        className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-left text-sm transition-colors hover:border-lime/40 hover:bg-lime/5"
                      >
                        <span className="flex-1 truncate">{option.label}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {option.exerciseCount === 0
                            ? t('programEditor.copy.empty')
                            : t('programEditor.copy.exerciseCount', { count: option.exerciseCount })}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
