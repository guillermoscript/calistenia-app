/**
 * Visuales de `/features/challenges`.
 *
 * Mock HTML/CSS, no captura. Aquí la razón es de privacidad antes que de
 * nitidez: la clasificación de un reto real muestra nombre y avatar de cada
 * participante, y además hacen falta tres participaciones que la app **no**
 * deja crear (la regla de `challenge_participants` solo permite inscribirse a
 * uno mismo — `pb_migrations/1774000072_fix_data_quality.js:17-20`). Un ranking
 * maquetado con nombres inventados es más honesto y más barato.
 *
 * Reproduce `apps/web/src/pages/ChallengeDetailPage.tsx`: chip de métrica en
 * lima, chip de meta en ámbar, días restantes, medallas para los tres primeros
 * y la fila propia resaltada. Las medallas son las mismas de `MEDALS:14`.
 *
 * `BeyondVisual` se deja en paz: la landing sigue usando `index={3}` para retos
 * (`apps/web/src/pages/LandingPage.tsx:204`) y el registro lo conserva.
 */
import { useTranslation } from 'react-i18next'

/**
 * Participantes de ejemplo. Nombres propios cortos, iguales en los dos idiomas
 * y claramente inventados: ninguna persona real aparece en esta página. `you`
 * marca la fila propia, en lima como en el producto.
 *
 * Los valores son enteros sin separador de miles a propósito: `1.840` leído en
 * inglés es 1,84, y aquí el número tiene que decir lo mismo en ES y en EN.
 */
const STANDINGS = [
  { name: 'Ana', value: 312, you: false },
  { name: 'Leo', value: 287, you: true },
  { name: 'Mar', value: 244, you: false },
] as const

const MEDALS = ['🥇', '🥈', '🥉']

/**
 * Hero: la tarjeta de un reto con su meta y sus días, y debajo la clasificación.
 *
 * El vocabulario sale de las claves de la app (`challenges.*`, `challenge.*`),
 * no de textos inventados para la landing: si mañana cambia el nombre de una
 * métrica en el producto, cambia aquí con ella.
 */
export function ChallengeCardPanel() {
  const { t } = useTranslation()
  const k = (s: string) => t(`feature.challenges.${s}`)

  return (
    <div
      role="img"
      aria-label={k('heroAlt')}
      className="w-full max-w-sm border border-white/10 bg-[hsl(75_6%_6%)] shadow-2xl shadow-black/40"
    >
      <div className="border-b border-white/10 px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-white/35">{t('challenges.section')}</p>
        <p className="mt-1.5 font-bebas text-2xl leading-none tracking-wide">{k('mockTitle')}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="border border-lime/30 bg-lime/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-lime">
            {t('challenge.metric.exercise')}
          </span>
          <span className="border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-amber-400">
            {t('challenges.goal', { value: 300 })}
          </span>
          <span className="font-mono text-[10px] text-amber-400/80">{t('challenge.daysLeft', { count: 12 })}</span>
        </div>
      </div>

      <ol className="grid gap-1.5 p-3">
        {STANDINGS.map((row, i) => (
          <li
            key={row.name}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
              row.you ? 'border-lime/30 border-l-[3px] border-l-lime bg-lime/[.08]' : 'border-white/10 bg-white/[.02]'
            }`}
          >
            <span aria-hidden="true" className="w-6 shrink-0 text-center text-base">{MEDALS[i]}</span>
            <span
              aria-hidden="true"
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full font-bebas text-xs ${
                row.you ? 'bg-lime/20 text-lime' : 'bg-white/8 text-white/50'
              }`}
            >
              {row.name.charAt(0)}
            </span>
            <span className="flex-1 truncate">
              <span className={`text-sm ${row.you ? 'font-semibold text-lime' : 'text-white/80'}`}>{row.name}</span>
              {row.you ? <span className="ml-1.5 font-mono text-[9px] tracking-widest text-lime/70">{k('mockYou')}</span> : null}
            </span>
            <span className="shrink-0 text-right">
              <span className="font-bebas text-2xl leading-none tracking-wide tabular-nums">{row.value}</span>
              <span className="ml-1 font-mono text-[10px] text-white/40">{k('mockUnit')}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
