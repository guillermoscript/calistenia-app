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
import { useExerciseMedia, type UseExerciseMediaOpts } from '@calistenia/core/hooks/useExerciseMedia'
import type { ExerciseMediaInput } from '@calistenia/core/lib/exerciseMedia'

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
