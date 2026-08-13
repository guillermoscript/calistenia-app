/**
 * CTA de cierre de los artículos.
 *
 * Mismo patrón que el cierre de `/features/:slug`: banda lima a sangre, texto
 * negro, alineado a la izquierda. Antes era icono centrado sobre degradado —
 * el componente más reconociblemente «generado por IA» que había en el sitio,
 * justo en el punto donde se pide la conversión.
 */
import { useTranslation } from 'react-i18next'
import { AndroidButton, WebButton } from '../landing/shared'

export default function BlogCTA({ location = 'blog_article' }: { location?: string }) {
  const { t } = useTranslation()

  return (
    <section className="border-t border-white/10 bg-lime px-6 py-16 text-[hsl(75_8%_5%)] md:px-10 md:py-20">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[.24em] text-black/55">
            {t('landing.platformEyebrow')}
          </p>
          <h2 className="mt-5 max-w-2xl font-bebas text-5xl leading-[.88] tracking-tight sm:text-6xl">
            {t('landing.finalTitle')}
          </h2>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-black/65">{t('landing.finalDesc')}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <AndroidButton
            location={location}
            className="!bg-black !text-white focus-visible:!ring-black focus-visible:!ring-offset-lime"
          />
          <WebButton
            location={location}
            className="!border-black/30 !text-black hover:!border-black hover:!bg-black/5 focus-visible:!ring-black"
          />
        </div>
      </div>
    </section>
  )
}
