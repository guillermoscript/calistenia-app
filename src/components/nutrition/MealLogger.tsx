import { useState, useCallback } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../ui/dialog'
import MealLoggerContent from './MealLoggerContent'
import type { MealLoggerContentProps } from './MealLoggerContent'

type MealLoggerProps = MealLoggerContentProps

export default function MealLogger(props: MealLoggerProps) {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState(0)

  const handleOpen = () => {
    setKey(k => k + 1) // reset content state
    setOpen(true)
  }

  const handleSaveSuccess = useCallback(() => {
    setTimeout(() => {
      setOpen(false)
    }, 1200)
  }, [])

  return (
    <>
      {/* FAB trigger */}
      <button
        onClick={handleOpen}
        className="fixed bottom-6 right-6 z-40 size-14 rounded-full bg-lime text-zinc-900 shadow-lg shadow-lime/20 flex items-center justify-center hover:bg-lime/90 transition-colors"
        aria-label="Registrar comida"
      >
        <svg className="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) setOpen(false) }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto sm:max-h-[90vh] max-sm:h-[100dvh] max-sm:max-h-none max-sm:rounded-none max-sm:border-0">
          <DialogHeader>
            <DialogTitle className="font-bebas text-2xl tracking-wide">Registrar Comida</DialogTitle>
            <DialogDescription>Toma una foto de tu comida para analizar los macros</DialogDescription>
          </DialogHeader>
          <MealLoggerContent key={key} {...props} onSaveSuccess={handleSaveSuccess} />
        </DialogContent>
      </Dialog>
    </>
  )
}
