/**
 * `/features/offline` — sub-issue #288 de la épica #279.
 *
 * Es la página más falsable de las nueve: cualquiera comprueba su promesa
 * poniendo el móvil en modo avión. Por eso su sección central (S2) es una tabla
 * de diez filas en vez de una frase, y por eso cada fila está anclada a código:
 *
 * - la app abre sin red → `apps/web/vite.config.js:33-58` (`injectManifest`,
 *   `registerType: 'prompt'`, `display: 'standalone'`, tope de 6 MB por fichero)
 *   y `apps/web/src/sw.ts:10`
 * - los datos de la última vez → `sw.ts:29-36`, `NetworkFirst` con
 *   `networkTimeoutSeconds: 5` y `maxAgeSeconds: 86400`. Alcanza a PocketBase
 *   porque en producción la web se sirve desde el propio PB y las llamadas son
 *   del mismo origen (`apps/web/src/lib/init-core.ts:31`)
 * - la sesión en curso 24 h → `ActiveSessionContext.tsx:92-93`
 * - entre dispositivos → `packages/core/lib/activeSessionSync.ts:23-25`
 *   (`active_sessions`, `THROTTLE_MS = 15_000`, caducidad de 24 h)
 * - cardio y circuitos en cola, máximo cinco → `CardioSessionContext.tsx:102-117,688-696`
 *   (reintenta al montar, al volver la red y al recuperar visibilidad) ·
 *   `CircuitSessionContext.tsx:51-52,108,441-472` (al montar y al volver la red)
 * - el agua → `packages/core/lib/offlineQueue.ts:113` + `useWater.ts:9,143,213`
 * - nutrición necesita red → `useNutrition.ts:430-438`, que relanza el error
 * - recordatorios del service worker → `sw.ts:89-195`; en Android los agenda el
 *   sistema (`apps/mobile/src/lib/reminder-scheduler.ts:191`)
 *
 * **La fila 7 es la razón de ser de esta página.** `logSet` y `markWorkoutDone`
 * escriben en el servidor dentro de un `try` y se tragan el error con un
 * `console.warn` (`packages/core/hooks/useProgress.ts:336,399`), sin pasar por
 * la cola de reintentos —cuyo único consumidor sigue siendo el agua—, y en la
 * siguiente carga `loadFromPB` reconstruye el progreso desde el servidor y
 * sobrescribe la caché local (`:221`). O sea: lo que no se subió, no se sube
 * después ni se queda. El copy publicado dice exactamente eso.
 *
 * La verificación corrigió dos cosas del propio dossier:
 * 1. **El catálogo va empaquetado en las dos plataformas**, no solo en Android:
 *    la web importa `packages/core/data/exercise-catalog.json` en cinco sitios
 *    (`ExerciseDetailPage`, `LogWorkoutPage`, `FreeSessionPage`, `SessionPreview`,
 *    `ExerciseLibraryPage`) y por eso el tope de workbox está en 6 MB. La
 *    diferencia real está en la **pantalla de biblioteca**: la web pide su lista
 *    a `exercises_catalog` y sin PB cae a los ejercicios del programa
 *    (`ExerciseLibraryPage.tsx:389-410`), mientras que en Android la biblioteca
 *    lee el catálogo empaquetado (`apps/mobile/src/app/(tabs)/library.tsx:36`).
 *    Los 1.578 están contados sobre el JSON, no copiados del dossier.
 * 2. La tabla de paridad no es un muro de ✓: además de la biblioteca, los
 *    recordatorios con todo cerrado son de Android (el sistema los agenda),
 *    mientras que en la web dependen de que el navegador siga vivo.
 *
 * iOS va sin marcar en las nueve filas, igual que en las otras ocho páginas de
 * la épica: hay código RN pero ningún canal de distribución en el repo. Esta
 * página es la declaración de referencia sobre iOS de toda la épica, así que
 * `platNote` explica la columna vacía en vez de dejarla insinuando que en
 * iPhone no se puede.
 *
 * Y estas cosas la página NO las dice, porque el código no las sostiene:
 * - que tus series se guarden en el teléfono sin señal
 * - que «todo lo que hiciste» suba solo al volver la conexión
 * - que nutrición, la despensa o lo social funcionen sin red
 * - que exista app de iOS
 * - que el aviso de sin conexión se vea en cualquier parte: vive dentro del
 *   shell autenticado (`apps/web/src/App.tsx:643`), así que esta misma página
 *   es una de las que no lo muestra
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { op } from '@calistenia/core/lib/analytics'
import { AndroidButton, Eyebrow, Reveal, WebButton } from '../../components/landing/shared'
import { FeatureShell } from '../../components/landing/featureShell'
import {
  BackToFeatures, FaqBlock, FaqJsonLd, LimitNote, PlatformTable, SectionHeader, SpecTable, StepFlow,
} from '../../components/landing/featureSections'
import { TwoScreensPanel } from './OfflineVisuals'

export default function OfflinePage() {
  const { t } = useTranslation()
  const k = (suffix: string) => t(`feature.offline.${suffix}`)

  /** Reemplaza el marcador `{{link}}` de una cadena por un enlace interno real. */
  const withLink = (text: string, to: string, label: string, zone: string): ReactNode => {
    const [before, after] = text.split('{{link}}')
    return (
      <>
        {before}
        <Link
          to={to}
          onClick={() => op.track('cta_clicked', { location: `feature_offline_${zone}`, intent: 'feature_detail' })}
          className="font-semibold text-lime underline underline-offset-4 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
        >
          {label}
        </Link>
        {after ?? ''}
      </>
    )
  }

  /**
   * S2 · las diez filas, en el orden en que alguien se las pregunta: primero lo
   * que funciona, después lo que no. La fila 7 va justo después de las que se
   * suben solas para que se lea por contraste y no como letra pequeña.
   *
   * Tres filas llevan enlace en la primera columna, hacia la función que
   * explica ese registro con detalle.
   */
  const whatRows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => {
    const thing = k(`what${n}Thing`)
    const linked =
      n === 4 ? withLink(thing, '/features/cardio', k('linkCardio'), 'what_cardio')
      : n === 5 ? withLink(thing, '/features/circuits', k('linkCircuits'), 'what_circuits')
      : n === 10 ? withLink(thing, '/features/training', k('linkCatalog'), 'what_catalog')
      : thing
    return [linked, k(`what${n}Offline`), k(`what${n}Back`)]
  })

  const syncSteps = [1, 2, 3].map(n => ({ title: k(`sync${n}Title`), desc: k(`sync${n}Desc`) }))

  /**
   * Paridad verificada capacidad a capacidad. Las dos filas sin web son reales:
   * la biblioteca completa sin conexión (Android lee el catálogo empaquetado;
   * la web pide su lista al servidor) y los recordatorios con todo cerrado (en
   * Android los agenda el sistema; en la web los mantiene el service worker,
   * que necesita que el navegador siga vivo).
   */
  const platformRows = [
    { label: k('plat1'), web: true, android: true, ios: false },    // abrir sin conexión
    { label: k('plat2'), web: true, android: true, ios: false },    // instalar en la pantalla de inicio
    { label: k('plat3'), web: true, android: true, ios: false },    // sesión en curso aunque cierres
    { label: k('plat4'), web: true, android: true, ios: false },    // retomarla en el otro dispositivo
    { label: k('plat5'), web: true, android: true, ios: false },    // cardio o circuito terminados en cola
    { label: k('plat6'), web: true, android: true, ios: false },    // agua sin conexión
    { label: k('plat7'), web: false, android: true, ios: false },   // biblioteca completa sin conexión
    { label: k('plat8'), web: false, android: true, ios: false },   // recordatorios con todo cerrado
    { label: k('plat9'), web: true, android: true, ios: false },    // aviso de sin conexión
  ]

  const faqItems = [1, 2, 3, 4, 5, 6].map(n => ({ q: k(`faq${n}q`), a: k(`faq${n}a`) }))

  return (
    <FeatureShell slug="offline" metaTitle={k('metaTitle')} metaDesc={k('metaDesc')}>
      <FaqJsonLd items={faqItems} />

      {/* S1 · Hero — sin señal en el sótano */}
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
              <AndroidButton location="feature_offline_hero" />
              <WebButton location="feature_offline_hero" />
            </div>
            <p className="landing-rise mt-5 text-[13px] text-white/45" style={{ animationDelay: '300ms' }}>{t('landing.trust')}</p>
          </div>
          <div className="landing-rise flex min-w-0 flex-col items-center gap-4 lg:items-end" style={{ animationDelay: '260ms' }}>
            <TwoScreensPanel />
            <p className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-[hsl(75_6%_8%)] px-4 py-2 text-xs font-semibold text-white/70">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-lime" />
              {k('heroBadge')}
            </p>
          </div>
        </div>
      </section>

      {/* S2 · Qué pasa exactamente sin señal — la sección que no es la plantilla */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('whatEyebrow')} title={k('whatHeading')} lead={k('whatLead')} />
          <SpecTable columns={[k('whatColThing'), k('whatColOffline'), k('whatColBack')]} rows={whatRows} />
          <LimitNote>{k('whatLimit')}</LimitNote>
        </div>
      </section>

      {/* S3 · La misma sesión en dos pantallas */}
      <section className="border-y border-white/10 bg-white/[.025]">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('syncEyebrow')} title={k('syncTitle')} lead={k('syncLead')} />
          {/* `StepFlow` recibe cadenas, así que el enlace al entrenamiento del
              día vive en el párrafo de cierre, no dentro de un paso. */}
          <StepFlow items={syncSteps} />
          <Reveal className="mt-8">
            <p className="max-w-2xl text-sm leading-relaxed text-white/60">
              {withLink(k('syncNote'), '/features/training', k('linkWorkout'), 'sync_workout')}
            </p>
          </Reveal>
        </div>
      </section>

      {/* S4 · Cómo instalarla */}
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('instEyebrow')} title={k('instTitle')} lead={k('instLead')} />
          {/* `Reveal` envuelve la rejilla entera, nunca una tarjeta suelta. */}
          <Reveal className="mt-12">
            <div className="grid gap-px bg-white/10 lg:grid-cols-2">
              <div className="flex flex-col bg-[hsl(75_8%_3%)] p-7">
                <h3 className="font-bebas text-3xl leading-tight tracking-wide">{k('inst1Title')}</h3>
                <p className="mt-4 flex-1 text-sm leading-relaxed text-white/65">
                  {withLink(k('inst1Desc'), '/features/training', k('linkCatalog'), 'install_catalog')}
                </p>
                <div className="mt-6"><AndroidButton location="feature_offline_install" /></div>
              </div>
              <div className="flex flex-col bg-[hsl(75_8%_3%)] p-7">
                <h3 className="font-bebas text-3xl leading-tight tracking-wide">{k('inst2Title')}</h3>
                <p className="mt-4 flex-1 text-sm leading-relaxed text-white/65">{k('inst2Desc')}</p>
                <div className="mt-6"><WebButton location="feature_offline_install" /></div>
              </div>
            </div>
          </Reveal>
          <LimitNote>{k('instLimit')}</LimitNote>
        </div>
      </section>

      {/* S5 · Web, Android e iOS */}
      <section className="border-b border-white/10 bg-white/[.025]">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 lg:py-28">
          <SectionHeader eyebrow={k('platEyebrow')} title={k('platTitle')} lead={k('platLead')} />
          <PlatformTable rows={platformRows} />
          <LimitNote>{k('platNote')}</LimitNote>
        </div>
      </section>

      {/* S6 · Preguntas frecuentes */}
      <section>
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 md:px-10 lg:grid-cols-[.72fr_1fr] lg:py-28">
          <SectionHeader eyebrow={t('feature.faqEyebrow')} title={t('feature.faqTitle')} />
          <FaqBlock items={faqItems} />
        </div>
      </section>
    </FeatureShell>
  )
}
