interface ExerciseNavArrowsProps {
  hasPrev: boolean
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
}

/**
 * Flechas de navegación entre ejercicios, superpuestas a media altura.
 * El mismo bloque estaba copiado dos veces dentro de `SessionView` (una para
 * la fase de ejercicio y otra para la de descanso) antes del #475.
 */
export default function ExerciseNavArrows({ hasPrev, hasNext, onPrev, onNext }: ExerciseNavArrowsProps) {
  if (!hasPrev && !hasNext) return null

  return (
    <div className="flex absolute top-1/2 -translate-y-1/2 left-0 right-0 justify-between pointer-events-none z-10 px-1 sm:px-2">
      {hasPrev ? (
        <button
          onClick={onPrev}
          className="pointer-events-auto size-9 sm:size-11 rounded-full bg-muted/60 backdrop-blur flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-lime/40"
          aria-label="Ejercicio anterior"
        >
          <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="10,3 5,8 10,13" /></svg>
        </button>
      ) : <div />}
      {hasNext ? (
        <button
          onClick={onNext}
          className="pointer-events-auto size-9 sm:size-11 rounded-full bg-muted/60 backdrop-blur flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-lime/40"
          aria-label="Siguiente ejercicio"
        >
          <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6,3 11,8 6,13" /></svg>
        </button>
      ) : <div />}
    </div>
  )
}
