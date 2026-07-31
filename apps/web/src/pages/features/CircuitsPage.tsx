/**
 * `/features/circuits` — sub-issue #284 de la épica #279.
 *
 * Todo el texto sale de `feature.circuits.*`. Cada dato publicado aquí está
 * anclado a código real, verificado antes de escribir una línea de copy:
 *
 * - dos modos y qué manda en cada uno → `packages/core/types/index.ts:83-101` ·
 *   `apps/web/src/components/circuit/CircuitView.tsx:466-627`
 * - valores por defecto (3 rondas, 40 s / 20 s, 0 s y 60 s de descanso) y los
 *   límites de cada ajuste → `CircuitBuilder.tsx:267-273` y `:405-453`
 * - tiempos propios por ejercicio, 5-120 s → `CircuitBuilder.tsx:232-249`
 * - «prepárate» de 5 s fijos → `CircuitView.tsx:476-484`
 * - aviso a los 11 s, tics en 4-3-2 y rojo bajo 10 s → `CircuitView.tsx:110-137`
 * - sonidos que suenan en silencio y no cortan la música → `apps/mobile/src/lib/sounds.ts:23-45`
 * - restauración a las 24 h y cola offline de 5 → `CircuitSessionContext.tsx:50-53,96-115`
 * - la receta guardada dentro del circuito → `CircuitSessionContext.tsx:135-152`
 * - total de sesiones, racha del ranking y aviso a seguidores →
 *   `pb_hooks/notification_service.pb.js:458-527,546-557`
 *
 * Y estas cosas la página NO las dice, porque el código no las sostiene:
 * - que la configuración se guarde para repetirla (no hay ni una escritura a
 *   storage desde `CircuitBuilder`: al volver, todo son los valores por defecto)
 * - que un circuito entre en el feed de actividad (`useActivityFeed.ts:150-171`
 *   solo une `sessions` + `cardio_sessions`)
 * - «cuenta para tu racha» a secas: la de la pantalla de inicio no los mira
 *   (`useProgress.ts:145-217`); la del ranking sí (`useLeaderboard.ts:89-96`)
 * - que las plantillas existan en Android (`CIRCUIT_PRESETS` solo se importa
 *   desde `apps/web/src/pages/CircuitPage.tsx`)
 * - que se pueda saltar el trabajo en cronometrado, ni que «Hecho» y «Saltar»
 *   hagan cosas distintas: llaman a la misma función (`CircuitView.tsx:528-547`)
 * - que se pueda entrenar con el teléfono bloqueado: el cronómetro es un
 *   intervalo de primer plano, sin servicio ni notificación en vivo
 *
 * Las tres frases falsas que publicaba la plantilla —la configuración que «se
 * guarda para repetirla», los circuitos en «tu actividad» y la racha sin
 * matizar— se han borrado de i18n, no reescrito.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { op } from '@calistenia/core/lib/analytics'
import { AndroidButton, Eyebrow, Reveal, WebButton } from '../../components/landing/shared'
import { FeatureShell } from '../../components/landing/featureShell'
import {
  BackToFeatures, FaqBlock, FaqJsonLd, LimitNote, PlatformTable, SectionHeader, SpecTable,
} from '../../components/landing/featureSections'
import { CircuitDemo, DetailMock, RingPanel } from './CircuitsVisuals'

export default function CircuitsPage() {
  const { t } = useTranslation()
  const k = (suffix: string) => t(`feature.circuits.${suffix}`)

  /** Reemplaza el marcador `{{link}}` de una cadena por un enlace interno real. */
  const withLink = (text: string, to: string, label: string, zone: string): ReactNode => {
    const [before, after] = text.split('{{link}}')
    return (
      <>
        {before}
        <Link
          to={to}
          onClick={() => op.track('cta_clicked', { location: `feature_circuits_${zone}`, intent: 'feature_detail' })}
          className="font-semibold text-lime underline underline-offset-4 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
        >
          {label}
        </Link>
        {after ?? ''}
      </>
    )
  }

  const modeRows = [1, 2, 3, 4, 5].map(n => [k(`mode${n}Aspect`), k(`mode${n}Circuit`), k(`mode${n}Timed`)])
  const cfgRows = [1, 2, 3, 4, 5, 6].map(n => [k(`cfg${n}Setting`), k(`cfg${n}Range`), k(`cfg${n}Default`)])

  /**
   * Paridad de §3 de la issue, verificada fichero a fichero. iOS va sin marcar
   * en todas las filas a propósito: el código RN es el mismo, pero no hay canal
   * de distribución iOS en el repo y `platNote` lo dice sin rodeos.
   */
  const platformRows = [
    { label: k('plat1'), web: true, android: true, ios: false },   // configurador completo
    { label: k('plat2'), web: true, android: true, ios: false },   // cuenta atrás + avisos
    { label: k('plat3'), web: true, android: true, ios: false },   // restauración a 24 h
    { label: k('plat4'), web: true, android: true, ios: false },   // cola offline de 5
    { label: k('plat5'), web: true, android: false, ios: false },  // CIRCUIT_PRESETS, solo web
    { label: k('plat6'), web: true, android: false, ios: false },  // CircuitSessionDetailPage, solo web
    { label: k('plat7'), web: false, android: true, ios: false },  // catálogo local del móvil
    { label: k('plat8'), web: false, android: true, ios: false },  // Health Connect
  ]

  // El JSON-LD quiere texto plano; `faqItems` lleva el enlace real de faq5.
  const faqPlain = [1, 2, 3, 4, 5, 6].map(n => ({
    q: k(`faq${n}q`),
    a: k(`faq${n}a`).replace('{{link}}', k('linkCardio')),
  }))

  const faqItems = [1, 2, 3, 4, 5, 6].map(n => ({
    q: k(`faq${n}q`),
    a: n === 5 ? withLink(k('faq5a'), '/features/cardio', k('linkCardio'), 'faq') : k(`faq${n}a`),
  }))

  const endCards: Array<{ title: string; desc: ReactNode }> = [
    { title: k('end1Title'), desc: k('end1Desc') },
    { title: k('end2Title'), desc: withLink(k('end2Desc'), '/features/progress', k('linkProgress'), 'end') },
    { title: k('end3Title'), desc: k('end3Desc') },
  ]

  return (
    <FeatureShell slug="circuits" metaTitle={k('metaTitle')} metaDesc={k('metaDesc')}>
      <FaqJsonLd items={faqPlain} />

      {/* S1 · Hero — cuando solo tienes veinte minutos */}
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
              <AndroidButton location="feature_circuits_hero" />
              <WebButton location="feature_circuits_hero" />
            </div>
            <p className="landing-rise mt-5 text-[13px] text-white/45" style={{ animationDelay: '300ms' }}>{t('landing.trust')}</p>
          </div>
          <div className="landing-rise flex flex-col items-center gap-4 lg:items-end" style={{ animationDelay: '260ms' }}>
            <RingPanel />
            <p className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-[hsl(75_6%_8%)] px-4 py-2 text-xs font-semibold text-white/70">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-lime" />
              {k('heroBadge')}
            </p>
          </div>
        </div>
      </section>

      {/* S2 · Los dos modos, lado a lado */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('modeEyebrow')} title={k('modeTitle')} lead={k('modeLead')} />
          <SpecTable columns={[k('modeColAspect'), k('modeColCircuit'), k('modeColTimed')]} rows={modeRows} />
        </div>
      </section>

      {/* S3 · El cronómetro, funcionando — la sección que no es la plantilla */}
      <section className="border-y border-white/10 bg-white/[.025]">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('demoEyebrow')} title={k('demoTitle')} lead={k('demoLead')} />
          <div className="mt-12 grid items-center gap-12 lg:grid-cols-[auto_1fr]">
            <Reveal className="flex justify-center"><CircuitDemo /></Reveal>
            <Reveal delay={80}>
              <ul className="grid gap-4 text-sm leading-relaxed text-white/65">
                {[1, 2, 3, 4, 5].map(n => (
                  <li key={n} className="flex gap-3">
                    <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-lime" />
                    <span>{k(`demo${n}`)}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
          <LimitNote>{withLink(k('demoLimit'), '/features/cardio', k('linkCardio'), 'demo')}</LimitNote>
        </div>
      </section>

      {/* S4 · Todo lo que puedes ajustar */}
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('cfgEyebrow')} title={k('cfgTitle')} lead={k('cfgLead')} />
          <SpecTable columns={[k('cfgColSetting'), k('cfgColRange'), k('cfgColDefault')]} rows={cfgRows} />
          <Reveal className="mt-10 grid gap-6 md:grid-cols-2">
            <p className="text-sm leading-relaxed text-white/60">{k('cfgZero')}</p>
            <p className="text-sm leading-relaxed text-white/60">
              {withLink(k('cfgPresets'), '/features/training', k('linkTraining'), 'cfg')}
            </p>
          </Reveal>
          <LimitNote>{k('cfgLimit')}</LimitNote>
        </div>
      </section>

      {/* S5 · Qué pasa cuando terminas */}
      <section className="border-b border-white/10 bg-white/[.025]">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('endEyebrow')} title={k('endTitle')} lead={k('endLead')} />
          <div className="mt-12 grid items-start gap-12 lg:grid-cols-[1fr_auto]">
            <Reveal>
              <div className="grid gap-px bg-white/10">
                {endCards.map(card => (
                  <div key={card.title} className="bg-[hsl(75_8%_3%)] p-6">
                    <h3 className="font-bebas text-2xl leading-tight tracking-wide">{card.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-white/60">{card.desc}</p>
                  </div>
                ))}
              </div>
            </Reveal>
            <Reveal delay={80} className="flex justify-center lg:justify-end"><DetailMock /></Reveal>
          </div>
          <LimitNote>{k('endLimit')}</LimitNote>
        </div>
      </section>

      {/* S6 · Web, Android e iOS */}
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('platEyebrow')} title={k('platTitle')} lead={k('platLead')} />
          <PlatformTable rows={platformRows} />
          <LimitNote>{k('platNote')}</LimitNote>
        </div>
      </section>

      {/* S7 · Preguntas frecuentes */}
      <section>
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 md:px-10 lg:grid-cols-[.72fr_1fr] lg:py-28">
          <SectionHeader eyebrow={t('feature.faqEyebrow')} title={t('feature.faqTitle')} />
          <FaqBlock items={faqItems} />
        </div>
      </section>
    </FeatureShell>
  )
}
