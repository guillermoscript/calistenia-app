import { useState } from 'react'
import { cn } from '../lib/utils'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog'

export default function ProgramSelectorModal({ programs, activeProgram, onSelect, onClose }) {
  const [pending, setPending] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSelectClick = (programId) => {
    if (programId === activeProgram?.id) return
    setPending(programId)
  }

  const handleConfirm = async () => {
    if (!pending) return
    setLoading(true)
    try {
      await onSelect(pending)
    } finally {
      setLoading(false)
      setPending(null)
    }
  }

  const handleCancel = () => setPending(null)

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <div className="font-mono text-[10px] text-muted-foreground tracking-[3px] mb-1">CATÁLOGO DE PROGRAMAS</div>
          <DialogTitle className="font-bebas text-[32px] leading-none">SELECCIONA PROGRAMA</DialogTitle>
        </DialogHeader>

        {pending ? (
          <div className="px-5 py-5 bg-[hsl(var(--lime))]/5 border border-[hsl(var(--lime))]/20 rounded-lg">
            <div className="font-mono text-[11px] text-[hsl(var(--lime))] tracking-[1.5px] mb-2.5">
              CONFIRMAR CAMBIO DE PROGRAMA
            </div>
            <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">
              Vas a cambiar al programa{' '}
              <strong className="text-foreground">{programs.find(p => p.id === pending)?.name}</strong>.
              <br />
              Tu historial actual se conservará de forma separada.
              Podrás volver a este programa en cualquier momento.
            </p>
            <div className="flex gap-2.5">
              <Button
                onClick={handleConfirm}
                disabled={loading}
                className="font-bebas text-lg tracking-wide"
              >
                {loading ? 'CAMBIANDO...' : 'CONFIRMAR'}
              </Button>
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={loading}
                className="font-mono text-[11px] tracking-wide"
              >
                CANCELAR
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {programs.map(prog => {
              const isActive = prog.id === activeProgram?.id
              return (
                <div
                  key={prog.id}
                  onClick={() => !isActive && handleSelectClick(prog.id)}
                  className={cn(
                    'px-4 py-4 rounded-lg border transition-colors duration-150',
                    isActive
                      ? 'bg-[hsl(var(--lime))]/5 border-[hsl(var(--lime))]/30 cursor-default'
                      : 'bg-card border-border cursor-pointer hover:border-[hsl(var(--lime))]/25',
                  )}
                >
                  <div className={cn('flex justify-between items-center', prog.description && 'mb-1.5')}>
                    <div className={cn('font-bebas text-xl tracking-wide', isActive ? 'text-[hsl(var(--lime))]' : 'text-foreground')}>
                      {prog.name}
                    </div>
                    <div className="flex gap-2 items-center">
                      {prog.duration_weeks && (
                        <span className="font-mono text-[10px] text-muted-foreground">{prog.duration_weeks}W</span>
                      )}
                      {isActive && (
                        <Badge variant="outline" className="font-mono text-[10px] text-emerald-400 border-emerald-400/30">
                          ACTIVO
                        </Badge>
                      )}
                    </div>
                  </div>
                  {prog.description && (
                    <div className="text-[12px] text-muted-foreground leading-relaxed">{prog.description}</div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            className="w-full font-mono text-[11px] tracking-wide"
          >
            CERRAR
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
