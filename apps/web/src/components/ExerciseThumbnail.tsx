/**
 * ExerciseThumbnail — la miniatura de un ejercicio, resuelta por el camino canónico (#608).
 *
 * Existe porque las dos pantallas que pintan miniaturas lo hacen dentro de un
 * `.map()`, y `useExerciseMedia` es un hook: no se puede llamar en un bucle. Al
 * encapsular la miniatura en su propio componente, cada tarjeta resuelve su
 * media por su cuenta y ninguna vuelve a meter en `src` el nombre de fichero
 * crudo de PocketBase.
 *
 * Si no hay nada que pintar devuelve `fallback` (por defecto, nada): así la
 * biblioteca puede seguir enseñando su icono de categoría en el hueco.
 */
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useExerciseMedia, type UseExerciseMediaOpts } from '@calistenia/core/hooks/useExerciseMedia'
import type { ExerciseMediaInput } from '@calistenia/core/lib/exerciseMedia'

/**
 * El hueco honesto: «Sin demo aún» (#619).
 *
 * La alternativa que había era pintar nada, y nada se lee como un fallo de carga
 * —o peor, como que la tarjeta está rota—. Decir que la demo todavía no existe
 * es información: el ejercicio está bien, la media es lo que falta. Se produce
 * poco a poco (137 ejercicios en los programas oficiales, uno hoy), así que este
 * hueco va a estar en pantalla una buena temporada y merece verse deliberado.
 */
export function NoDemoPlaceholder({ className }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <div
      className={className}
      title={t('media.noDemoYet')}
      aria-label={t('media.noDemoYet')}
      role="img"
    >
      <div className="w-full h-full flex items-center justify-center bg-muted/40 border border-dashed border-border/60">
        <svg
          width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round"
          className="text-muted-foreground/40"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="1.5" />
          <path d="m21 15-4.5-4.5L9 18" />
        </svg>
      </div>
    </div>
  )
}

interface ExerciseThumbnailProps extends UseExerciseMediaOpts {
  /** El ejercicio, en la forma mínima que espera el resolutor. */
  exercise: ExerciseMediaInput & { id?: string }
  /** Texto alternativo de la imagen. */
  alt: string
  /** Clases del contenedor que enmarca la imagen. */
  className?: string
  /** Clases de la propia `<img>`. */
  imgClassName?: string
  /** Qué pintar cuando el ejercicio no tiene media resoluble. */
  fallback?: ReactNode
}

export default function ExerciseThumbnail({
  exercise,
  alt,
  className,
  imgClassName,
  fallback = null,
  ...mediaOpts
}: ExerciseThumbnailProps) {
  const media = useExerciseMedia(exercise, mediaOpts)
  // `thumbnail` es el hueco de lista; `images[0]` cubre a quien solo tenga la
  // lista de compatibilidad (vídeo curado y YouTube no pintan miniatura).
  const src = media.thumbnail ?? media.images[0] ?? null

  if (!src) return <>{fallback}</>

  return (
    <div className={className}>
      <img src={src} alt={alt} className={imgClassName} loading="lazy" />
    </div>
  )
}
