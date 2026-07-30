/**
 * `/features/cardio` — primera página propia de la épica #279.
 *
 * Todo el texto sale de `feature.cardio.*`; las únicas cadenas literales son
 * nombres de plataforma, emoji, códigos de color y cifras de las tablas que ya
 * viven en i18n. Cada dato publicado aquí está anclado a código real: las
 * constantes de precisión vienen de `packages/core/lib/cardio-fix.ts` y las
 * reglas de ritmo, splits y calidad de traza de `packages/core/lib/geo.ts`.
 *
 * Los visuales son mocks HTML/CSS a propósito: la sesión en vivo y la
 * notificación del sistema no se pueden capturar sin GPS real ni dispositivo.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { op } from '@calistenia/core/lib/analytics'
import { AndroidButton, Eyebrow, Reveal, WebButton } from '../../components/landing/shared'
import { FeatureShell } from '../../components/landing/featureShell'
import {
  BackToFeatures, FaqBlock, FaqJsonLd, LimitNote, PhoneFrame, PlatformTable, SectionHeader, SpecTable, Walkthrough,
} from '../../components/landing/featureSections'

/** Colores de ruta reales del producto (`packages/core/lib/static-map.ts:191-204`). */
const ROUTE_COLORS = { running: '#84cc16', walking: '#f59e0b', cycling: '#0ea5e9' } as const

