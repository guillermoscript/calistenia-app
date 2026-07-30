/**
 * `/features/progress` — página propia de la épica #279 (issue #282).
 *
 * ⚠️ No confundir con `apps/web/src/pages/ProgressPage.tsx`, que es la pantalla
 * de la app. Esta vive antes del gate de autenticación: no importa `useProgress`,
 * `monthActivity` ni nada de `components/progress/*`, porque todos asumen sesión
 * y arrastrarían Recharts al bundle de marketing.
 *
 * Todo el texto sale de `feature.progress.*`. Cada afirmación publicada está
 * anclada a código real:
 * - las once señales del calendario y su origen → `apps/web/src/pages/CalendarPage.tsx:296-312`
 *   y `packages/core/lib/monthActivity.ts`
 * - los récords que se recalculan solos al abrir la app → `packages/core/lib/prs.ts`
 * - el resumen semanal, sus métricas insuficientes y sus «posibles patrones»
 *   → `mcp-server/src/api/insights.ts`
 * - quién puede leer cada dato → reglas de lectura de PocketBase en
 *   `pb_migrations/1775100007_open_leaderboard_read_rules.js`,
 *   `1777000005_relax_sets_log_read_rules.js` y `1778000002_block_read_rules.js`
 *
 * Frases de la plantilla que aquí NO se repiten porque el código dice otra cosa:
 * que el calendario junta «seis métricas» (son once señales), que las fotos y
 * las medidas las ve «solo tú» (la sección S6 lo cuenta completo) y que las
 * gráficas están en todas partes (son solo web).
 *
 * Esta pasada no publica capturas: la S6 deja claro que aquí se guardan fotos
 * del cuerpo, así que las capturas necesitan una cuenta de prueba con datos
 * inventados y se hacen aparte.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { op } from '@calistenia/core/lib/analytics'
import { AndroidButton, Eyebrow, Reveal, WebButton } from '../../components/landing/shared'
import { FeatureShell } from '../../components/landing/featureShell'
import {
  BackToFeatures, CardGrid, FaqBlock, FaqJsonLd, LimitNote, PlatformTable, SectionHeader, SpecTable,
} from '../../components/landing/featureSections'
import { MonthDotsPanel } from './ProgressVisuals'

/**
 * Puntos de la leyenda del calendario, en el mismo orden que las filas
 * `cal1..cal11`. Literales y copiados de `CalendarPage.tsx:296-312`: si aquí se
 * componen en runtime, el purge de Tailwind se los come.
 */
const CAL_DOTS = [
  'bg-lime',
  'bg-violet-400',
  'bg-sky-400',
  'bg-orange-500',
  'bg-amber-400',
  'bg-cyan-400',
  'bg-indigo-400',
  'bg-rose-400',
  'bg-teal-400',
  'bg-fuchsia-400',
  'bg-emerald-400',
]

