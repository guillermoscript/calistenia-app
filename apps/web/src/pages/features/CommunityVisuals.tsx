/**
 * Visuales de `/features/community`.
 *
 * Mocks HTML/CSS, no capturas — y aquí la razón no es estética. Una captura
 * del feed o de la clasificación lleva encima nombres, avatares y comentarios
 * de personas. Aunque la cuenta fuera de prueba, el riesgo de colar un dato
 * real en una página pública no compensa: los tres nombres de aquí (Ana, Leo,
 * Mar) son inventados y son los mismos que ya usa `RacesVisuals.tsx`.
 *
 * Los cinco emojis salen literales de `packages/core/hooks/useReactions.ts:6`
 * y las categorías de la tabla, de `apps/web/src/pages/LeaderboardPage.tsx:24-34`.
 * El vocabulario es el de la app (`leaderboard.*`, `social.*`), no textos
 * inventados: si alguien renombra una categoría en el producto, el mock la
 * renombra con ella.
 *
 * `BeyondVisual` se deja en paz: la landing sigue usando `index={4}` para
 * comunidad (`apps/web/src/pages/LandingPage.tsx:204`).
 */
import { useTranslation } from 'react-i18next'
import { PhoneFrame } from '../../components/landing/featureSections'

/**
 * Los cinco emojis, copiados literales de `REACTION_EMOJIS`
 * (`packages/core/hooks/useReactions.ts:6`). Se copian en vez de importarse a
 * propósito: ese módulo arrastra el cliente de PocketBase, y esta página vive
 * antes del gate de sesión (`apps/web/src/App.tsx:796`).
 *
 * `count` a cero deja el emoji apagado, como en `EmojiPicker`.
 */
const REACTIONS = [
  { emoji: '🔥', count: 3 },
  { emoji: '💪', count: 2 },
  { emoji: '👏', count: 1 },
  { emoji: '🎯', count: 0 },
  { emoji: '🏆', count: 0 },
] as const

/**
 * Hero y S3: una publicación del feed con su fila de reacciones.
 *
 * Los cinco emojis se pintan todos —no una selección— porque el copy de al
 * lado dice «cinco reacciones»: enseñar tres dejaría la ilustración
 * contradiciendo al texto.
 */
export function FeedCardPanel() {
  const { t } = useTranslation()
  const k = (s: string) => t(`feature.community.${s}`)

  return (
    <div
      role="img"
      aria-label={k('heroAlt')}
      className="w-full max-w-sm border border-white/10 bg-[hsl(75_6%_6%)] shadow-2xl shadow-black/40"
    >
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lime/15 font-bebas text-lg leading-none text-lime"
        >
          A
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white/90">{k('mockName')}</p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[.14em] text-white/35">{k('mockTime')}</p>
        </div>
      </div>

      <div className="px-5 py-5">
        <p className="font-bebas text-2xl leading-none tracking-wide">{k('mockSession')}</p>
        <p className="mt-2 text-xs leading-relaxed text-white/50">{k('mockDetail')}</p>
      </div>

      {/* Las cuentas a cero se pintan apagadas: es lo que hace `EmojiPicker`. */}
      <div className="flex flex-wrap gap-1.5 border-t border-white/10 px-5 py-3.5">
        {REACTIONS.map(({ emoji, count }) => (
          <span
            key={emoji}
            className={
              count > 0
                ? 'inline-flex items-center gap-1.5 rounded-full border border-lime/30 bg-lime/10 px-2.5 py-1 text-xs text-white/80'
                : 'inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-xs text-white/35'
            }
          >
            <span aria-hidden="true">{emoji}</span>
            {count > 0 ? <span className="font-mono text-[10px]">{count}</span> : null}
          </span>
        ))}
      </div>

      <div className="border-t border-white/10 px-5 py-3">
        <p className="font-mono text-[11px] text-white/40">{k('mockComments')}</p>
      </div>
    </div>
  )
}

/** Filas de la clasificación. `you` marca la fila propia, en lima como en el producto. */
const BOARD = [
  { name: 'Ana', value: 6, you: false },
  { name: 'Leo', value: 5, you: true },
  { name: 'Mar', value: 4, you: false },
] as const

/**
 * S4: la clasificación en el teléfono, con la categoría y el filtro de semana
 * que solo tiene esta categoría (`LeaderboardPage.tsx:24`, `hasTimeFilter`).
 */
export function LeaderboardMock() {
  const { t } = useTranslation()
  const k = (s: string) => t(`feature.community.${s}`)

  return (
    <PhoneFrame width={272}>
      <div role="img" aria-label={k('lbAlt')} className="px-5 pb-7 pt-5">
        <p className="font-bebas text-2xl leading-none tracking-wide">{t('leaderboard.title')}</p>

        <div className="mt-4 flex gap-1.5">
          <span className="rounded-full bg-lime px-3 py-1 text-[10px] font-semibold uppercase tracking-[.12em] text-black">
            {t('leaderboard.sessions')}
          </span>
          <span className="rounded-full border border-white/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[.12em] text-white/45">
            {t('leaderboard.thisWeek')}
          </span>
        </div>

        <ul className="mt-5 space-y-px">
          {BOARD.map((row, i) => (
            <li
              key={row.name}
              className={`flex items-center gap-3 px-3 py-3 ${row.you ? 'bg-lime/10' : 'bg-white/[.03]'}`}
            >
              <span className={`font-mono text-xs ${row.you ? 'text-lime' : 'text-white/35'}`}>{i + 1}</span>
              <span className={`min-w-0 flex-1 truncate text-sm ${row.you ? 'font-semibold text-lime' : 'text-white/80'}`}>
                {row.name}
                {row.you ? <span className="ml-1.5 font-mono text-[10px] text-lime/70">{t('leaderboard.you')}</span> : null}
              </span>
              <span className="font-bebas text-xl leading-none tracking-wide">{row.value}</span>
            </li>
          ))}
        </ul>

        <p className="mt-5 font-mono text-[10px] leading-relaxed text-white/30">{k('mockLbNote')}</p>
      </div>
    </PhoneFrame>
  )
}