export default function CardioPage() {
  const { t } = useTranslation()
  const k = (suffix: string) => t(`feature.cardio.${suffix}`)

  /** Reemplaza el marcador `{{link}}` de una cadena por un enlace interno real. */
  const withLink = (text: string, to: string, label: string, zone: string): ReactNode => {
    const [before, after] = text.split('{{link}}')
    return (
      <>
        {before}
        <Link
          to={to}
          onClick={() => op.track('cta_clicked', { location: `feature_cardio_${zone}`, intent: 'feature_detail' })}
          className="font-semibold text-lime underline underline-offset-4 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
        >
          {label}
        </Link>
        {after ?? ''}
      </>
    )
  }

  const metrics = [1, 2, 3, 4, 5, 6, 7, 8].map(n => [k(`m${n}Name`), k(`m${n}Source`), k(`m${n}Note`)])

  const activities = ([
    ['running', '🏃', 1],
    ['walking', '🚶', 2],
    ['cycling', '🚴', 3],
  ] as const).map(([key, emoji, n]) => [
    <span key="n" className="flex items-center gap-2"><span aria-hidden="true">{emoji}</span>{k(`act${n}Name`)}</span>,
    k(`act${n}Unit`),
    k(`act${n}Met`),
    k(`act${n}Max`),
    <span key="c" className="flex items-center gap-2">
      <span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: ROUTE_COLORS[key] }} />
      {k(`act${n}Color`)}
    </span>,
  ])

  const quality = [
    [k('qualityGood'), k('qualityGoodDesc')],
    [k('qualityEstimated'), k('qualityEstimatedDesc')],
    [k('qualityPoor'), k('qualityPoorDesc')],
  ]

  const platformRows = [
    { label: k('p1'), web: true, android: true, ios: false },
    { label: k('p2'), web: false, android: true, ios: false },
    { label: k('p3'), web: false, android: true, ios: false },
    { label: k('p4'), web: false, android: true, ios: false },
    { label: k('p5'), web: false, android: true, ios: false },
    { label: k('p6'), web: true, android: true, ios: false },
    { label: k('p7'), web: true, android: false, ios: false },
    { label: k('p8'), web: true, android: false, ios: false },
    { label: k('p9'), web: false, android: true, ios: false },
    { label: k('p10'), web: false, android: true, ios: false },
    { label: k('p11'), web: true, android: true, ios: false },
    { label: k('p12'), web: true, android: true, ios: false },
  ]

  const faqPlain = [1, 2, 3, 4, 5].map(n => ({
    q: k(`fq${n}`),
    a: k(`fa${n}`).replace('{{link}}', k('linkRaces')),
  }))

  const faqItems = [1, 2, 3, 4, 5].map(n => ({
    q: k(`fq${n}`),
    a: n === 4 ? withLink(k('fa4'), '/features/races', k('linkRaces'), 'faq') : k(`fa${n}`),
  }))

  return (
    <FeatureShell slug="cardio" metaTitle={k('metaTitle')} metaDesc={k('metaDesc')}>
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
              <AndroidButton location="feature_cardio_hero" />
              <WebButton location="feature_cardio_hero" />
            </div>
            <p className="landing-rise mt-5 text-[13px] text-white/45" style={{ animationDelay: '300ms' }}>{t('landing.trust')}</p>
          </div>
          <div className="landing-rise flex flex-col items-center gap-4 lg:items-end" style={{ animationDelay: '260ms' }}>
            <SessionMapMock />
            <p className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-[hsl(75_6%_8%)] px-4 py-2 text-xs font-semibold text-white/70">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-lime" />
              {k('heroBadge')}
            </p>
          </div>
        </div>
      </section>

      {/* S2 · Qué mide, dato por dato */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('measureEyebrow')} title={k('measureTitle')} lead={k('measureLead')} />
          <SpecTable
            columns={[k('measureColMetric'), k('measureColSource'), k('measureColNote')]}
            rows={metrics}
          />
        </div>
      </section>

      {/* S3 · Una carrera, de principio a fin */}
      <section className="border-y border-white/10 bg-white/[.025]">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('runEyebrow')} title={k('runTitle')} lead={k('runLead')} />
          <Walkthrough
            items={[
              { label: k('run1Label'), title: k('run1Title'), desc: k('run1Desc'), visual: <PickerMock /> },
              { label: k('run2Label'), title: k('run2Title'), desc: k('run2Desc'), visual: <LiveSessionMock /> },
              { label: k('run3Label'), title: k('run3Title'), desc: k('run3Desc'), visual: <LockScreenMock /> },
              { label: k('run4Label'), title: k('run4Title'), desc: k('run4Desc'), visual: <SummaryMock /> },
            ]}
          />
          <LimitNote>{k('runKmHaptic')}</LimitNote>
          <Reveal className="mt-8">
            <p className="max-w-2xl text-sm leading-relaxed text-white/60">
              {withLink(k('runOutro'), '/features/progress', k('linkProgress'), 'outro')}
            </p>
          </Reveal>
        </div>
      </section>

      {/* S4 · Tres actividades */}
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('actEyebrow')} title={k('actTitle')} lead={k('actLead')} />
          <SpecTable
            columns={[k('actColActivity'), k('actColUnit'), k('actColMet'), k('actColMax'), k('actColColor')]}
            rows={activities}
          />
          <Reveal className="mt-6">
            <p className="max-w-2xl text-sm leading-relaxed text-white/50">{k('actNote')}</p>
          </Reveal>
        </div>
      </section>

      {/* S5 · Cuando el GPS falla, te lo decimos */}
      <section className="border-b border-white/10 bg-white/[.025]">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('gapEyebrow')} title={k('gapTitle')} lead={k('gapLead')} />
          <Reveal className="mt-12">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="border border-white/10 bg-[hsl(75_6%_6%)] p-6">
                <h3 className="font-bebas text-2xl tracking-wide text-white/45">{k('gapBeforeTitle')}</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/45">{k('gapBeforeDesc')}</p>
              </div>
              <div className="border border-lime/40 bg-lime/[.06] p-6">
                <h3 className="font-bebas text-2xl tracking-wide text-lime">{k('gapAfterTitle')}</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/75">{k('gapAfterDesc')}</p>
              </div>
            </div>
          </Reveal>
          <SpecTable columns={[k('gapColGrade'), k('gapColMeaning')]} rows={quality} />
          <LimitNote>{withLink(k('gapLimit'), '/features/offline', k('linkOffline'), 'gap')}</LimitNote>
        </div>
      </section>

      {/* S6 · Web o Android */}
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('platEyebrow')} title={k('platTitle')} lead={k('platLead')} />
          <PlatformTable rows={platformRows} />
          <LimitNote>{k('platNote')}</LimitNote>
        </div>
      </section>

      {/* S7 · Lo que todavía no hace */}
      <section className="border-b border-white/10 bg-white/[.025]">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('limitEyebrow')} title={k('limitTitle')} />
          <Reveal className="mt-12">
            <ul className="grid max-w-3xl gap-px bg-white/10">
              {[1, 2, 3, 4, 5, 6, 7].map(n => (
                <li key={n} className="flex gap-4 bg-[hsl(75_8%_3%)] px-5 py-4 text-sm leading-relaxed text-white/60">
                  <span aria-hidden="true" className="mt-2 h-px w-4 shrink-0 bg-white/25" />
                  {k(`limit${n}`)}
                </li>
              ))}
            </ul>
          </Reveal>
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

