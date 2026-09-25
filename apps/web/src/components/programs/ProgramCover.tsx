import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { programCoverUrl } from '@calistenia/core/lib/programCover'
import { coverObjectPosition } from '@calistenia/core/lib/coverFocus'
import ImageLightbox, { ZoomHint } from '../ImageLightbox'

interface ProgramCoverProps {
  program: { id: string; name: string; cover_image?: string; cover_focus?: string }
}

/**
 * Portada en la cabecera de la ficha de programa. Hasta ahora la ficha web no
 * la pintaba: solo salía en la tarjeta del catálogo.
 *
 * Banner 16:9 en móvil y 2:1 desde `sm`. Con 3:1 una foto vertical dejaba ver
 * poco más de un cuarto de su alto y cortaba a la persona aunque el encuadre
 * fuera bueno. El recorte lo decide el foco que marca el autor en el editor
 * (`cover_focus`); sin foco, centrado. La imagen ORIGINAL entera se ve en el
 * visor.
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
        className="relative mb-8 block aspect-[16/9] w-full cursor-zoom-in overflow-hidden rounded-xl border border-border/40 bg-muted transition-colors hover:border-lime-400/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/60 sm:aspect-[2/1] motion-safe:animate-fade-in"
      >
        <img
          src={programCoverUrl(program, '800x0')}
          alt={program.name}
          decoding="async"
          className="size-full object-cover"
          style={{ objectPosition: coverObjectPosition(program.cover_focus) }}
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
