/**
 * Envoltorio común de las páginas de `/features/:slug`.
 *
 * Aporta lo que toda página de función comparte —cabecera, pie, «sigue
 * explorando», CTA final, metadatos y la analítica de visita— para que cada
 * página solo tenga que escribir su cuerpo. Lo usan tanto la plantilla genérica
 * (`FeaturePage`) como las páginas propias de `src/pages/features/`.
 */
import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight } from 'lucide-react'
import { op } from '@calistenia/core/lib/analytics'
import { FEATURES, getFeature } from '../../data/features'
import { useDocumentMeta } from '../../hooks/useDocumentMeta'
import { AndroidButton, Eyebrow, LandingStyles, PublicFooter, PublicHeader, Reveal, WebButton } from './shared'

export function FeatureShell({
  slug,
  metaTitle,
  metaDesc,
  children,
}: {
  slug: string
  metaTitle: string
  metaDesc: string
  children: ReactNode
}) {
  const { t } = useTranslation()

  useEffect(() => {
    op.track('feature_page_viewed', { feature: slug })
  }, [slug])

  useDocumentMeta(metaTitle, metaDesc)

  const related = getFeature(slug)?.related ?? []
  const featureLinks = FEATURES.map(f => ({ slug: f.slug, label: t(`feature.${f.slug}.name`) }))

  return (
    <div className="min-h-screen overflow-x-hidden bg-[hsl(75_8%_3%)] text-white selection:bg-lime/30">
      <LandingStyles />
      <PublicHeader />

      <main>
        {children}

        {/* Sigue explorando */}
        <section className="border-t border-white/10">
          <div className="mx-auto max-w-6xl px-6 py-20 md:px-10 md:py-24">
            <Reveal>
              <Eyebrow>{t('feature.relatedEyebrow')}</Eyebrow>
              <h2 className="mt-5 font-bebas text-4xl leading-[.9] tracking-tight sm:text-5xl">{t('feature.relatedTitle')}</h2>
            </Reveal>
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {related.map((relatedSlug, i) => {
                const rel = getFeature(relatedSlug)
                if (!rel) return null
                const RelIcon = rel.icon
                return (
                  <Reveal key={relatedSlug} delay={i * 70}>
                    <Link
                      to={`/features/${relatedSlug}`}
                      onClick={() => op.track('cta_clicked', { location: `feature_${slug}_related`, intent: 'feature_detail' })}
                      className="group flex h-full flex-col border border-white/10 bg-[hsl(75_6%_6%)] p-6 transition hover:border-lime/40 hover:bg-[hsl(75_6%_8%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
                    >
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-lime/15 text-lime"><RelIcon className="h-4 w-4" /></span>
                      <h3 className="mt-5 font-bebas text-2xl tracking-wide">{t(`feature.${relatedSlug}.name`)}</h3>
                      <p className="mt-2 flex-1 text-sm leading-relaxed text-white/55">{t(`feature.${relatedSlug}.card`)}</p>
                      <span className="mt-5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-lime">
                        {t('feature.learnMore')} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </Link>
                  </Reveal>
                )
              })}
            </div>
          </div>
        </section>

        {/* CTA final */}
        <section className="border-t border-white/10 bg-lime px-6 py-20 text-[hsl(75_8%_5%)] md:px-10 md:py-24">
          <Reveal className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.24em] text-black/55">{t('landing.platformEyebrow')}</p>
              <h2 className="mt-5 max-w-2xl font-bebas text-5xl leading-[.88] tracking-tight sm:text-6xl">{t('landing.finalTitle')}</h2>
              <p className="mt-6 max-w-lg text-base leading-relaxed text-black/65">{t('landing.finalDesc')}</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <AndroidButton location={`feature_${slug}_final`} className="!bg-black !text-white focus-visible:!ring-black focus-visible:!ring-offset-lime" />
              <WebButton location={`feature_${slug}_final`} className="!border-black/30 !text-black hover:!border-black hover:!bg-black/5 focus-visible:!ring-black" />
            </div>
          </Reveal>
        </section>
      </main>

      <PublicFooter featureLinks={featureLinks} />
    </div>
  )
}
