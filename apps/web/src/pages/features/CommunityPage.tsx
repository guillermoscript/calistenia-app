/**
 * `/features/community` — sub-issue #287 de la épica #279.
 *
 * Todo el texto sale de `feature.community.*`. Cada dato publicado aquí está
 * anclado a código real, verificado antes de escribir una línea de copy:
 *
 * - qué colecciones entran en el feed → `packages/core/hooks/useActivityFeed.ts:150,160`
 * - los cinco emojis → `packages/core/hooks/useReactions.ts:6`; varios distintos
 *   por publicación desde `pb_migrations/1774000044_update_feed_reactions_index.js:6`
 * - 500 caracteres por comentario → `pb_migrations/1774000046_created_comments.js:13`
 * - las diez categorías de la tabla → `apps/web/src/pages/LeaderboardPage.tsx:24-34`
 *   (el hook tiene once claves: `sessions_month` se alcanza con el filtro)
 * - sesiones de la semana = fuerza + circuitos + cardio → `useLeaderboard.ts:123`
 * - la tabla solo entre quien sigues → `useLeaderboard.ts:54-59`
 * - qué hace bloquear → `pb_hooks/user_blocks.pb.js:20-26,29-34,37-43,46-61`
 * - denuncias: 2 objetivos, 4 motivos, índice único e instantánea del texto →
 *   `pb_migrations/1782000000_created_content_reports.js:20-32` · `useReports.ts:49,57-58`
 * - aviso de «un amigo entrenó» una vez al día →
 *   `pb_hooks/utils/notifications.js:201-232`
 *
 * La sección S2 es la razón de ser de la página, y la verificación cambió lo
 * que decía el borrador de la issue. Las reglas de lectura de hoy:
 * - `settings` (los cinco `pr_*`) y `sets_log` → cualquier cuenta autenticada,
 *   sin filtro de bloqueo (`1775100007`, `1777000005`)
 * - `sessions` y `user_stats` → cualquier cuenta autenticada **menos** las
 *   bloqueadas, porque `1778000002_block_read_rules.js:15-32` las apretó después
 * - fotos, medidas, peso, sueño y comidas → solo su dueño, sin excepciones
 * De ahí salen dos correcciones al borrador: las series **no** son privadas
 * (van con las marcas en la fila de «cualquiera con cuenta»), y el bloqueo se
 * puede vender como lo que es —una regla de servidor— en vez de con un «no
 * puede reaccionar ni comentar» que ningún fichero sostiene.
 *
 * Y estas cosas la página NO las dice, porque el código no las sostiene:
 * - que el feed muestre circuitos, retos o carreras (solo fuerza y cardio)
 * - que exista una clasificación global (no la hay, y es deliberado)
 * - que una denuncia tenga plazo o respuesta (`listRule: null`, revisión a mano)
 * - que haya perfiles públicos sin cuenta
 * - que usar tu propio enlace de invitación te dé puntos (`useReferrals.ts:166`
 *   bloquea la autoinvitación: los puntos llegan cuando se apunta otra persona)
 *
 * Los visuales son mocks HTML/CSS: una captura del feed lleva encima nombres,
 * avatares y comentarios de personas.
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
import { FeedCardPanel, LeaderboardMock } from './CommunityVisuals'

export default function CommunityPage() {
  const { t } = useTranslation()
  const k = (suffix: string) => t(`feature.community.${suffix}`)

  /** Reemplaza el marcador `{{link}}` de una cadena por un enlace interno real. */
  const withLink = (text: string, to: string, label: string, zone: string): ReactNode => {
    const [before, after] = text.split('{{link}}')
    return (
      <>
        {before}
        <Link
          to={to}
          onClick={() => op.track('cta_clicked', { location: `feature_community_${zone}`, intent: 'feature_detail' })}
          className="font-semibold text-lime underline underline-offset-4 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
        >
          {label}
        </Link>
        {after ?? ''}
      </>
    )
  }

  // S2 · la primera fila enlaza a progreso, que es donde viven las fotos y las
  // medidas. Recíproco del enlace que la #282 traerá desde el otro lado: las
  // dos tablas de privacidad tienen que decir lo mismo.
  const seeRows = [1, 2, 3, 4, 5, 6].map(n => [
    k(`see${n}What`),
    n === 1 ? withLink(k('see1Who'), '/features/progress', k('linkProgress'), 'see_table') : k(`see${n}Who`),
  ])

  const feedCards = [1, 2, 3].map(n => ({ title: k(`feed${n}Title`), desc: k(`feed${n}Desc`) }))

  const lbRows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => [k(`lb${n}Cat`), k(`lb${n}Means`)])

  const blockItems = [1, 2, 3, 4, 5].map(n => k(`block${n}`))
  const reportItems = [1, 2, 3].map(n => k(`report${n}`))
  const notifItems = [1, 2, 3, 4, 5].map(n => k(`notif${n}`))

  /**
   * Paridad verificada pantalla a pantalla, no leyendo qué ficheros existen.
   * Las dos filas sin Android son reales y por eso están: comparar tus datos
   * con los de otra persona (`UserProfilePage.tsx:203-219`) y el panel de
   * invitados y puntos (`ReferralsPage.tsx`), que en móvil no tiene pantalla —
   * `friends.tsx:232-239` solo comparte el enlace.
   *
   * iOS va sin marcar en todas las filas: hay código RN, pero ningún canal de
   * distribución iOS en el repo. `platNote` lo dice sin rodeos.
   */
  const platformRows = [
    { label: k('plat1'), web: true, android: true, ios: false },    // buscar y seguir
    { label: k('plat2'), web: true, android: true, ios: false },    // feed con reacciones y comentarios
    { label: k('plat3'), web: true, android: true, ios: false },    // responder y reaccionar a comentarios
    { label: k('plat4'), web: true, android: true, ios: false },    // clasificación, las diez categorías
    { label: k('plat5'), web: true, android: true, ios: false },    // ver perfil
    { label: k('plat6'), web: true, android: false, ios: false },   // comparar datos, solo web
    { label: k('plat7'), web: true, android: true, ios: false },    // bloquear + lista de bloqueados
    { label: k('plat8'), web: true, android: true, ios: false },    // denunciar
    { label: k('plat9'), web: true, android: true, ios: false },    // elegir avisos
    { label: k('plat10'), web: true, android: true, ios: false },   // invitar con tu enlace
    { label: k('plat11'), web: true, android: false, ios: false },  // invitados y puntos, solo web
  ]

  // El JSON-LD quiere texto plano; `faqItems` lleva el enlace real de faq1.
  const faqPlain = [1, 2, 3, 4, 5, 6].map(n => ({
    q: k(`faq${n}q`),
    a: k(`faq${n}a`).replace('{{link}}', k('linkProgress')),
  }))

  const faqItems = [1, 2, 3, 4, 5, 6].map(n => ({
    q: k(`faq${n}q`),
    a: n === 1 ? withLink(k('faq1a'), '/features/progress', k('linkProgress'), 'faq') : k(`faq${n}a`),
  }))

  return (
    <FeatureShell slug="community" metaTitle={k('metaTitle')} metaDesc={k('metaDesc')}>
      <FaqJsonLd items={faqPlain} />

      {/* S1 · Hero — nadie entrena mejor solo, pero puedes */}
      <section className="relative isolate overflow-hidden bg-[radial-gradient(ellipse_at_75%_20%,hsl(74_90%_57%_/_0.14),transparent_40%),hsl(75_8%_3%)] px-6 pb-20 pt-28 md:px-10 lg:pt-32">
        <div aria-hidden="true" className="absolute inset-0 opacity-40 [background-image:linear-gradient(hsl(0_0%_100%_/_0.045)_1px,transparent_1px),linear-gradient(90deg,hsl(0_0%_100%_/_0.045)_1px,transparent_1px)] [background-size:52px_52px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />
        {/* `min-w-0` en las dos columnas: sin él, el panel ensancha la pista de
            la rejilla y el `h1` se corta a 360 px. */}
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 lg:grid-cols-[1.05fr_.85fr]">
          <div className="min-w-0 max-w-2xl">
            <BackToFeatures />
            <div className="landing-rise mt-8" style={{ animationDelay: '60ms' }}><Eyebrow>{k('eyebrow')}</Eyebrow></div>
            <h1 className="landing-rise mt-5 font-bebas text-[clamp(3.2rem,8vw,6.5rem)] leading-[.86] tracking-tight" style={{ animationDelay: '100ms' }}>
              {k('h1')}
            </h1>
            <p className="landing-rise mt-7 max-w-lg text-lg leading-relaxed text-white/68" style={{ animationDelay: '180ms' }}>{k('heroLead')}</p>
            <div className="landing-rise mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center" style={{ animationDelay: '240ms' }}>
              <AndroidButton location="feature_community_hero" />
              <WebButton location="feature_community_hero" />
            </div>
            <p className="landing-rise mt-5 text-[13px] text-white/45" style={{ animationDelay: '300ms' }}>{t('landing.trust')}</p>
          </div>
          <div className="landing-rise flex min-w-0 flex-col items-center gap-4 lg:items-end" style={{ animationDelay: '260ms' }}>
            <FeedCardPanel />
            <p className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-[hsl(75_6%_8%)] px-4 py-2 text-xs font-semibold text-white/70">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-lime" />
              {k('heroBadge')}
            </p>
          </div>
        </div>
      </section>

      {/* S2 · Qué ven los demás — la sección que no es la plantilla */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('seeEyebrow')} title={k('seeTitle')} lead={k('seeLead')} />
          <SpecTable columns={[k('seeColWhat'), k('seeColWho')]} rows={seeRows} />
          <LimitNote>{k('seeLimit')}</LimitNote>
          <Reveal className="mt-8">
            <Link
              to="/legal"
              onClick={() => op.track('cta_clicked', { location: 'feature_community_see_legal', intent: 'feature_detail' })}
              className="text-sm font-semibold text-lime underline underline-offset-4 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
            >
              {k('seeLegalLink')}
            </Link>
          </Reveal>
        </div>
      </section>

      {/* S3 · El feed */}
      <section className="border-y border-white/10 bg-white/[.025]">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('feedEyebrow')} title={k('feedTitle')} lead={k('feedLead')} />
          <Reveal className="mt-12 flex justify-center"><FeedCardPanel /></Reveal>
          <CardGrid items={feedCards} />
          <LimitNote>{withLink(k('feedLimit'), '/features/races', k('linkRaces'), 'feed_limit')}</LimitNote>
        </div>
      </section>

      {/* S4 · La clasificación */}
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('lbEyebrow')} title={k('lbTitle')} lead={k('lbLead')} />
          <Reveal className="mt-12 flex justify-center"><LeaderboardMock /></Reveal>
          <SpecTable columns={[k('lbColCat'), k('lbColMeans')]} rows={lbRows} />
          <Reveal className="mt-8">
            <p className="max-w-2xl text-sm leading-relaxed text-white/60">
              {withLink(k('lbScope'), '/features/challenges', k('linkChallenges'), 'lb_scope')}
            </p>
          </Reveal>
        </div>
      </section>

      {/* S5 · Tu espacio, tus reglas — la segunda sección que no es la plantilla */}
      <section className="border-b border-white/10 bg-white/[.025]">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('modEyebrow')} title={k('modTitle')} lead={k('modLead')} />
          {/* `Reveal` envuelve la rejilla entera, nunca un `<li>` suelto. */}
          <Reveal className="mt-12">
            <div className="grid gap-px bg-white/10 lg:grid-cols-2">
              <div className="bg-[hsl(75_8%_3%)] p-7">
                <h3 className="font-bebas text-3xl leading-tight tracking-wide">{k('blockTitle')}</h3>
                <ul className="mt-5 space-y-3">
                  {blockItems.map(item => (
                    <li key={item} className="flex gap-3 text-sm leading-relaxed text-white/65">
                      <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-lime" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-[hsl(75_8%_3%)] p-7">
                <h3 className="font-bebas text-3xl leading-tight tracking-wide">{k('reportTitle')}</h3>
                <ul className="mt-5 space-y-3">
                  {reportItems.map(item => (
                    <li key={item} className="flex gap-3 text-sm leading-relaxed text-white/65">
                      <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-lime" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>
          <LimitNote>{k('modLimit')}</LimitNote>
        </div>
      </section>

      {/* S6 · Los avisos, a tu gusto */}
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('notifEyebrow')} title={k('notifTitle')} lead={k('notifLead')} />
          {/* Cinco avisos en una rejilla de dos o tres columnas dejan un hueco
              al final, y el `gap-px` lo pinta como una celda gris vacía. El
              último ocupa dos columnas y cierra la fila en los dos anchos. */}
          <Reveal className="mt-12">
            <ul className="grid gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
              {notifItems.map(item => (
                <li key={item} className="bg-[hsl(75_8%_3%)] p-6 text-sm leading-relaxed text-white/65 sm:last:col-span-2">{item}</li>
              ))}
            </ul>
          </Reveal>
          <Reveal className="mt-8">
            <p className="max-w-2xl text-sm leading-relaxed text-white/60">{k('notifControl')}</p>
          </Reveal>
          <LimitNote>{k('notifLimit')}</LimitNote>
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