/* ─────────────────────────── Visuales de la página ─────────────────────────
 * Mocks HTML/CSS con los textos y las cifras reales de la app. No son capturas:
 * el estado en vivo exige GPS real y la notificación exige un dispositivo.
 * ------------------------------------------------------------------------- */

/** Traza sintética; nunca una ruta real (empieza y acaba en el portal de casa). */
const ROUTE_PATH = 'M22 150 C 48 96, 96 88, 124 112 S 176 168, 214 148 S 262 92, 288 108 S 316 156, 300 176'

/** Hero: detalle de una sesión con su ruta sobre el mapa. */
function SessionMapMock() {
  const { t } = useTranslation()
  return (
    <div className="w-full max-w-sm border border-white/10 bg-[hsl(75_6%_6%)] shadow-2xl shadow-black/40">
      <div className="relative h-52 overflow-hidden bg-[hsl(75_10%_8%)]">
        <div aria-hidden="true" className="absolute inset-0 opacity-60 [background-image:linear-gradient(hsl(0_0%_100%_/_0.05)_1px,transparent_1px),linear-gradient(90deg,hsl(0_0%_100%_/_0.05)_1px,transparent_1px)] [background-size:28px_28px]" />
        <svg viewBox="0 0 320 200" className="relative h-full w-full" role="img" aria-label={t('feature.cardio.shot1Alt')}>
          <path d={ROUTE_PATH} fill="none" stroke="hsl(74 90% 57%)" strokeOpacity=".18" strokeWidth="10" strokeLinecap="round" />
          <path d={ROUTE_PATH} fill="none" stroke="hsl(74 90% 57%)" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="22" cy="150" r="5" fill="hsl(74 90% 57%)" />
          <circle cx="300" cy="176" r="5.5" fill="#0a0a0a" stroke="hsl(74 90% 57%)" strokeWidth="3" />
        </svg>
      </div>
      <div className="grid grid-cols-3 divide-x divide-white/10 border-t border-white/10">
        {[['5,24', 'KM'], ['28:32', 'MIN'], ['5:42', 'MIN/KM']].map(([value, unit]) => (
          <div key={unit} className="px-4 py-4 text-center">
            <p className="font-bebas text-2xl leading-none tracking-wide text-white">{value}</p>
            <p className="mt-1.5 text-[10px] uppercase tracking-[.16em] text-white/40">{unit}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Paso 1: el selector de actividad. */
function PickerMock() {
  const { t } = useTranslation()
  return (
    <PhoneFrame width={272}>
      <div className="px-5 pb-7 pt-5">
        <p className="text-[10px] uppercase tracking-[.18em] text-white/40">{t('feature.cardio.actEyebrow')}</p>
        <div className="mt-4 grid gap-2.5">
          {([['running', '🏃', 1], ['walking', '🚶', 2], ['cycling', '🚴', 3]] as const).map(([key, emoji, n], i) => (
            <div
              key={key}
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${i === 0 ? 'border-lime bg-lime/10' : 'border-white/10'}`}
            >
              <span aria-hidden="true" className="text-lg">{emoji}</span>
              <span className={`text-sm ${i === 0 ? 'font-semibold text-white' : 'text-white/60'}`}>
                {t(`feature.cardio.act${n}Name`)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-lg bg-lime py-3 text-center font-bebas text-lg tracking-[.12em] text-[hsl(75_8%_5%)]">
          {t('cardio.start')}
        </div>
      </div>
    </PhoneFrame>
  )
}

/** Paso 2: sesión en curso, con el chip de precisión y el split en marcha. */
function LiveSessionMock() {
  const { t } = useTranslation()
  return (
    <PhoneFrame width={272}>
      <div className="px-5 pb-7 pt-5">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.16em] text-red-400">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-red-500" />
            {t('cardio.recording')}
          </span>
          <span className="rounded-full bg-lime/15 px-2.5 py-1 font-mono text-[10px] text-lime">6 m</span>
        </div>
        <p className="mt-5 text-center font-bebas text-6xl leading-none tracking-wide">28:32</p>
        <div className="mt-5 grid grid-cols-2 divide-x divide-white/10 border-y border-white/10">
          {[['5,24', 'KM'], ['5:42', 'MIN/KM']].map(([value, unit]) => (
            <div key={unit} className="py-3.5 text-center">
              <p className="font-bebas text-2xl leading-none tracking-wide">{value}</p>
              <p className="mt-1.5 text-[10px] uppercase tracking-[.16em] text-white/40">{unit}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-center font-mono text-[11px] text-white/45">KM 5 · 4:12</p>
        <div className="mt-4 h-20 overflow-hidden rounded-lg bg-[hsl(75_10%_8%)]">
          <svg viewBox="0 0 320 200" className="h-full w-full" aria-hidden="true">
            <path d={ROUTE_PATH} fill="none" stroke="hsl(74 90% 57%)" strokeWidth="7" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </PhoneFrame>
  )
}

/**
 * Paso 3: la notificación del foreground service, con los strings exactos de
 * `apps/mobile/src/lib/cardio-live.ts:80-108`.
 */
function LockScreenMock() {
  const { t } = useTranslation()
  return (
    <div className="w-full max-w-xs rounded-3xl border border-white/12 bg-[hsl(75_8%_7%)] p-4 shadow-2xl shadow-black/60">
      <p className="text-center font-bebas text-4xl leading-none tracking-wide text-white/85">09:41</p>
      <div className="mt-5 rounded-2xl border border-white/10 bg-[hsl(75_6%_11%)] p-4">
        <div className="flex items-center gap-2 text-[11px] text-white/45">
          <img src="/logo.png" alt="" width={16} height={16} className="h-4 w-4 rounded" />
          <span>Calistenia</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono">00:29:41</span>
        </div>
        <p className="mt-2.5 text-sm font-semibold text-white">
          <span aria-hidden="true">🏃</span> {t('feature.cardio.act1Name')} — {t('cardio.recording')}
        </p>
        <p className="mt-1 font-mono text-xs text-white/60">5.24 km · 5:42 /km</p>
        <div className="mt-3 border-t border-white/10 pt-2.5">
          <span className="text-xs font-bold uppercase tracking-[.14em]" style={{ color: '#a3e635' }}>
            {t('cardio.pause')}
          </span>
        </div>
      </div>
    </div>
  )
}

/** Paso 4: el resumen con mapa, stats y parciales. */
function SummaryMock() {
  const { t } = useTranslation()
  const splits: Array<[string, string, number]> = [
    ['1', '5:38', 92], ['2', '5:44', 86], ['3', '5:31', 100], ['4', '5:52', 74], ['5', '5:42', 90],
  ]
  return (
    <PhoneFrame width={272}>
      <div className="px-5 pb-7 pt-5">
        <div className="h-24 overflow-hidden rounded-lg bg-[hsl(75_10%_8%)]">
          <svg viewBox="0 0 320 200" className="h-full w-full" aria-hidden="true">
            <path d={ROUTE_PATH} fill="none" stroke="hsl(74 90% 57%)" strokeWidth="7" strokeLinecap="round" />
          </svg>
        </div>
        <div className="mt-4 grid grid-cols-3 divide-x divide-white/10 border-y border-white/10">
          {[['5,24', 'KM'], ['28:32', 'MIN'], ['312', 'KCAL']].map(([value, unit]) => (
            <div key={unit} className="py-3 text-center">
              <p className="font-bebas text-xl leading-none tracking-wide">{value}</p>
              <p className="mt-1 text-[9px] uppercase tracking-[.14em] text-white/40">{unit}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[10px] uppercase tracking-[.16em] text-white/40">{t('feature.cardio.m3Name')}</p>
        <div className="mt-2.5 grid gap-1.5">
          {splits.map(([km, pace, pct]) => (
            <div key={km} className="flex items-center gap-2.5">
              <span className="w-3 font-mono text-[10px] text-white/35">{km}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/8">
                <span className="block h-full rounded-full bg-lime" style={{ width: `${pct}%` }} />
              </span>
              <span className="w-9 text-right font-mono text-[10px] text-white/55">{pace}</span>
            </div>
          ))}
        </div>
      </div>
    </PhoneFrame>
  )
}
