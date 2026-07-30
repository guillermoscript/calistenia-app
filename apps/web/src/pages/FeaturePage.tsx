import { Navigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getFeature } from '../data/features'
import { AndroidButton, Eyebrow, Reveal, WebButton } from '../components/landing/shared'
import { FeatureShell } from '../components/landing/featureShell'
import { BackToFeatures, FaqBlock, SectionHeader } from '../components/landing/featureSections'

/**
 * Resuelve `/features/:slug`.
 *
 * Si la función ya tiene página propia (épica #279) la renderiza; si no, cae en
 * la plantilla compartida de abajo: hero + «qué incluye» + 3 pasos + FAQ.
 * La plantilla es el suelo, no el techo — cada sub-issue de #279 sustituye un
 * slug por su página, y cuando no quede ninguno esta rama se puede retirar.
 */
export default function FeaturePage() {
  const { slug } = useParams<{ slug: string }>()
  const feature = getFeature(slug)

  if (!feature) return <Navigate to="/features" replace />
  if (feature.Page) return <feature.Page />

  return <FeatureTemplate slug={feature.slug} />
}

function FeatureTemplate({ slug }: { slug: string }) {
  const { t } = useTranslation()
  const feature = getFeature(slug)!
  const { Visual, blocks = 0, faqs = 0 } = feature
  const k = (suffix: string) => t(`feature.${slug}.${suffix}`)

  const faqItems = Array.from({ length: faqs }, (_, i) => ({ q: k(`q${i + 1}`), a: k(`a${i + 1}`) }))

  return (
    <FeatureShell slug={slug} metaTitle={k('name')} metaDesc={k('lead')}>
      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-[radial-gradient(ellipse_at_75%_20%,hsl(74_90%_57%_/_0.14),transparent_40%),hsl(75_8%_3%)] px-6 pb-20 pt-28 md:px-10 lg:pt-32">
        <div aria-hidden="true" className="absolute inset-0 opacity-40 [background-image:linear-gradient(hsl(0_0%_100%_/_0.045)_1px,transparent_1px),linear-gradient(90deg,hsl(0_0%_100%_/_0.045)_1px,transparent_1px)] [background-size:52px_52px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 lg:grid-cols-[1.05fr_.8fr]">
          <div className="max-w-2xl">
            <BackToFeatures />
            <div className="landing-rise mt-8" style={{ animationDelay: '60ms' }}><Eyebrow>{k('eyebrow')}</Eyebrow></div>
            <h1 className="landing-rise mt-5 font-bebas text-[clamp(3.2rem,8vw,6.5rem)] leading-[.86] tracking-tight" style={{ animationDelay: '100ms' }}>
              {k('title')}
            </h1>
            <p className="landing-rise mt-7 max-w-lg text-lg leading-relaxed text-white/68" style={{ animationDelay: '180ms' }}>{k('lead')}</p>
            <div className="landing-rise mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center" style={{ animationDelay: '240ms' }}>
              <AndroidButton location={`feature_${slug}_hero`} />
              <WebButton location={`feature_${slug}_hero`} />
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
          <SectionHeader eyebrow={t('feature.faqEyebrow')} title={t('feature.faqTitle')} />
          <FaqBlock items={faqItems} />
        </div>
      </section>
    </FeatureShell>
  )
}
