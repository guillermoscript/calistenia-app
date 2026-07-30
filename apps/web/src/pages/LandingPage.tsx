import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight } from 'lucide-react'
import { op } from '@calistenia/core/lib/analytics'
import { FEATURES } from '../data/features'
import { HeroPhone, LibraryPanel, PantryPanel, ProgressPanel, BeyondVisual } from '../components/landing/panels'
import {
  AndroidButton, BenefitList, Eyebrow, FeatureLink, LandingStyles, PublicFooter, PublicHeader,
  Reveal, WebButton, usePrefersReducedMotion,
} from '../components/landing/shared'

interface LandingPageProps { onGetStarted: () => void }

/** Orden de la lista "Mucho más que una rutina" → páginas de detalle. */
const BEYOND_SLUGS = ['cardio', 'circuits', 'races', 'challenges', 'community', 'offline']

function Ticker() {
  const { t } = useTranslation()
  const reduced = usePrefersReducedMotion()
  const items = [t('landing.ticker1'), t('landing.ticker2'), t('landing.ticker3'), t('landing.ticker4'), t('landing.ticker5'), t('landing.ticker6')]
  if (reduced) {
    return (
      <div className="border-y border-white/10 px-6 py-5">
        <ul className="mx-auto flex max-w-6xl flex-wrap gap-x-8 gap-y-2 text-sm text-white/60">
          {items.map(item => <li key={item} className="flex items-center gap-3"><span className="h-1 w-1 rounded-full bg-lime" />{item}</li>)}
        </ul>
      </div>
    )
  }
  const strip = items.map(item => (
    <span key={item} className="flex items-center gap-10">
      <span className="whitespace-nowrap text-sm text-white/60">{item}</span>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-lime" />
    </span>
  ))
  return (
    <div className="overflow-hidden border-y border-white/10 py-5" aria-hidden="true">
      <div className="landing-marquee flex w-max items-center gap-10">
        {strip}
        {items.map(item => (
          <span key={`${item}-dup`} className="flex items-center gap-10">
            <span className="whitespace-nowrap text-sm text-white/60">{item}</span>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-lime" />
          </span>
        ))}
      </div>
    </div>
  )
}