export default function ProgressPage() {
  const { t } = useTranslation()
  const k = (suffix: string) => t(`feature.progress.${suffix}`)

  /** Enlace interno en prosa, con su evento de analítica por zona. */
  const featureLink = (to: string, label: string, zone: string): ReactNode => (
    <Link
      to={to}
      onClick={() => op.track('cta_clicked', { location: `feature_progress_${zone}`, intent: 'feature_detail' })}
      className="font-semibold text-lime underline underline-offset-4 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
    >
      {label}
    </Link>
  )

  const calRows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(n => [k(`cal${n}Signal`), k(`cal${n}Source`)])

  // Las cinco miradas a la fuerza son de la web: se marcan celda a celda, no en
  // una nota al pie, porque la página lleva botón de descarga del APK.
  const strRows = [1, 2, 3, 4, 5].map(n => [
    k(`str${n}What`),
    k(`str${n}Means`),
    <span key="w" className="font-semibold text-amber-300/90">{k(`str${n}Where`)}</span>,
  ])

  const privRows = [1, 2, 3, 4, 5, 6].map(n => [
    k(`priv${n}What`),
    // La fila 5 son las marcas que alimentan la clasificación: es la única que
    // otras cuentas pueden leer, así que enlaza a dónde acaban.
    n === 5
      ? (
        <span key="who" className="block">
          {k('priv5Who')}
          <span className="mt-2 block">{featureLink('/features/community', k('linkCommunity'), 'priv')}</span>
        </span>
      )
      : k(`priv${n}Who`),
  ])

  const platformRows = [
    { label: k('plat1'), web: true, android: true, ios: false },
    { label: k('plat2'), web: true, android: true, ios: false },
    { label: k('plat3'), web: true, android: true, ios: false },
    { label: k('plat4'), web: true, android: true, ios: false },
    { label: k('plat5'), web: true, android: true, ios: false },
    { label: k('plat6'), web: true, android: false, ios: false },
    { label: k('plat7'), web: true, android: false, ios: false },
    { label: k('plat8'), web: true, android: false, ios: false },
    { label: k('plat9'), web: true, android: false, ios: false },
    { label: k('plat10'), web: false, android: true, ios: false },
  ]

  const faqNumbers = [1, 2, 3, 4, 5, 6]
  const faqPlain = faqNumbers.map(n => ({ q: k(`faq${n}q`), a: k(`faq${n}a`) }))

  return (
    <FeatureShell slug="progress" metaTitle={k('metaTitle')} metaDesc={k('metaDesc')}>
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
              <AndroidButton location="feature_progress_hero" />
              <WebButton location="feature_progress_hero" />
            </div>
            <p className="landing-rise mt-5 text-[13px] text-white/45" style={{ animationDelay: '300ms' }}>{t('landing.trust')}</p>
          </div>
          <div className="landing-rise flex min-w-0 flex-col items-center gap-4 lg:items-end" style={{ animationDelay: '260ms' }}>
            <MonthDotsPanel />
            <p className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-[hsl(75_6%_8%)] px-4 py-2 text-center text-xs font-semibold text-white/70">
              <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-lime" />
              {k('heroBadge')}
            </p>
          </div>
        </div>
      </section>

      {/* S2 · Las once señales del calendario — el inventario que nadie publica */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('calEyebrow')} title={k('calTitle')} lead={k('calLead')} />
          <SpecTable columns={[k('calColSignal'), k('calColSource')]} rows={calRows} dots={CAL_DOTS} />
          <Reveal className="mt-8">
            <div className="grid max-w-4xl gap-6 md:grid-cols-2">
              <p className="text-sm leading-relaxed text-white/60">{k('calDay')}</p>
              <p className="text-sm leading-relaxed text-white/60">{k('calResilience')}</p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* S3 · Qué se mide del entrenamiento */}
      <section className="border-y border-white/10 bg-white/[.025]">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('strEyebrow')} title={k('strTitle')} lead={k('strLead')} />
          <SpecTable columns={[k('strColWhat'), k('strColMeans'), k('strColWhere')]} rows={strRows} />
          <Reveal className="mt-12">
            <div className="max-w-2xl">
              <h3 className="font-bebas text-3xl leading-tight tracking-wide sm:text-4xl">{k('prTitle')}</h3>
              <p className="mt-4 text-sm leading-relaxed text-white/60">{k('prDesc')}</p>
              <p className="mt-4 text-sm leading-relaxed text-white/60">{k('prCelebrate')}</p>
            </div>
          </Reveal>
          <LimitNote>{k('strLimit')}</LimitNote>
          <Reveal className="mt-8">
            <p className="text-sm leading-relaxed">{featureLink('/features/training', k('linkTraining'), 'str')}</p>
          </Reveal>
        </div>
      </section>

      {/* S4 · Tu cuerpo */}
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('bodyEyebrow')} title={k('bodyTitle')} lead={k('bodyLead')} />
          <CardGrid cols={4} items={[1, 2, 3, 4].map(n => ({ title: k(`body${n}Title`), desc: k(`body${n}Desc`) }))} />
          <LimitNote>{k('bodyLimit')}</LimitNote>
        </div>
      </section>

      {/* S5 · El resumen semanal */}
      <section className="border-b border-white/10 bg-white/[.025]">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('weekEyebrow')} title={k('weekTitle')} lead={k('weekLead')} />
          <CardGrid items={[1, 2, 3].map(n => ({ title: k(`week${n}Title`), desc: k(`week${n}Desc`) }))} />
          {/* Que esto no es consejo médico se dice en el cuerpo, no solo en el FAQ. */}
          <LimitNote>{k('weekLimit')}</LimitNote>
          <Reveal className="mt-8">
            <p className="text-sm leading-relaxed">{featureLink('/features/nutrition', k('linkNutrition'), 'week')}</p>
          </Reveal>
        </div>
      </section>

      {/* S6 · Qué es privado y qué no — la sección que esta función se debe */}
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('privEyebrow')} title={k('privTitle')} lead={k('privLead')} />
          <SpecTable columns={[k('privColWhat'), k('privColWho')]} rows={privRows} />
          <LimitNote>
            {k('privLimit')}
            <span className="mt-3 block">
              <Link
                to="/legal"
                className="font-semibold text-lime underline underline-offset-4 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
              >
                {k('privLegalLink')}
              </Link>
            </span>
          </LimitNote>
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
          <FaqBlock items={faqPlain} />
        </div>
      </section>
    </FeatureShell>
  )
}
