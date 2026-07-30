import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight } from 'lucide-react'
import { op } from '@calistenia/core/lib/analytics'
import { FEATURES } from '../data/features'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
import {
  AndroidButton, Eyebrow, LandingStyles, PublicFooter, PublicHeader, Reveal, WebButton,
} from '../components/landing/shared'

export default function FeaturesPage() {
  const { t } = useTranslation()
  useDocumentMeta(t('feature.indexTitle'), t('feature.indexLead'))
  const featureLinks = FEATURES.map(f => ({ slug: f.slug, label: t(`feature.${f.slug}.name`) }))

  return (
    <div className="min-h-screen overflow-x-hidden bg-[hsl(75_8%_3%)] text-white selection:bg-lime/30">
      <LandingStyles />
      <PublicHeader />

      <main>
        <section className="relative isolate overflow-hidden bg-[radial-gradient(ellipse_at_75%_20%,hsl(74_90%_57%_/_0.14),transparent_40%),hsl(75_8%_3%)] px-6 pb-16 pt-28 md:px-10 lg:pt-32">
          <div aria-hidden="true" className="absolute inset-0 opacity-40 [background-image:linear-gradient(hsl(0_0%_100%_/_0.045)_1px,transparent_1px),linear-gradient(90deg,hsl(0_0%_100%_/_0.045)_1px,transparent_1px)] [background-size:52px_52px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />
          <div className="relative mx-auto max-w-6xl">
            <div className="landing-rise"><Eyebrow>{t('feature.indexEyebrow')}</Eyebrow></div>
            <h1 className="landing-rise mt-5 max-w-4xl font-bebas text-[clamp(3.2rem,8.5vw,7rem)] leading-[.86] tracking-tight" style={{ animationDelay: '80ms' }}>
              {t('feature.indexTitle')}
            </h1>
            <p className="landing-rise mt-7 max-w-xl text-lg leading-relaxed text-white/68" style={{ animationDelay: '160ms' }}>
              {t('feature.indexLead')}
            </p>
            <div className="landing-rise mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center" style={{ animationDelay: '240ms' }}>
              <AndroidButton location="features_index_hero" />
              <WebButton location="features_index_hero" />
            </div>
          </div>
        </section>

        <section className="border-t border-white/10">
          <div className="mx-auto grid max-w-6xl gap-4 px-6 py-16 md:grid-cols-2 md:px-10 lg:grid-cols-3 lg:py-20">
            {FEATURES.map((feature, i) => {
              const Icon = feature.icon
              return (
                <Reveal key={feature.slug} delay={(i % 3) * 70}>
                  <Link
                    to={`/features/${feature.slug}`}
                    onClick={() => op.track('cta_clicked', { location: 'features_index', intent: 'feature_detail' })}
                    className="group flex h-full flex-col border border-white/10 bg-[hsl(75_6%_6%)] p-7 transition hover:border-lime/40 hover:bg-[hsl(75_6%_8%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-lime/15 text-lime"><Icon className="h-5 w-5" /></span>
                    <h2 className="mt-6 font-bebas text-3xl tracking-wide">{t(`feature.${feature.slug}.name`)}</h2>
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-white/58">{t(`feature.${feature.slug}.card`)}</p>
                    <span className="mt-6 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-lime">
                      {t('feature.learnMore')} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </Reveal>
              )
            })}
          </div>
        </section>

        <section className="border-t border-white/10 bg-lime px-6 py-20 text-[hsl(75_8%_5%)] md:px-10 md:py-24">
          <Reveal className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.24em] text-black/55">{t('landing.platformEyebrow')}</p>
              <h2 className="mt-5 max-w-2xl font-bebas text-5xl leading-[.88] tracking-tight sm:text-6xl">{t('landing.finalTitle')}</h2>
              <p className="mt-6 max-w-lg text-base leading-relaxed text-black/65">{t('landing.finalDesc')}</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <AndroidButton location="features_index_final" className="!bg-black !text-white focus-visible:!ring-black focus-visible:!ring-offset-lime" />
              <WebButton location="features_index_final" className="!border-black/30 !text-black hover:!border-black hover:!bg-black/5 focus-visible:!ring-black" />
            </div>
          </Reveal>
        </section>
      </main>

      <PublicFooter featureLinks={featureLinks} />
    </div>
  )
}
