/**
 * Visuales de `/features/offline`.
 *
 * Mocks HTML/CSS, nunca capturas, y aquí la razón es más fuerte que en las
 * otras páginas: lo que se ilustra es un estado —«sin cobertura»— que no se ve
 * en una captura. Una pantalla de la app sin conexión es idéntica a una con
 * conexión salvo por un aviso de una línea. Lo que sí se puede dibujar es la
 * idea: la misma serie, en dos pantallas, con el icono de sin señal encima.
 *
 * El vocabulario sale de la app (`session.set`), no de textos inventados: si
 * alguien renombra «Serie» en el producto, el mock se renombra con ella.
 *
 * `BeyondVisual` se deja en paz: la landing sigue usando `index={5}` para sin
 * conexión (`apps/web/src/pages/LandingPage.tsx:204`) y el registro lo conserva.
 */
import { useTranslation } from 'react-i18next'
import { ArrowRight, WifiOff } from 'lucide-react'
import { PhoneFrame } from '../../components/landing/featureSections'

/** Cuerpo de la sesión, idéntico en las dos pantallas: ese es el argumento. */
function SessionBody({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation()
  const k = (s: string) => t(`feature.offline.${s}`)

  return (
    <div className={compact ? 'px-4 pb-6 pt-4' : 'px-5 pb-6 pt-5'}>
      <p className="font-mono text-[10px] uppercase tracking-[.16em] text-white/35">{k('mockWorkout')}</p>
      <p className={`mt-2 font-bebas leading-none tracking-wide ${compact ? 'text-xl' : 'text-2xl'}`}>
        {k('mockExercise')}
      </p>

      {/* La serie en curso: el dato que viaja de una pantalla a la otra. */}
      <div className="mt-4 flex items-baseline gap-2 border-l-2 border-lime pl-3">
        <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-lime">{t('session.set')}</span>
        <span className="font-bebas text-2xl leading-none tracking-wide">3 / 4</span>
      </div>

      {/* `gap-3` y no solo `justify-between`: dentro del teléfono la etiqueta y
          el cronómetro se tocaban, porque ahí solo hay ~150 px de ancho útil. */}
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
        <span className="text-[10px] uppercase tracking-[.14em] text-white/35">{t('session.resting')}</span>
        <span className="font-mono text-sm text-white/80">01:30</span>
      </div>
    </div>
  )
}

/**
 * Hero: la misma sesión abierta en el ordenador y en el móvil, en la misma
 * serie, con el aviso de sin cobertura encima de las dos.
 *
 * `role="img"` con su `aria-label`: para un lector de pantalla esto es una
 * ilustración, no una tabla de datos que merezca recorrerse celda a celda.
 */
export function TwoScreensPanel() {
  const { t } = useTranslation()
  const k = (s: string) => t(`feature.offline.${s}`)

  return (
    <div role="img" aria-label={k('heroAlt')} className="w-full max-w-md">
      <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[.14em] text-amber-300">
        <WifiOff aria-hidden="true" className="h-3.5 w-3.5" />
        {k('mockNoSignal')}
      </p>

      {/* A 360 px las dos pantallas se apilan y la flecha gira: en horizontal
          el móvil quedaría a 40 px de ancho. `min-w-0` para que el navegador
          pueda encoger la columna del escritorio en vez de desbordar. */}
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-stretch">
        <div className="min-w-0 flex-1 border border-white/10 bg-[hsl(75_6%_6%)] shadow-2xl shadow-black/40">
          {/* Barra del navegador: tres puntos y nada más. Un mock de escritorio
              se lee como escritorio por el marco, no por el contenido. */}
          <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-white/15" />
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-white/15" />
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-white/15" />
            <span className="ml-2 font-mono text-[10px] uppercase tracking-[.14em] text-white/35">{k('mockDesktop')}</span>
          </div>
          <SessionBody />
        </div>

        <div className="flex items-center justify-center">
          <ArrowRight aria-hidden="true" className="h-5 w-5 rotate-90 text-lime sm:rotate-0" />
        </div>

        <div className="shrink-0">
          <PhoneFrame width={188}>
            <SessionBody compact />
          </PhoneFrame>
        </div>
      </div>

      <p className="mt-4 font-mono text-[11px] leading-relaxed text-white/40">{k('mockCaption')}</p>
    </div>
  )
}
