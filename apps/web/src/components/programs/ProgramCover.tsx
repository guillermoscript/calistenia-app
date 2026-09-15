import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { programCoverUrl } from '@calistenia/core/lib/programCover'
import ImageLightbox, { ZoomHint } from '../ImageLightbox'

interface ProgramCoverProps {
  program: { id: string; name: string; cover_image?: string }
}

/**
 * Portada en la cabecera de la ficha de programa. Hasta ahora la ficha web no
 * la pintaba: solo salía en la tarjeta del catálogo.
 *
 * Banner con proporción fija (16:9 en móvil, 21:9 desde `sm`, 3:1 desde `lg`)
 * para que no se coma la pantalla en escritorio: a 21:9 medía 975×416 y
 * empujaba el título por debajo de la mitad. El recorte se compensa abriendo
 * la imagen ORIGINAL entera en el visor.
 */
export function ProgramCover({ program }: ProgramCoverProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  if (!program.cover_image) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('common.viewFullscreen')}
        className="relative mb-8 block aspect-[16/9] w-full cursor-zoom-in overflow-hidden rounded-xl border border-border/40 bg-muted transition-colors hover:border-lime-400/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/60 sm:aspect-[21/9] lg:aspect-[3/1] motion-safe:animate-fade-in"
      >
        <img
          src={programCoverUrl(program, '800x0')}
          alt={program.name}
          decoding="async"
          // Encuadre hacia el tercio superior: las portadas suelen ser una
          // persona y el recorte centrado de un banner 3:1 le cortaba la cabeza.
          className="size-full object-cover object-[50%_25%]"
        />
        <ZoomHint />
      </button>
      <ImageLightbox
        src={open ? programCoverUrl(program) ?? null : null}
        alt={program.name}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
