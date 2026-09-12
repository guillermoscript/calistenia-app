/**
 * El crédito de un remix y el contador de seguidores (#620).
 *
 * Dos piezas separadas porque las pantallas las quieren en sitios distintos: la
 * ficha del programa pinta las dos, una debajo de la otra; la tarjeta del
 * catálogo solo el contador, metido en la fila de metadatos que ya existe.
 *
 * NINGUNA DE LAS DOS PINTA NADA SI NO HAY DATO, y esa es la parte importante.
 * `forked_from` falta en la mayoría de programas (los originales, y los
 * duplicados de antes de #620), y `followersCount` llega `undefined` cuando la
 * view no devolvió la fila — que puede ser «nadie lo sigue» o «no puedes verlo»,
 * indistinguibles desde aquí. Pintar «0 personas lo siguen» en ese caso sería
 * inventarse un dato: un fallo de permisos disfrazado de dato real.
 */

import { useTranslation } from 'react-i18next'
import { GitForkIcon, UsersIcon } from 'lucide-react'
import type { ProgramMeta } from '@calistenia/core/types'
import { cn } from '@/lib/utils'

interface ProgramRemixCreditProps {
  program: ProgramMeta
  className?: string
}

/** «Basado en *Nombre* de *Autor*». Vacío si el programa no es una copia. */
export function ProgramRemixCredit({ program, className }: ProgramRemixCreditProps) {
  const { t } = useTranslation()

  // `forked_from_name` y no `forked_from`: el id sin el nombre significa que la
  // pantalla no pidió el `expand`, y «Basado en » a secas no dice nada. El
  // original borrado cae aquí también, que es lo que queremos: PocketBase vacía
  // la relación no-cascade y la copia deja de acreditar a un fantasma.
  if (!program.forked_from_name) return null

  // Sin autor cuando la privacidad por campo (#411) recortó el nombre o cuando
  // esa cuenta se borró. El programa sí se puede nombrar, así que se acredita a
  // medias en vez de callarse del todo.
  const label = program.forked_from_author
    ? t('programs.remix.basedOn', {
        program: program.forked_from_name,
        author: program.forked_from_author,
      })
    : t('programs.remix.basedOnNoAuthor', { program: program.forked_from_name })

  return (
    <p
      className={cn(
        'flex items-center gap-1.5 text-[11px] font-mono tracking-wide text-muted-foreground',
        className,
      )}
    >
      <GitForkIcon className="size-3 shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">{label}</span>
    </p>
  )
}

interface ProgramFollowersProps {
  /** `undefined` = no se sabe (no cargado o sin permiso). `0` = nadie todavía. */
  count: number | undefined
  className?: string
}

/** «N personas lo siguen». Vacío mientras no se sabe y también con cero. */
export function ProgramFollowers({ count, className }: ProgramFollowersProps) {
  const { t } = useTranslation()

  // El cero se calla a propósito. Un programa recién creado con «0 personas lo
  // siguen» debajo es prueba social en negativo: dice menos que no decir nada.
  if (!count) return null

  return (
    <span
      className={cn(
        'flex items-center gap-1.5 text-[11px] font-mono tracking-wide text-muted-foreground',
        className,
      )}
    >
      <UsersIcon className="size-3 shrink-0" aria-hidden="true" />
      {t('programs.remix.followers', { count })}
    </span>
  )
}
