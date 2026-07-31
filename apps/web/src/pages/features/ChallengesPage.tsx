/**
 * `/features/challenges` — sub-issue #286 de la épica #279.
 *
 * Esta página es la única de las nueve que empezó con una decisión de producto
 * antes que con una estructura: el copy publicado vendía los retos como función
 * social ("invita a quien quieras", "aviso cuando alguien avanza", "desde
 * Android puedes competir sin limitaciones") y **nada de eso existe**. La regla
 * de `challenge_participants` solo permite crearse la participación de uno
 * mismo (`pb_migrations/1774000072_fix_data_quality.js:17-20`), así que hoy un
 * reto es de facto de un solo participante. Se eligió reencuadrar la página —un
 * objetivo con fecha límite que se llena solo— y contar la parte social como lo
 * que es: lo siguiente que llega (S5).
 *
 * Cada dato publicado aquí está anclado a código real, verificado antes de
 * escribir una línea de copy:
 *
 * - las 8 métricas → `packages/core/types/index.ts:535` ·
 *   `apps/web/src/pages/CreateChallengePage.tsx:16-24`
 * - 1.578 ejercicios en el catálogo, 119 de ellos cronometrados →
 *   `packages/core/data/exercise-catalog.json` (`total_count`)
 * - la unidad la decide `isTimer` → `packages/core/lib/challenges.ts:61-67`
 * - "8-12" → 12 y "3x10" → 10, "max" no puntúa → `packages/core/lib/pr-utils.ts:7-13`
 * - la ventana va de medianoche local a final del último día →
 *   `useChallengeDetail.ts:58-59` + `packages/core/lib/dateUtils.ts:142-145`
 * - qué mira cada métrica → `useChallengeDetail.ts:165-229`
 * - plazos 7/14/30/a medida y límites 60/300/40 → `CreateChallengePage.tsx:29,168,182,222`
 * - aviso solo al unirse, y solo al creador → `pb_hooks/notification_service.pb.js:262-309`
 *
 * Y estas cosas la página NO las dice, porque el código no las sostiene:
 * - que se pueda invitar a nadie (la creación de participaciones ajenas falla y
 *   el error se traga en silencio — `useChallenges.ts:163-171`)
 * - que el enlace de compartir invite (lleva a `/challenges/:id`, detrás del
 *   gate de sesión — `App.tsx:699-702`, al revés que `/race/:id`)
 * - que exista barra de progreso, métrica de distancia o descubrimiento de retos
 * - que avisen cuando alguien avanza (solo hay aviso al unirse)
 * - que desde Android se vea el ranking (no hay pantalla de detalle nativa)
 * - que la métrica personalizada puntúe (`useChallengeDetail.ts:226-227` → 0)
 *
 * La tabla de S4 es la recíproca exacta de la S6 de `/features/races`: las dos
 * usan las mismas cinco filas con el mismo texto, columnas al revés. Si alguien
 * toca una, tiene que tocar la otra.
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
import { ChallengeCardPanel } from './ChallengesVisuals'

export default function ChallengesPage() {
  const { t } = useTranslation()
  const k = (suffix: string) => t(`feature.challenges.${suffix}`)

  /** Reemplaza el marcador `{{link}}` de una cadena por un enlace interno real. */
  const withLink = (text: string, to: string, label: string, zone: string): ReactNode => {
    const [before, after] = text.split('{{link}}')
    return (
      <>
        {before}
        <Link
          to={to}
          onClick={() => op.track('cta_clicked', { location: `feature_challenges_${zone}`, intent: 'feature_detail' })}
          className="font-semibold text-lime underline underline-offset-4 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
        >
          {label}
        </Link>
        {after ?? ''}
      </>
    )
  }

  /**
   * Las seis filas de S2. Son seis y no ocho porque dominadas/flexiones y
   * L-sit/parada de manos comparten exactamente la misma regla de puntuación:
   * separarlas sería repetir la misma frase cuatro veces.
   */
  const metricRows = [1, 2, 3, 4, 5, 6].map(n => [k(`met${n}What`), k(`met${n}Unit`), k(`met${n}Counts`)])

  const scoreCards = [1, 2, 3].map(n => ({ title: k(`score${n}Title`), desc: k(`score${n}Desc`) }))

  /** Recíproca fila a fila de la S6 de `/features/races`. Mismo texto, columnas al revés. */
  const vsRows = [1, 2, 3, 4, 5].map(n => [k(`vs${n}Aspect`), k(`vs${n}Challenge`), k(`vs${n}Race`)])

  /**
   * Paridad de plataforma, verificada fichero a fichero. La pantalla nativa
   * (`apps/mobile/src/app/challenges.tsx`) es **solo la lista**: no hay detalle,
   * ni ranking, ni creación — lo confirma el comentario de
   * `apps/mobile/src/lib/notification-route.ts:16-18`.
   *
   * iOS va sin marcar en todas las filas a propósito: el código RN es el mismo,
   * pero no hay canal de distribución iOS en el repo y `platNote` lo dice.
   */
  const platformRows = [
    { label: k('plat1'), web: true, android: true, ios: false },   // lista activos/finalizados
    { label: k('plat2'), web: true, android: false, ios: false },  // CreateChallengePage, solo web
    { label: k('plat3'), web: true, android: false, ios: false },  // ChallengeDetailPage, solo web
    { label: k('plat4'), web: true, android: false, ios: false },  // ExerciseDetailPage:487 → ?exercise=
    { label: k('plat5'), web: true, android: true, ios: false },   // el score lee sessions/sets_log del servidor
    { label: k('plat6'), web: true, android: true, ios: false },   // notificación challenge_join
    { label: k('plat7'), web: true, android: true, ios: false },   // NotificationSettingsPage / notification-settings
    { label: k('plat8'), web: true, android: true, ios: false },   // auto-cierre en useChallenges:120-142
  ]

  // El JSON-LD quiere texto plano: los marcadores se sustituyen por su ancla.
  const faqPlain = [1, 2, 3, 4, 5, 6].map(n => ({
    q: k(`faq${n}q`),
    a: k(`faq${n}a`).replace('{{link}}', n === 2 ? k('linkRaces') : k('linkCatalog')),
  }))

  const faqItems = [1, 2, 3, 4, 5, 6].map(n => ({
    q: k(`faq${n}q`),
    a: n === 2 ? withLink(k('faq2a'), '/features/races', k('linkRaces'), 'faq')
      : n === 3 ? withLink(k('faq3a'), '/features/training', k('linkCatalog'), 'faq')
      : k(`faq${n}a`),
  }))

  return (
    <FeatureShell slug="challenges" metaTitle={k('metaTitle')} metaDesc={k('metaDesc')}>
      <FaqJsonLd items={faqPlain} />

      {/* S1 · Hero — un objetivo con fecha */}
      <section className="relative isolate overflow-hidden bg-[radial-gradient(ellipse_at_75%_20%,hsl(74_90%_57%_/_0.14),transparent_40%),hsl(75_8%_3%)] px-6 pb-20 pt-28 md:px-10 lg:pt-32">
        <div aria-hidden="true" className="absolute inset-0 opacity-40 [background-image:linear-gradient(hsl(0_0%_100%_/_0.045)_1px,transparent_1px),linear-gradient(90deg,hsl(0_0%_100%_/_0.045)_1px,transparent_1px)] [background-size:52px_52px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />
        {/* `min-w-0` en las dos columnas: sin él el panel ensancha su pista de la
            rejilla a 360 px y le come el ancho al `h1`. */}
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 lg:grid-cols-[1.05fr_.85fr]">
          <div className="min-w-0 max-w-2xl">
            <BackToFeatures />
            <div className="landing-rise mt-8" style={{ animationDelay: '60ms' }}><Eyebrow>{k('eyebrow')}</Eyebrow></div>
            <h1 className="landing-rise mt-5 font-bebas text-[clamp(3.2rem,8vw,6.5rem)] leading-[.86] tracking-tight" style={{ animationDelay: '100ms' }}>
              {k('h1')}
            </h1>
            <p className="landing-rise mt-7 max-w-lg text-lg leading-relaxed text-white/68" style={{ animationDelay: '180ms' }}>{k('heroLead')}</p>
            <div className="landing-rise mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center" style={{ animationDelay: '240ms' }}>
              <AndroidButton location="feature_challenges_hero" />
              <WebButton location="feature_challenges_hero" />
            </div>
            <p className="landing-rise mt-5 text-[13px] text-white/45" style={{ animationDelay: '300ms' }}>{t('landing.trust')}</p>
          </div>
          <div className="landing-rise flex min-w-0 flex-col items-center gap-4 lg:items-end" style={{ animationDelay: '260ms' }}>
            <ChallengeCardPanel />
            <p className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-[hsl(75_6%_8%)] px-4 py-2 text-center text-xs font-semibold text-white/70">
              <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-lime" />
              {k('heroBadge')}
            </p>
          </div>
        </div>
      </section>

      {/* S2 · Ocho formas de medirlo — la sección que no es la plantilla */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          {/* Sin `lead`: el de esta sección lleva un enlace en prosa, y
              `SectionHeader` solo acepta texto plano. */}
          <SectionHeader eyebrow={k('metEyebrow')} title={k('metTitle')} />
          <Reveal className="mt-6">
            <p className="max-w-2xl text-base leading-relaxed text-white/60">
              {withLink(k('metLead'), '/features/training', k('linkCatalog'), 'metrics')}
            </p>
          </Reveal>
          <SpecTable columns={[k('metColWhat'), k('metColUnit'), k('metColCounts')]} rows={metricRows} />
          <LimitNote>{withLink(k('metNote'), '/features/progress', k('linkProgress'), 'metrics_note')}</LimitNote>
        </div>
      </section>

      {/* S3 · Cómo se puntúa */}
      <section className="border-y border-white/10 bg-white/[.025]">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('scoreEyebrow')} title={k('scoreTitle')} lead={k('scoreLead')} />
          <CardGrid items={scoreCards} />
        </div>
      </section>

      {/* S4 · Reto o carrera — recíproca de la S6 de /features/races */}
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('vsEyebrow')} title={k('vsTitle')} lead={k('vsLead')} />
          <SpecTable columns={[k('vsColAspect'), k('vsColChallenge'), k('vsColRace')]} rows={vsRows} />
          <Reveal className="mt-8">
            <p className="max-w-2xl text-sm leading-relaxed text-white/60">
              {withLink(k('vsOutro'), '/features/races', k('vsLinkText'), 'vs_races')}
            </p>
          </Reveal>
        </div>
      </section>

      {/* S5 · Dónde está hoy — la segunda sección que no es la plantilla */}
      <section className="border-b border-white/10 bg-white/[.025]">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('todayEyebrow')} title={k('todayTitle')} lead={k('todayLead')} />
          <Reveal className="mt-12">
            <div className="grid gap-px bg-white/10 md:grid-cols-2">
              <div className="bg-[hsl(75_8%_3%)] p-6">
                <h3 className="font-bebas text-2xl leading-tight tracking-wide text-lime">{k('todayNowTitle')}</h3>
                <ul className="mt-4 grid gap-3">
                  {[1, 2, 3, 4].map(n => (
                    <li key={n} className="flex gap-3 text-sm leading-relaxed text-white/65">
                      <span aria-hidden="true" className="mt-[.45rem] size-1.5 shrink-0 rounded-full bg-lime" />
                      {k(`todayNow${n}`)}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-[hsl(75_8%_3%)] p-6">
                <h3 className="font-bebas text-2xl leading-tight tracking-wide text-white/70">{k('todayNextTitle')}</h3>
                <ul className="mt-4 grid gap-3">
                  {[1, 2].map(n => (
                    <li key={n} className="flex gap-3 text-sm leading-relaxed text-white/50">
                      <span aria-hidden="true" className="mt-[.45rem] size-1.5 shrink-0 rounded-full bg-white/25" />
                      {k(`todayNext${n}`)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>
          <LimitNote>{withLink(k('todayLimit'), '/features/races', k('linkRaces'), 'today')}</LimitNote>
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
