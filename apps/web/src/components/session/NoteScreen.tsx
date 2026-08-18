import { useState } from 'react'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'

interface NoteScreenProps {
  workoutTitle: string
  totalSetsLogged: number
  durationMin: number
  onSave: (note: string) => void
}

/** Nota de cierre de la sesión, entre el último set y la celebración. */
export default function NoteScreen({ workoutTitle, totalSetsLogged, durationMin, onSave }: NoteScreenProps) {
  const [note, setNote] = useState<string>('')
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-5 sm:px-8 py-8 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] gap-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-3 motion-safe:duration-300">
      <div className="font-bebas text-4xl sm:text-5xl tracking-[2px] text-emerald-500 text-center leading-none">
        ¡Último set listo!
      </div>
      <div className="text-[11px] text-muted-foreground tracking-[2px] font-mono">
        {workoutTitle.toUpperCase()} · {totalSetsLogged} SERIES · {durationMin} MIN
      </div>

      <div className="w-full max-w-[420px] bg-card border border-border rounded-xl px-6 py-5">
        <div className="text-[10px] text-lime tracking-[2px] mb-2.5 uppercase font-mono">Nota de sesión</div>
        <div className="text-[13px] text-muted-foreground mb-3">¿Cómo fue? ¿Algo que destacar?</div>
        <Textarea
          value={note}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNote(e.target.value)}
          placeholder="Ej: Dominadas mucho mejor hoy, llegué a 8 seguidas. Lumbar bien."
          rows={3}
          autoFocus
          className="text-[13px] resize-y leading-relaxed"
        />
        <div className="flex gap-2.5 mt-3">
          <Button
            onClick={() => onSave(note.trim())}
            variant="limeSolid"
            className="font-bebas text-lg tracking-wide px-6"
          >
            GUARDAR
          </Button>
          <Button
            variant="outline"
            onClick={() => onSave('')}
            className="font-mono text-[11px] tracking-wide px-4"
          >
            SALTAR
          </Button>
        </div>
      </div>
    </div>
  )
}
