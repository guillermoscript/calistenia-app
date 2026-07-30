/**
 * `/features/races` — sub-issue #285 de la épica #279.
 *
 * Todo el texto sale de `feature.races.*`. Cada dato publicado aquí está
 * anclado a código real, verificado antes de escribir una línea de copy:
 *
 * - salida de 7 s y ventana de 3 h → `apps/web/src/lib/race/raceApi.ts:12-13`
 * - push de progreso cada 3 s, reintentos 1/3/9 s, watchdog de 30 s →
 *   `apps/web/src/contexts/RaceContext.tsx:75-76,134-147`
 * - fixes peores de 30 m descartados, tramos de 0 a 500 m →
 *   `apps/web/src/lib/race/raceTracker.ts:30,70,76`
 * - reloj de servidor y rehidratación → `raceClock.ts` · `raceSnapshot.ts`
 * - quién gana según el modo → `packages/core/lib/race-sort.ts:22-42`
 * - entrar durante la cuenta atrás, no después →
 *   `pb_migrations/1776000004_allow_late_join.js:13`
 * - previsualización del enlace solo si es pública → `pb_hooks/race_og_tags.pb.js:42-45`
 *
 * Y estas cosas la página NO las dice, porque el código no las sostiene:
 * - que el servidor cierre la carrera (lo dispara un cliente con la pantalla
 *   abierta; si todos cierran la app, se queda `active`)
 * - que llegue alguna notificación de carrera (no hay ni una)
 * - que puedas bloquear el teléfono (el tracker es de primer plano)
 * - que sin cuenta puedas ver la carrera (`RacePage.tsx:29-42` solo da login)
 * - que haya antitrampas, validación de la ruta dibujada o aviso de «sin señal»
 *
 * Las cuatro frases falsas que publicaba la plantilla —objetivo de distancia
 * *y* duración, salida libre por participante, cierre automático al vencer la
 * ventana y espectadores sin cuenta— se han borrado de i18n, no reescrito.
 *
 * Los visuales son mocks HTML/CSS: una captura real de una carrera lleva un
 * mapa con la traza de alguien, y eso empieza en el portal de su casa.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { op } from '@calistenia/core/lib/analytics'
import { AndroidButton, Eyebrow, Reveal, WebButton } from '../../components/landing/shared'
import { FeatureShell } from '../../components/landing/featureShell'
import {
  BackToFeatures, FaqBlock, FaqJsonLd, LimitNote, PlatformTable, SectionHeader, SpecTable, StateWalkthrough,
} from '../../components/landing/featureSections'
import { CountdownMock, LiveMock, LobbyMock, RaceBoardPanel, ResultsMock } from './RacesVisuals'

export default function RacesPage() {
  const { t } = useTranslation()
  const k = (suffix: string) => t(`feature.races.${suffix}`)

  /** Reemplaza el marcador `{{link}}` de una cadena por un enlace interno real. */
  const withLink = (text: string, to: string, label: string, zone: string): ReactNode => {
    const [before, after] = text.split('{{link}}')
    return (
      <>
        {before}
        <Link
          to={to}
          onClick={() => op.track('cta_clicked', { location: `feature_races_${zone}`, intent: 'feature_detail' })}
          className="font-semibold text-lime underline underline-offset-4 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
        >
          {label}
        </Link>
        {after ?? ''}
      </>
    )
  }

  const lifecycle = [
    { badge: k('life1Badge'), title: k('life1Title'), desc: k('life1Desc'), actions: k('life1Actions'), visual: <LobbyMock /> },
    { badge: k('life2Badge'), title: k('life2Title'), desc: k('life2Desc'), actions: k('life2Actions'), visual: <CountdownMock /> },
    { badge: k('life3Badge'), title: k('life3Title'), desc: k('life3Desc'), actions: k('life3Actions'), visual: <LiveMock /> },
    {
      badge: k('life4Badge'),
      title: k('life4Title'),
      // El resultado acaba en el historial, así que el paso 4 enlaza a progreso.
      desc: withLink(k('life4Desc'), '/features/progress', k('linkProgress'), 'lifecycle'),
      actions: k('life4Actions'),
      visual: <ResultsMock />,
    },
  ]

  const boardRows = [1, 2, 3, 4, 5].map(n => [k(`board${n}Name`), k(`board${n}Desc`)])
  const rankRows = [1, 2, 3].map(n => [k(`rank${n}Mode`), k(`rank${n}Rule`)])
  const vsRows = [1, 2, 3, 4, 5].map(n => [k(`vs${n}Aspect`), k(`vs${n}Race`), k(`vs${n}Challenge`)])

  /**
   * Paridad de §3 de la issue, verificada fichero a fichero. iOS va sin marcar
   * en todas las filas a propósito: el código RN es el mismo, pero no hay canal
   * de distribución iOS en el repo y `platNote` lo dice sin rodeos.
   */
  const platformRows = [
    { label: k('plat1'), web: true, android: true, ios: false },   // crear + unirse por enlace
    { label: k('plat2'), web: true, android: true, ios: false },   // sala de espera en vivo
    { label: k('plat3'), web: true, android: true, ios: false },   // cuenta atrás con sonido y vibración
    { label: k('plat4'), web: true, android: true, ios: false },   // tabla + mapa (Leaflet / MapLibre)
    { label: k('plat5'), web: true, android: false, ios: false },  // RouteDrawer, solo web
    { label: k('plat6'), web: true, android: false, ios: false },  // QR de api.qrserver.com, solo web
    { label: k('plat7'), web: true, android: false, ios: false },  // playRankUp/Down, solo web
    { label: k('plat8'), web: false, android: true, ios: false },  // haptics.success() por km, solo móvil
    { label: k('plat9'), web: true, android: false, ios: false },  // RaceShareCard + GPX, solo web
    { label: k('plat10'), web: true, android: true, ios: false },  // useDiscoverRaces
  ]

  // El JSON-LD quiere texto plano; `faqItems` lleva el enlace real de faq6.
  const faqPlain = [1, 2, 3, 4, 5, 6].map(n => ({
    q: k(`faq${n}q`),
    a: k(`faq${n}a`).replace('{{link}}', k('linkCardio')),
  }))

  const faqItems = [1, 2, 3, 4, 5, 6].map(n => ({
    q: k(`faq${n}q`),
    a: n === 6 ? withLink(k('faq6a'), '/features/cardio', k('linkCardio'), 'faq') : k(`faq${n}a`),
  }))

  return (
    <FeatureShell slug="races" metaTitle={k('metaTitle')} metaDesc={k('metaDesc')}>
      <FaqJsonLd items={faqPlain} />

      {/* S1 · Hero — la ventana de tiempo */}
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
              <AndroidButton location="feature_races_hero" />
              <WebButton location="feature_races_hero" />
            </div>
            <p className="landing-rise mt-5 text-[13px] text-white/45" style={{ animationDelay: '300ms' }}>{t('landing.trust')}</p>
          </div>
          <div className="landing-rise flex flex-col items-center gap-4 lg:items-end" style={{ animationDelay: '260ms' }}>
            <RaceBoardPanel />
            <p className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-[hsl(75_6%_8%)] px-4 py-2 text-xs font-semibold text-white/70">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-lime" />
              {k('heroBadge')}
            </p>
          </div>
        </div>
      </section>

      {/* S2 · El ciclo de vida en cuatro estados — la sección que no es la plantilla */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('lifeEyebrow')} title={k('lifeTitle')} lead={k('lifeLead')} />
          <StateWalkthrough items={lifecycle} />
          <LimitNote>{k('lifeNote')}</LimitNote>
        </div>
      </section>

      {/* S3 · El enlace de invitación */}
      <section className="border-y border-white/10 bg-white/[.025]">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('linkEyebrow')} title={k('linkTitle')} lead={k('linkLead')} />
          <Reveal className="mt-12">
            <div className="grid gap-px bg-white/10 md:grid-cols-3">
              {[1, 2, 3].map(n => (
                <div key={n} className="flex flex-col bg-[hsl(75_8%_3%)] p-6">
                  <h3 className="font-bebas text-2xl leading-tight tracking-wide">{k(`link${n}Title`)}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-white/60">{k(`link${n}Desc`)}</p>
                </div>
              ))}
            </div>
          </Reveal>
          <LimitNote>{k('linkLimit')}</LimitNote>
        </div>
      </section>

      {/* S4 · Anatomía de la tabla en vivo */}
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('boardEyebrow')} title={k('boardTitle')} lead={k('boardLead')} />
          <Reveal className="mt-12 flex justify-center"><RaceBoardPanel /></Reveal>
          <SpecTable columns={[k('boardColName'), k('boardColMeaning')]} rows={boardRows} />
          <Reveal className="mt-16">
            <h3 className="font-bebas text-3xl leading-tight tracking-wide sm:text-4xl">{k('rankTitle')}</h3>
          </Reveal>
          <SpecTable columns={[k('rankColMode'), k('rankColRule')]} rows={rankRows} />
        </div>
      </section>

      {/* S5 · Qué pasa cuando falla algo */}
      <section className="border-b border-white/10 bg-white/[.025]">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('robustEyebrow')} title={k('robustTitle')} lead={k('robustLead')} />
          <Reveal className="mt-12">
            <div className="grid gap-px bg-white/10 sm:grid-cols-2">
              {[1, 2, 3, 4].map(n => (
                <div key={n} className="flex flex-col bg-[hsl(75_8%_3%)] p-6">
                  <h3 className="font-bebas text-2xl leading-tight tracking-wide">{k(`robust${n}Title`)}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-white/60">{k(`robust${n}Desc`)}</p>
                </div>
              ))}
            </div>
          </Reveal>
          <LimitNote>{withLink(k('robustLimit'), '/features/cardio', k('linkCardio'), 'robust')}</LimitNote>
        </div>
      </section>

      {/* S6 · Carrera o reto: cuál te conviene */}
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('vsEyebrow')} title={k('vsTitle')} lead={k('vsLead')} />
          <SpecTable columns={[k('vsColAspect'), k('vsColRace'), k('vsColChallenge')]} rows={vsRows} />
          <Reveal className="mt-8">
            <p className="max-w-2xl text-sm leading-relaxed text-white/60">
              {withLink(k('vsOutro'), '/features/challenges', k('vsLinkText'), 'vs_challenges')}
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
