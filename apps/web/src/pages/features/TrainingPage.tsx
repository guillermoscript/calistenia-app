/**
 * `/features/training` — sub-issue #280 de la épica #279.
 *
 * Todo el texto sale de `feature.training.*`. Cada cifra publicada aquí está
 * anclada a código real y verificada: 1.578 ejercicios y las 8 categorías salen
 * de los metadatos de `packages/core/data/exercise-catalog.json`; las 32 cadenas
 * y los 263 ejercicios encadenados, de `seeds/exercises/*.json`; la escalera
 * 15 → 12 → 10 → 8, de `target_reps_to_advance` en `seeds/exercises/push.json`;
 * la semana y las fases, de `packages/core/data/workouts.ts:3-18`.
 *
 * Lo que esta página NO dice, porque el código no lo sostiene: que cada
 * ejercicio tenga variante (505 de 1.578 no tienen), que los 1.578 tengan
 * progresión (son 263), que haya imágenes o demos en vídeo (hay 8 imágenes),
 * que el onboarding pregunte por tu equipo (no lo pregunta), que la app suba de
 * fase sola, ni que se puedan registrar series sin conexión.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { op } from '@calistenia/core/lib/analytics'
import { AndroidButton, Eyebrow, Reveal, WebButton } from '../../components/landing/shared'
import { FeatureShell } from '../../components/landing/featureShell'
import {
  BackToFeatures, FaqBlock, FaqJsonLd, LimitNote, PlatformTable, SectionHeader, SpecTable, StateWalkthrough, StepFlow,
} from '../../components/landing/featureSections'
import { CelebrateMock, ExerciseMock, ProgressionMock, RestMock, TodayPanel } from './TrainingVisuals'

export default function TrainingPage() {
  const { t } = useTranslation()
  const k = (suffix: string) => t(`feature.training.${suffix}`)

  /** Reemplaza el marcador `{{link}}` de una cadena por un enlace interno real. */
  const withLink = (text: string, to: string, label: string, zone: string): ReactNode => {
    const [before, after] = text.split('{{link}}')
    return (
      <>
        {before}
        <Link
          to={to}
          onClick={() => op.track('cta_clicked', { location: `feature_training_${zone}`, intent: 'feature_detail' })}
          className="font-semibold text-lime underline underline-offset-4 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
        >
          {label}
        </Link>
        {after ?? ''}
      </>
    )
  }

  const pathSteps = [1, 2, 3, 4].map(n => ({ title: k(`path${n}Title`), desc: k(`path${n}Desc`) }))

  const sessionVisuals: Record<number, ReactNode> = {
    1: <ExerciseMock />,
    2: <RestMock />,
    5: <CelebrateMock />,
  }
  const sessionStates = [1, 2, 3, 4, 5].map(n => ({
    badge: k(`sess${n}Badge`),
    title: k(`sess${n}Title`),
    desc: k(`sess${n}Desc`),
    actions: k(`sess${n}Actions`),
    visual: sessionVisuals[n],
  }))

  const catalogRows = [1, 2, 3, 4, 5, 6, 7].map(n => [
    <span key="f" className="font-bebas text-3xl leading-none tracking-wide text-lime">{k(`cat${n}Figure`)}</span>,
    k(`cat${n}Desc`),
  ])

  const ladderRows = [1, 2, 3, 4].map(n => [k(`prog${n}Step`), k(`prog${n}Reps`)])

  /**
   * iOS va vacío en toda la tabla: existe el código nativo, pero no hay versión
   * publicada. `platNote` lo dice sin rodeos.
   */
  const platformRows = [
    { label: k('plat1'), web: true, android: true, ios: false },
    { label: k('plat2'), web: true, android: true, ios: false },
    { label: k('plat3'), web: true, android: false, ios: false },
    { label: k('plat4'), web: true, android: false, ios: false },
    { label: k('plat5'), web: false, android: true, ios: false },
    { label: k('plat6'), web: false, android: true, ios: false },
    { label: k('plat7'), web: true, android: false, ios: false },
    { label: k('plat8'), web: true, android: false, ios: false },
    { label: k('plat9'), web: true, android: false, ios: false },
    { label: k('plat10'), web: true, android: true, ios: false },
  ]

  const faqPlain = [1, 2, 3, 4, 5, 6].map(n => ({
    q: k(`faq${n}q`),
    a: k(`faq${n}a`).replace('{{link}}', k('linkOffline')),
  }))

  const faqItems = [1, 2, 3, 4, 5, 6].map(n => ({
    q: k(`faq${n}q`),
    a: n === 6 ? withLink(k('faq6a'), '/features/offline', k('linkOffline'), 'faq') : k(`faq${n}a`),
  }))

  return (
    <FeatureShell slug="training" metaTitle={k('metaTitle')} metaDesc={k('metaDesc')}>
      <FaqJsonLd items={faqPlain} />

      {/* S1 · Hero */}
      <section className="relative isolate overflow-hidden bg-[radial-gradient(ellipse_at_75%_20%,hsl(74_90%_57%_/_0.14),transparent_40%),hsl(75_8%_3%)] px-6 pb-20 pt-28 md:px-10 lg:pt-32">
        <div aria-hidden="true" className="absolute inset-0 opacity-40 [background-image:linear-gradient(hsl(0_0%_100%_/_0.045)_1px,transparent_1px),linear-gradient(90deg,hsl(0_0%_100%_/_0.045)_1px,transparent_1px)] [background-size:52px_52px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 lg:grid-cols-[1.05fr_.85fr]">
          <div className="max-w-2xl">
            <BackToFeatures />
            <div className="landing-rise mt-8" style={{ animationDelay: '60ms' }}><Eyebrow>{k('eyebrow')}</Eyebrow></div>
            <h1 className="landing-rise mt-5 font-bebas text-[clamp(3.2rem,8vw,6.5rem)] leading-[.86] tracking-tight" style={{ animationDelay: '100ms' }}>
              {k('h1')}
            </h1>
            <p className="landing-rise mt-7 max-w-lg text-lg leading-relaxed text-white/68" style={{ animationDelay: '180ms' }}>{k('heroLead')}</p>
            <div className="landing-rise mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center" style={{ animationDelay: '240ms' }}>
              <AndroidButton location="feature_training_hero" />
              <WebButton location="feature_training_hero" />
            </div>
            <p className="landing-rise mt-5 text-[13px] text-white/45" style={{ animationDelay: '300ms' }}>{t('landing.trust')}</p>
          </div>
          <div className="landing-rise flex flex-col items-center gap-4 lg:items-end" style={{ animationDelay: '260ms' }}>
            <TodayPanel />
            <p className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-[hsl(75_6%_8%)] px-4 py-2 text-xs font-semibold text-white/70">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-lime" />
              {k('heroBadge')}
            </p>
          </div>
        </div>
      </section>

      {/* S2 · De la primera pantalla a la sesión de hoy */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('pathEyebrow')} title={k('pathTitle')} lead={k('pathLead')} />
          <StepFlow items={pathSteps} />
          <LimitNote>{k('pathLimit')}</LimitNote>
        </div>
      </section>

      {/* S3 · Dentro de una sesión — la sección que la plantilla no podía dar */}
      <section className="border-y border-white/10 bg-white/[.025]">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('sessEyebrow')} title={k('sessTitle')} lead={k('sessLead')} />
          <StateWalkthrough items={sessionStates} />
          <LimitNote>{k('sessNote')}</LimitNote>
          <Reveal className="mt-8">
            <p className="max-w-2xl text-sm leading-relaxed text-white/60">
              {withLink(k('sessOutro'), '/features/progress', k('linkProgress'), 'session')}
            </p>
          </Reveal>
        </div>
      </section>

      {/* S4 · El catálogo, en números reales */}
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('catEyebrow')} title={k('catTitle')} lead={k('catLead')} />
          <SpecTable columns={[k('catColFigure'), k('catColMeaning')]} rows={catalogRows} />
          <LimitNote>{k('catLimit')}</LimitNote>
          <Reveal className="mt-8">
            <p className="max-w-2xl text-sm leading-relaxed text-white/60">
              {withLink(k('catOffline'), '/features/offline', k('linkOffline'), 'catalog')}
            </p>
          </Reveal>
        </div>
      </section>

      {/* S5 · Cómo sabes que toca subir */}
      <section className="border-b border-white/10 bg-white/[.025]">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('progEyebrow')} title={k('progTitle')} lead={k('progLead')} />
          <Reveal className="mt-12">
            <div className="grid items-start gap-8 lg:grid-cols-[1fr_auto]">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="border border-lime/40 bg-lime/[.06] p-6">
                  <h3 className="font-bebas text-2xl tracking-wide text-lime">{k('prog1Title')}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-white/75">{k('prog1Desc')}</p>
                </div>
                <div className="border border-white/10 bg-[hsl(75_6%_6%)] p-6">
                  <h3 className="font-bebas text-2xl tracking-wide text-white/85">{k('prog2Title')}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-white/60">{k('prog2Desc')}</p>
                </div>
              </div>
              <div className="flex justify-center lg:justify-end"><ProgressionMock /></div>
            </div>
          </Reveal>
          <Reveal className="mt-12">
            <h3 className="font-bebas text-2xl tracking-wide text-white/85">{k('progTableTitle')}</h3>
          </Reveal>
          <SpecTable columns={[k('progColStep'), k('progColReps')]} rows={ladderRows} />
          <LimitNote>{k('progLimit')}</LimitNote>
          <Reveal className="mt-8">
            <p className="max-w-2xl text-sm leading-relaxed text-white/60">
              {withLink(k('progOutro'), '/features/progress', k('linkProgress'), 'progression')}
            </p>
          </Reveal>
        </div>
      </section>

      {/* S6 · Cuando el plan no encaja */}
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('ownEyebrow')} title={k('ownTitle')} lead={k('ownLead')} />
          <Reveal className="mt-12">
            <div className="grid gap-px bg-white/10 sm:grid-cols-3">
              {[1, 2, 3].map(n => (
                <div key={n} className="bg-[hsl(75_8%_3%)] p-6">
                  <h3 className="font-bebas text-2xl leading-tight tracking-wide">{k(`own${n}Title`)}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-white/60">{k(`own${n}Desc`)}</p>
                </div>
              ))}
            </div>
          </Reveal>
          <LimitNote>{k('ownLimit')}</LimitNote>
          <Reveal className="mt-8">
            <p className="max-w-2xl text-sm leading-relaxed text-white/60">
              {withLink(k('ownCircuits'), '/features/circuits', k('linkCircuits'), 'own')}
            </p>
          </Reveal>
        </div>
      </section>

      {/* S7 · Web, Android e iOS */}
      <section className="border-b border-white/10 bg-white/[.025]">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('platEyebrow')} title={k('platTitle')} lead={k('platLead')} />
          <PlatformTable rows={platformRows} />
          <LimitNote>{k('platNote')}</LimitNote>
        </div>
      </section>

      {/* S8 · Preguntas frecuentes */}
      <section>
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 md:px-10 lg:grid-cols-[.72fr_1fr] lg:py-28">
          <SectionHeader eyebrow={t('feature.faqEyebrow')} title={t('feature.faqTitle')} />
          <FaqBlock items={faqItems} />
        </div>
      </section>
    </FeatureShell>
  )
}