export default function LandingPage({ onGetStarted }: LandingPageProps) {
  const { t } = useTranslation()
  const reduced = usePrefersReducedMotion()
  const [active, setActive] = useState(0)
  const [autoPlay, setAutoPlay] = useState(true)
  const features = [t('landing.beyond1'), t('landing.beyond2'), t('landing.beyond3'), t('landing.beyond4'), t('landing.beyond5'), t('landing.beyond6')]
  const featureLinks = FEATURES.map(f => ({ slug: f.slug, label: t(`feature.${f.slug}.name`) }))

  useEffect(() => {
    if (reduced || !autoPlay) return
    const id = setInterval(() => setActive(prev => (prev + 1) % 6), 3500)
    return () => clearInterval(id)
  }, [reduced, autoPlay])

  const selectFeature = (index: number) => { setAutoPlay(false); setActive(index) }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[hsl(75_8%_3%)] text-white selection:bg-lime/30">
      <LandingStyles />
      <PublicHeader onGetStarted={onGetStarted} />

      <main>
        {/* Hero — full-bleed, type-led, real product UI above the fold */}
        <section className="relative isolate overflow-hidden bg-[radial-gradient(ellipse_at_75%_20%,hsl(74_90%_57%_/_0.14),transparent_40%),hsl(75_8%_3%)] px-6 pb-20 pt-28 md:px-10 lg:pt-32">
          <div aria-hidden="true" className="absolute inset-0 opacity-40 [background-image:linear-gradient(hsl(0_0%_100%_/_0.045)_1px,transparent_1px),linear-gradient(90deg,hsl(0_0%_100%_/_0.045)_1px,transparent_1px)] [background-size:52px_52px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />
          <div aria-hidden="true" className="absolute -right-24 top-1/2 hidden h-[560px] w-[560px] -translate-y-1/2 rounded-full border border-lime/20 lg:block" />
          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-16 lg:grid-cols-[1.05fr_.75fr]">
            <div className="max-w-2xl">
              <div className="landing-rise"><Eyebrow>{t('landing.kicker')}</Eyebrow></div>
              <h1 className="landing-rise mt-5 font-bebas text-[clamp(4rem,10.5vw,8.5rem)] leading-[.84] tracking-tight" style={{ animationDelay: '80ms' }}>
                {t('landing.heroTitle1')}<br />
                <span className="text-lime">{t('landing.heroTitle2')}</span>
              </h1>
              <p className="landing-rise mt-8 max-w-lg text-lg leading-relaxed text-white/68 sm:text-xl" style={{ animationDelay: '160ms' }}>
                {t('landing.heroDesc')}
              </p>
              <div className="landing-rise mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center" style={{ animationDelay: '240ms' }}>
                <AndroidButton location="hero" />
                <WebButton onGetStarted={onGetStarted} location="hero" />
              </div>
              <p className="landing-rise mt-5 text-[13px] text-white/45" style={{ animationDelay: '320ms' }}>{t('landing.trust')}</p>
            </div>
            <div className="landing-rise mx-auto pr-2 sm:pr-0" style={{ animationDelay: '280ms' }}>
              <HeroPhone />
            </div>
          </div>
        </section>

        {/* Real numbers, right after the hero */}
        <Ticker />

        {/* Beginner promise */}
        <section>
          <Reveal className="mx-auto max-w-6xl px-6 py-16 md:px-10 md:py-20">
            <Eyebrow>{t('landing.startEyebrow')}</Eyebrow>
            <div className="mt-5 grid gap-10 lg:grid-cols-[.72fr_1fr]">
              <div>
                <h2 className="font-bebas text-5xl leading-[.88] tracking-tight sm:text-6xl">{t('landing.startTitle')}</h2>
                <p className="mt-6 max-w-md text-sm leading-relaxed text-white/55">{t('landing.stepsProof')}</p>
              </div>
              <div className="grid gap-6 sm:grid-cols-3">
                {[t('landing.step1'), t('landing.step2'), t('landing.step3')].map((step, i) => (
                  <div key={step} className="border-t border-white/20 pt-4">
                    <span className="font-mono text-xs text-lime">0{i + 1}</span>
                    <p className="mt-5 text-base leading-snug text-white/80">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </section>

        {/* Training */}
        <section className="border-t border-white/10">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-24 md:px-10 lg:grid-cols-2 lg:py-32">
            <Reveal>
              <Eyebrow>{t('landing.trainingEyebrow')}</Eyebrow>
              <h2 className="mt-5 max-w-md font-bebas text-5xl leading-[.88] tracking-tight sm:text-6xl">{t('landing.trainingTitle')}</h2>
              <p className="mt-6 max-w-md text-base leading-relaxed text-white/60">{t('landing.trainingDesc')}</p>
              <BenefitList items={[t('landing.trainingFeature1'), t('landing.trainingFeature2'), t('landing.trainingFeature3')]} />
              <FeatureLink slug="training" location="section_training" />
            </Reveal>
            <Reveal delay={120} className="flex justify-center lg:justify-end">
              <LibraryPanel />
            </Reveal>
          </div>
        </section>

        {/* Nutrition + pantry */}
        <section className="border-y border-white/10 bg-white/[.025]">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-24 md:px-10 lg:grid-cols-2 lg:py-32">
            <Reveal className="order-2 flex justify-center lg:order-1 lg:justify-start">
              <PantryPanel />
            </Reveal>
            <Reveal className="order-1 lg:order-2">
              <Eyebrow>{t('landing.foodEyebrow')}</Eyebrow>
              <h2 className="mt-5 max-w-md font-bebas text-5xl leading-[.88] tracking-tight sm:text-6xl">{t('landing.foodTitle')}</h2>
              <p className="mt-6 max-w-md text-base leading-relaxed text-white/60">{t('landing.foodDesc')}</p>
              <BenefitList items={[t('landing.foodFeature1'), t('landing.foodFeature2'), t('landing.foodFeature3')]} />
              <FeatureLink slug="nutrition" location="section_nutrition" />
            </Reveal>
          </div>
        </section>

        {/* Progress */}
        <section>
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-24 md:px-10 lg:grid-cols-2 lg:py-32">
            <Reveal>
              <Eyebrow>{t('landing.progressEyebrow')}</Eyebrow>
              <h2 className="mt-5 max-w-md font-bebas text-5xl leading-[.88] tracking-tight sm:text-6xl">{t('landing.progressTitle')}</h2>
              <p className="mt-6 max-w-md text-base leading-relaxed text-white/60">{t('landing.progressDesc')}</p>
              <BenefitList items={[t('landing.progressFeature1'), t('landing.progressFeature2'), t('landing.progressFeature3')]} />
              <FeatureLink slug="progress" location="section_progress" />
            </Reveal>
            <Reveal delay={120} className="flex justify-center lg:justify-end">
              <ProgressPanel />
            </Reveal>
          </div>
        </section>

        {/* Beyond the routine — interactive reveal with a visual per item */}
        <section className="border-t border-white/10">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 md:px-10 lg:grid-cols-[1fr_.85fr] lg:py-32">
            <Reveal>
              <Eyebrow>{t('landing.beyondEyebrow')}</Eyebrow>
              <h2 className="mt-5 font-bebas text-5xl leading-[.88] tracking-tight sm:text-6xl">{t('landing.beyondTitle')}</h2>
              <div className="mt-10 border-t border-white/15">
                {features.map((feature, index) => (
                  <Link
                    key={feature}
                    to={`/features/${BEYOND_SLUGS[index]}`}
                    onMouseEnter={() => selectFeature(index)}
                    onFocus={() => selectFeature(index)}
                    onClick={() => op.track('cta_clicked', { location: 'section_beyond', intent: 'feature_detail' })}
                    className={`group flex w-full items-center justify-between gap-4 border-b border-white/15 py-4 text-left text-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime sm:text-xl ${active === index ? 'text-lime' : 'text-white/45 hover:text-white/85'}`}
                  >
                    <span>{feature}</span>
                    <span aria-hidden="true" className={`flex shrink-0 items-center gap-2 font-mono text-xs transition-opacity ${active === index ? 'opacity-100' : 'opacity-0'}`}>
                      0{index + 1} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                ))}
              </div>
              <p className="mt-4 text-xs text-white/35">{t('landing.beyondHint')}</p>
            </Reveal>
            <Reveal delay={90} className="lg:sticky lg:top-24 lg:self-start">
              {/* Al acercarse al panel se detiene la rotación: si no, el enlace de abajo
                  cambiaría de destino justo cuando el usuario va a pulsarlo. */}
              <div
                onMouseEnter={() => setAutoPlay(false)}
                className="flex flex-col items-center gap-4 lg:items-end"
              >
                <BeyondVisual index={active} />
                <FeatureLink slug={BEYOND_SLUGS[active]} location="section_beyond_visual" />
              </div>
            </Reveal>
          </div>
        </section>

        {/* Platform choice */}
        <section className="border-y border-white/10 bg-lime px-6 py-20 text-[hsl(75_8%_5%)] md:px-10 md:py-28">
          <Reveal className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.24em] text-black/55">{t('landing.platformEyebrow')}</p>
              <h2 className="mt-5 max-w-2xl font-bebas text-5xl leading-[.88] tracking-tight sm:text-6xl">{t('landing.platformTitle')}</h2>
              <p className="mt-6 max-w-lg text-base leading-relaxed text-black/65">{t('landing.platformDesc')}</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <AndroidButton location="platform" className="!bg-black !text-white focus-visible:!ring-black focus-visible:!ring-offset-lime" />
              <WebButton onGetStarted={onGetStarted} location="platform" className="!border-black/30 !text-black hover:!border-black hover:!bg-black/5 focus-visible:!ring-black" />
            </div>
          </Reveal>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-6xl px-6 py-28 md:px-10 md:py-40">
          <Reveal>
            <h2 className="max-w-3xl font-bebas text-[clamp(3.5rem,9vw,7rem)] leading-[.84] tracking-tight">{t('landing.finalTitle')}</h2>
            <p className="mt-7 max-w-lg text-lg leading-relaxed text-white/60">{t('landing.finalDesc')}</p>
            <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <AndroidButton location="final" />
              <WebButton onGetStarted={onGetStarted} location="final" />
            </div>
            <p className="mt-5 text-[13px] text-white/45">{t('landing.trust')}</p>
          </Reveal>
        </section>
      </main>

      <PublicFooter featureLinks={featureLinks} />
    </div>
  )
}
