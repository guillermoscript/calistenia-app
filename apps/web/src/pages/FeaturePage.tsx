import { useEffect } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { op } from '@calistenia/core/lib/analytics'
import { FEATURES, getFeature } from '../data/features'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
import {
  AndroidButton, Eyebrow, LandingStyles, PublicFooter, PublicHeader, Reveal, WebButton,
} from '../components/landing/shared'

export default function FeaturePage() {
  const { slug } = useParams<{ slug: string }>()
  const { t } = useTranslation()
  const feature = getFeature(slug)

  useEffect(() => {
    if (feature) op.track('feature_page_viewed', { feature: feature.slug })
  }, [feature])

  const title = feature ? t(`feature.${feature.slug}.title`) : ''
  const lead = feature ? t(`feature.${feature.slug}.lead`) : ''
  useDocumentMeta(feature ? t(`feature.${feature.slug}.name`) : '', lead)

  if (!feature) return <Navigate to="/features" replace />

  const { slug: id, Visual, blocks, faqs, related } = feature
  const k = (suffix: string) => t(`feature.${id}.${suffix}`)
  const featureLinks = FEATURES.map(f => ({ slug: f.slug, label: t(`feature.${f.slug}.name`) }))

  return (
    <div className="min-h-screen overflow-x-hidden bg-[hsl(75_8%_3%)] text-white selection:bg-lime/30">
      <LandingStyles />
      <PublicHeader />

      <main>
        {/* Hero */}
        <section className="relative isolate overflow-hidden bg-[radial-gradient(ellipse_at_75%_20%,hsl(74_90%_57%_/_0.14),transparent_40%),hsl(75_8%_3%)] px-6 pb-20 pt-28 md:px-10 lg:pt-32">
          <div aria-hidden="true" className="absolute inset-0 opacity-40 [background-image:linear-gradient(hsl(0_0%_100%_/_0.045)_1px,transparent_1px),linear-gradient(90deg,hsl(0_0%_100%_/_0.045)_1px,transparent_1px)] [background-size:52px_52px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />
          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 lg:grid-cols-[1.05fr_.8fr]">
            <div className="max-w-2xl">
              <Link
                to="/features"
                className="landing-rise inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-white/45 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> {t('feature.allFeatures')}
              </Link>
              <div className="landing-rise mt-8" style={{ animationDelay: '60ms' }}><Eyebrow>{k('eyebrow')}</Eyebrow></div>
              <h1 className="landing-rise mt-5 font-bebas text-[clamp(3.2rem,8vw,6.5rem)] leading-[.86] tracking-tight" style={{ animationDelay: '100ms' }}>
                {title}
              </h1>
              <p className="landing-rise mt-7 max-w-lg text-lg leading-relaxed text-white/68" style={{ animationDelay: '180ms' }}>{lead}</p>
              <div className="landing-rise mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center" style={{ animationDelay: '240ms' }}>
                <AndroidButton location={`feature_${id}_hero`} />
                <WebButton location={`feature_${id}_hero`} />
              </div>
              <p className="landing-rise mt-5 text-[13px] text-white/45" style={{ animationDelay: '300ms' }}>{t('landing.trust')}</p>
            </div>
            <div className="landing-rise flex justify-center lg:justify-end" style={{ animationDelay: '260ms' }}>
              <Visual />
            </div>
          </div>
        </section>

        {/* Qué incluye */}
        <section className="border-t border-white/10">
          <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
            <Reveal>
              <Eyebrow>{t('feature.whatEyebrow')}</Eyebrow>
              <h2 className="mt-5 max-w-2xl font-bebas text-5xl leading-[.88] tracking-tight sm:text-6xl">{k('whatTitle')}</h2>
            </Reveal>
            <div className="mt-14 grid gap-x-12 gap-y-12 sm:grid-cols-2">
              {Array.from({ length: blocks }, (_, i) => (
                <Reveal key={i} delay={i * 70}>
                  <div className="border-t border-white/15 pt-5">
                    <span className="font-mono text-xs text-lime">0{i + 1}</span>
                    <h3 className="mt-4 font-bebas text-2xl tracking-wide">{k(`b${i + 1}t`)}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-white/60">{k(`b${i + 1}d`)}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Cómo funciona */}
        <section className="border-y border-white/10 bg-white/[.025]">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 md:px-10 lg:grid-cols-[.72fr_1fr] lg:py-28">
            <Reveal>
              <Eyebrow>{t('feature.howEyebrow')}</Eyebrow>
              <h2 className="mt-5 font-bebas text-5xl leading-[.88] tracking-tight sm:text-6xl">{t('feature.howTitle')}</h2>
              <p className="mt-6 max-w-sm text-sm leading-relaxed text-white/55">{k('howNote')}</p>
            </Reveal>
            <Reveal delay={110}>
              <ol className="grid gap-6 sm:grid-cols-3">
                {[1, 2, 3].map(step => (
                  <li key={step} className="border-t border-white/20 pt-4">
                    <span className="font-mono text-xs text-lime">0{step}</span>
                    <p className="mt-5 text-base leading-snug text-white/80">{k(`s${step}`)}</p>
                  </li>
                ))}
              </ol>
            </Reveal>
          </div>
        </section>

        {/* Preguntas frecuentes */}
        <section>
          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 md:px-10 lg:grid-cols-[.72fr_1fr] lg:py-28">
            <Reveal>
              <Eyebrow>{t('feature.faqEyebrow')}</Eyebrow>
              <h2 className="mt-5 font-bebas text-5xl leading-[.88] tracking-tight sm:text-6xl">{t('feature.faqTitle')}</h2>
            </Reveal>
            <Reveal delay={110}>
              <dl className="border-t border-white/15">
                {Array.from({ length: faqs }, (_, i) => (
                  <div key={i} className="border-b border-white/15 py-6">
                    <dt className="flex gap-3 text-base font-semibold text-white/90">
                      <Check className="mt-1 h-4 w-4 shrink-0 text-lime" />
                      {k(`q${i + 1}`)}
                    </dt>
                    <dd className="mt-3 pl-7 text-sm leading-relaxed text-white/60">{k(`a${i + 1}`)}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>
        </section>

        {/* Sigue explorando */}
        <section className="border-t border-white/10">
          <div className="mx-auto max-w-6xl px-6 py-20 md:px-10 md:py-24">
            <Reveal>
              <Eyebrow>{t('feature.relatedEyebrow')}</Eyebrow>
              <h2 className="mt-5 font-bebas text-4xl leading-[.9] tracking-tight sm:text-5xl">{t('feature.relatedTitle')}</h2>
            </Reveal>
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {related.map((relatedSlug, i) => {
                const rel = FEATURES.find(f => f.slug === relatedSlug)
                if (!rel) return null
                const RelIcon = rel.icon
                return (
                  <Reveal key={relatedSlug} delay={i * 70}>
                    <Link
                      to={`/features/${relatedSlug}`}
                      onClick={() => op.track('cta_clicked', { location: `feature_${id}_related`, intent: 'feature_detail' })}
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
              <AndroidButton location={`feature_${id}_final`} className="!bg-black !text-white focus-visible:!ring-black focus-visible:!ring-offset-lime" />
              <WebButton location={`feature_${id}_final`} className="!border-black/30 !text-black hover:!border-black hover:!bg-black/5 focus-visible:!ring-black" />
            </div>
          </Reveal>
        </section>
      </main>

      <PublicFooter featureLinks={featureLinks} />
    </div>
  )
}
