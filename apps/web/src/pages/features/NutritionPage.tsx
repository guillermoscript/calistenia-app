/**
 * `/features/nutrition` — página propia de la épica #279 (issue #281).
 *
 * ⚠️ No confundir con `apps/web/src/pages/NutritionPage.tsx`, que es la pantalla
 * de la app. Esta vive antes del gate de autenticación: no importa nada de
 * `useNutrition`, `usePantry` ni del `AppShell`, porque aquí no hay sesión y
 * arrastrarlos metería medio bundle de producto en el de marketing.
 *
 * Todo el texto sale de `feature.nutrition.*`. Cada afirmación publicada está
 * anclada a código real:
 * - la fórmula de metas y los ajustes por objetivo → `packages/core/lib/nutritionGoal.ts:17-23,72-91`
 * - el agente del análisis de foto y la corrección aritmética → `mcp-server/src/api/meal-analyzer.ts:215-262`
 * - la nota A–E ponderada por calorías → `packages/core/lib/nutrition-quality.ts:17-23`
 * - los precios y la lista de compra, código determinista sin IA → `packages/core/lib/shopping.ts` y `spend.ts`
 *
 * Tres frases que la plantilla publicaba y aquí NO se repiten, porque el código
 * dice lo contrario: que las metas se ajustan a la fase de entrenamiento (la
 * fase solo dispara un banner), que el código de barras está en la app de
 * Android (es solo web) y que se registra «en segundos» (el análisis por foto
 * es un agente de hasta 10 pasos con su propio botón de segundo plano).
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { op } from '@calistenia/core/lib/analytics'
import { AndroidButton, Eyebrow, Reveal, WebButton } from '../../components/landing/shared'
import { FeatureShell } from '../../components/landing/featureShell'
import {
  BackToFeatures, CardGrid, FaqBlock, FaqJsonLd, LimitNote, PlatformTable, SectionHeader, SpecTable, StepFlow,
} from '../../components/landing/featureSections'
import { DayRingPanel, ReviewPanel, ShoppingListPanel, SpendPanel } from './NutritionVisuals'

export default function NutritionPage() {
  const { t } = useTranslation()
  const k = (suffix: string) => t(`feature.nutrition.${suffix}`)

  /** Reemplaza el marcador `{{link}}` de una cadena por un enlace interno real. */
  const withLink = (text: string, to: string, label: string, zone: string): ReactNode => {
    const [before, after] = text.split('{{link}}')
    return (
      <>
        {before}
        <Link
          to={to}
          onClick={() => op.track('cta_clicked', { location: `feature_nutrition_${zone}`, intent: 'feature_detail' })}
          className="font-semibold text-lime underline underline-offset-4 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
        >
          {label}
        </Link>
        {after ?? ''}
      </>
    )
  }

  const loopSteps = [1, 2, 3, 4, 5].map(n => ({ title: k(`loop${n}Title`), desc: k(`loop${n}Desc`) }))

  const ways = [1, 2, 3, 4, 5, 6].map(n => [
    k(`way${n}Way`),
    k(`way${n}When`),
    // Los dos caminos que solo existen en la web se marcan aquí, no en una nota
    // al pie: la página lleva botón de descarga del APK.
    n === 3 || n === 4
      ? <span key="w" className="font-semibold text-amber-300/90">{k(`way${n}Where`)}</span>
      : k(`way${n}Where`),
  ])

  const goals = [1, 2, 3, 4].map(n => [k(`goal${n}Goal`), k(`goal${n}Effect`)])

  const platformRows = [
    { label: k('plat1'), web: true, android: true, ios: false },
    { label: k('plat2'), web: true, android: true, ios: false },
    { label: k('plat3'), web: true, android: true, ios: false },
    { label: k('plat4'), web: true, android: true, ios: false },
    { label: k('plat5'), web: true, android: true, ios: false },
    { label: k('plat6'), web: true, android: true, ios: false },
    { label: k('plat7'), web: true, android: false, ios: false },
    { label: k('plat8'), web: true, android: false, ios: false },
    { label: k('plat9'), web: true, android: true, ios: false },
    { label: k('plat10'), web: false, android: true, ios: false },
  ]

  const faqNumbers = [1, 2, 3, 4, 5, 6]
  const faqPlain = faqNumbers.map(n => ({ q: k(`faq${n}q`), a: k(`faq${n}a`) }))
  const faqItems = faqNumbers.map(n => ({ q: k(`faq${n}q`), a: k(`faq${n}a`) }))

  return (
    <FeatureShell slug="nutrition" metaTitle={k('metaTitle')} metaDesc={k('metaDesc')}>
      <FaqJsonLd items={faqPlain} />

      {/* S1 · Hero */}
      <section className="relative isolate overflow-hidden bg-[radial-gradient(ellipse_at_75%_20%,hsl(74_90%_57%_/_0.14),transparent_40%),hsl(75_8%_3%)] px-6 pb-20 pt-28 md:px-10 lg:pt-32">
        <div aria-hidden="true" className="absolute inset-0 opacity-40 [background-image:linear-gradient(hsl(0_0%_100%_/_0.045)_1px,transparent_1px),linear-gradient(90deg,hsl(0_0%_100%_/_0.045)_1px,transparent_1px)] [background-size:52px_52px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 lg:grid-cols-[1.05fr_.85fr]">
          {/* `min-w-0` en las dos columnas: sin él, el ancho mínimo del panel del
              hero ensancha la pista de la rejilla y a 360 px el h1 se sale. */}
          <div className="min-w-0 max-w-2xl">
            <BackToFeatures />
            <div className="landing-rise mt-8" style={{ animationDelay: '60ms' }}><Eyebrow>{k('eyebrow')}</Eyebrow></div>
            <h1 className="landing-rise mt-5 font-bebas text-[clamp(3.2rem,8vw,6.5rem)] leading-[.86] tracking-tight" style={{ animationDelay: '100ms' }}>
              {k('h1')}
            </h1>
            <p className="landing-rise mt-7 max-w-lg text-lg leading-relaxed text-white/68" style={{ animationDelay: '180ms' }}>{k('heroLead')}</p>
            <div className="landing-rise mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center" style={{ animationDelay: '240ms' }}>
              <AndroidButton location="feature_nutrition_hero" />
              <WebButton location="feature_nutrition_hero" />
            </div>
            <p className="landing-rise mt-5 text-[13px] text-white/45" style={{ animationDelay: '300ms' }}>{t('landing.trust')}</p>
          </div>
          <div className="landing-rise flex min-w-0 flex-col items-center gap-4 lg:items-end" style={{ animationDelay: '260ms' }}>
            <DayRingPanel />
            <p className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-[hsl(75_6%_8%)] px-4 py-2 text-center text-xs font-semibold text-white/70">
              <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-lime" />
              {k('heroBadge')}
            </p>
          </div>
        </div>
      </section>

      {/* S2 · El circuito — la sección que no es la plantilla */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('loopEyebrow')} title={k('loopTitle')} lead={k('loopLead')} />
          <StepFlow items={loopSteps} loopLabel={k('loopBack')} />
          <Reveal className="mt-14">
            <div className="mx-auto max-w-2xl"><ShoppingListPanel /></div>
          </Reveal>
          <LimitNote>{k('loopNote')}</LimitNote>
          <Reveal className="mt-8">
            <p className="max-w-2xl text-sm leading-relaxed text-white/60">
              {withLink(k('loopOutro'), '/features/progress', k('linkProgress'), 'loop')}
            </p>
          </Reveal>
        </div>
      </section>

      {/* S3 · Seis formas de registrar una comida */}
      <section className="border-y border-white/10 bg-white/[.025]">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('waysEyebrow')} title={k('waysTitle')} lead={k('waysLead')} />
          <SpecTable columns={[k('waysColWay'), k('waysColWhen'), k('waysColWhere')]} rows={ways} />
          <Reveal className="mt-12">
            <div className="grid items-start gap-10 lg:grid-cols-[1fr_auto]">
              <p className="max-w-xl text-sm leading-relaxed text-white/60">{k('waysNote')}</p>
              <div className="flex justify-center lg:justify-end"><ReviewPanel /></div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* S4 · Qué mira el análisis */}
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('aiEyebrow')} title={k('aiTitle')} lead={k('aiLead')} />
          <CardGrid items={[1, 2, 3].map(n => ({ title: k(`ai${n}Title`), desc: k(`ai${n}Desc`) }))} />
          <Reveal className="mt-8">
            <p className="max-w-2xl text-sm leading-relaxed text-white/60">{k('aiScore')}</p>
          </Reveal>
          {/* El aviso de que esto no es consejo médico vive aquí, en el cuerpo:
              hoy es la única frase del producto que lo dice. */}
          <LimitNote>{k('aiLimit')}</LimitNote>
        </div>
      </section>

      {/* S5 · Tus números */}
      <section className="border-b border-white/10 bg-white/[.025]">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('goalEyebrow')} title={k('goalTitle')} lead={k('goalLead')} />
          <SpecTable columns={[k('goalColGoal'), k('goalColEffect')]} rows={goals} />
          <Reveal className="mt-8">
            <div className="grid max-w-4xl gap-6 md:grid-cols-2">
              <p className="text-sm leading-relaxed text-white/60">{k('goalPace')}</p>
              <p className="text-sm leading-relaxed text-white/60">{k('goalAuto')}</p>
            </div>
          </Reveal>
          <LimitNote>{withLink(k('goalLimit'), '/features/training', k('linkTraining'), 'goal')}</LimitNote>
        </div>
      </section>

      {/* S6 · El dinero de tu comida */}
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('moneyEyebrow')} title={k('moneyTitle')} lead={k('moneyLead')} />
          <CardGrid items={[1, 2, 3].map(n => ({ title: k(`money${n}Title`), desc: k(`money${n}Desc`) }))} />
          <Reveal className="mt-14">
            <div className="flex justify-center"><SpendPanel /></div>
          </Reveal>
          <LimitNote>{k('moneyLimit')}</LimitNote>
          <Reveal className="mt-8">
            <p className="max-w-2xl text-sm leading-relaxed text-white/60">
              {withLink(k('moneyOutro'), '/features/offline', k('linkOffline'), 'money')}
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
