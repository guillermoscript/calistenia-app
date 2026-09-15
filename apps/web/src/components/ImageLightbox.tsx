import { useRef } from 'react'
import { Maximize2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogClose, DialogContent, DialogTitle } from './ui/dialog'

interface ImageLightboxProps {
  /** `null` cierra el visor. */
  src: string | null
  alt: string
  onClose: () => void
}

/**
 * Visor de imagen a pantalla completa (portada de programa, media de ejercicio).
 *
 * El `DialogContent` ocupa TODA la pantalla: la imagen se ajusta al hueco con
 * `object-contain`, entera, sea apaisada o vertical. Con el tamaño por defecto
 * del Dialog se quedaba en una caja de ~700 px aunque la pantalla midiera el
 * doble. El fondo propio (`bg-black/70`) se suma al `bg-black/80` del overlay:
 * con el overlay solo, el texto de la página se leía a través del visor.
 *
 * Cierra con Escape, con la ✕ o pulsando fuera de la imagen: como el contenido
 * cubre el overlay, ese clic lo recoge el propio contenedor.
 */
export default function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  const { t } = useTranslation()
  // Radix solo devuelve el foco a un `DialogTrigger`; aquí lo abre un botón
  // cualquiera, así que al cerrar con Escape el foco caía en <body> y quien
  // navega con teclado perdía su sitio. Se guarda al abrir (antes de que Radix
  // lo mueva dentro) y se restaura al cerrar.
  const returnFocusTo = useRef<HTMLElement | null>(null)
  return (
    <Dialog open={!!src} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent
        hideClose
        aria-describedby={undefined}
        onOpenAutoFocus={() => { returnFocusTo.current = document.activeElement as HTMLElement | null }}
        onCloseAutoFocus={e => {
          if (!returnFocusTo.current) return
          e.preventDefault()
          returnFocusTo.current.focus()
          returnFocusTo.current = null
        }}
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
        className="flex h-[100dvh] w-screen max-w-none items-center justify-center border-0 bg-black/70 p-4 shadow-none sm:rounded-none sm:p-12"
      >
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        {src && (
          <img
            src={src}
            alt={alt}
            className="max-h-full max-w-full rounded-md object-contain"
          />
        )}
        {/* Blanca sobre fondo oscuro propio: la ✕ del Dialog usa el color del
            tema y en modo claro desaparecía sobre el overlay negro. */}
        <DialogClose
          className="absolute right-3 top-3 flex size-10 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/20 transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 sm:right-5 sm:top-5"
        >
          <X className="size-5" />
          <span className="sr-only">{t('common.close')}</span>
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Señal de «esto se amplía» para la esquina de una imagen que abre el visor.
 * En táctil no hay `cursor-zoom-in`, y sin ella nada decía que la imagen se
 * pudiera pulsar. Decorativa: el botón que la contiene ya lleva `aria-label`.
 * El padre necesita `relative`.
 */
export function ZoomHint() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute bottom-2 right-2 flex size-7 items-center justify-center rounded-full bg-black/60 text-white/85 ring-1 ring-white/15"
    >
      <Maximize2 className="size-3.5" />
    </span>
  )
}
