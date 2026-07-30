/**
 * Visuales de `/features/nutrition`.
 *
 * Mocks HTML/CSS, no capturas. Es una decisión, no una comodidad: las pantallas
 * reales de nutrición enseñan comida, precios, tiendas y —en el recibo— la
 * dirección del súper, así que capturarlas obligaría a fabricar una cuenta
 * limpia y aun así arriesgaría publicar datos de alguien. Un mock no tiene ese
 * problema, es nítido a cualquier ancho y no envejece con el estilo de la app.
 *
 * Reproducen la pantalla real con el vocabulario del producto —`nutrition.*`,
 * `pantry.*`, `shopping.*`— y no con textos inventados. Las cifras son
 * ilustrativas y se ven ilustrativas: ni una sale de un usuario real.
 *
 * `PantryPanel` se deja en paz a propósito: la landing lo sigue usando
 * (`apps/web/src/pages/LandingPage.tsx:144`) y repetirlo aquí no le aportaría
 * nada a quien llega desde la home.
 */
import { useTranslation } from 'react-i18next'

/** Macros del día del mock: consumido / meta, en gramos. */
const MACROS = [
  { key: 'protein', now: 128, goal: 165 },
  { key: 'carbs', now: 190, goal: 260 },
  { key: 'fat', now: 52, goal: 70 },
] as const

/** Anillo de calorías: radio y perímetro para el `stroke-dasharray`. */
const RING_R = 52
const RING_C = 2 * Math.PI * RING_R
/** 1.840 de 2.450 kcal ≈ 75 %. */
const RING_PCT = 0.75

/** Nota de calidad de la comida del mock. Letra literal: es una escala A–E. */
const GRADE = 'B'

/**
 * Hero: el día de un vistazo. Anillo de calorías, barras de macros y una comida
 * ya registrada con su hora, su nota y su costo.
 */
export function DayRingPanel() {
  const { t } = useTranslation()
  return (
    <div
      role="img"
      aria-label={t('feature.nutrition.heroAlt')}
      className="w-full max-w-sm border border-white/10 bg-[hsl(75_6%_6%)] shadow-2xl shadow-black/40"
    >
      {/* Apilado en móvil: en una fila de 300 px el anillo se come el ancho y
          las barras de macros quedan en un punto. */}
      <div className="flex flex-col items-center gap-5 border-b border-white/10 px-5 py-6 sm:flex-row sm:gap-6">
        <svg viewBox="0 0 128 128" className="h-28 w-28 shrink-0" aria-hidden="true">
          <circle cx="64" cy="64" r={RING_R} fill="none" stroke="hsl(0 0% 100% / .08)" strokeWidth="10" />
          <circle
            cx="64"
            cy="64"
            r={RING_R}
            fill="none"
            stroke="hsl(74 90% 57%)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${RING_C * RING_PCT} ${RING_C}`}
            transform="rotate(-90 64 64)"
          />
        </svg>
        {/* `w-full`: apilado, el `items-center` del padre dejaría esta columna a
            su ancho mínimo y las barras de macros no llegarían a verse. */}
        <div className="w-full min-w-0 sm:flex-1">
          {/* Las cifras del mock viajan por i18n: `1.840` en inglés se lee 1,84. */}
          <p className="font-bebas text-4xl leading-none tracking-wide">{t('feature.nutrition.mockKcal')}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[.16em] text-white/40">
            {t('nutrition.calories')} · {t('nutrition.goal')} {t('feature.nutrition.mockKcalGoal')}
          </p>
          <div className="mt-4 grid gap-2">
            {MACROS.map(macro => (
              <div key={macro.key} className="flex items-center gap-2.5">
                <span className="w-14 shrink-0 text-[10px] uppercase tracking-wide text-white/45">
                  {t(`nutrition.${macro.key}`)}
                </span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
                  <span
                    className="block h-full rounded-full bg-lime"
                    style={{ width: `${Math.round((macro.now / macro.goal) * 100)}%` }}
                  />
                </span>
                <span className="w-12 shrink-0 text-right font-mono text-[10px] text-white/50">{macro.now} g</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 py-4">
        <p className="text-[10px] uppercase tracking-[.16em] text-white/40">{t('nutrition.mealsToday')}</p>
        <div className="mt-3 flex items-start gap-3 border border-white/10 bg-[hsl(75_8%_4%)] p-3.5">
          <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center bg-lime/12 text-lg">🍗</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white/90">{t('feature.nutrition.mockMeal')}</p>
            <p className="mt-1 font-mono text-[11px] text-white/45">
              13:20 · {t('meal.almuerzo')} · 620 kcal
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span className="grid h-6 w-6 place-items-center bg-lime font-bebas text-sm leading-none text-[hsl(75_8%_5%)]">
              {GRADE}
            </span>
            <span className="font-mono text-[10px] text-white/45">{t('feature.nutrition.mockMealCost')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Alimentos detectados del mock: nombre, porción y kcal. */
const DETECTED = [
  { key: 'mockFood1', grams: 185, kcal: 305 },
  { key: 'mockFood2', grams: 145, kcal: 168 },
  { key: 'mockFood3', grams: 62, kcal: 99 },
] as const

/** S3: la pantalla de revisión, donde todo es todavía editable. */
export function ReviewPanel() {
  const { t } = useTranslation()
  return (
    <div
      role="img"
      aria-label={t('feature.nutrition.shot1Alt')}
      className="w-full max-w-sm border border-white/10 bg-[hsl(75_6%_6%)] shadow-2xl shadow-black/40"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <p className="font-bebas text-xl tracking-wide">{t('nutrition.edit.title')}</p>
        <span className="border border-lime/40 bg-lime/10 px-2 py-0.5 text-[10px] font-semibold tracking-[.14em] text-lime">
          {t('nutrition.aiBadge')}
        </span>
      </div>

      <ul className="divide-y divide-white/8">
        {DETECTED.map(food => (
          <li key={food.key} className="flex items-center gap-3 px-5 py-3.5">
            <span className="min-w-0 flex-1 truncate text-sm text-white/85">{t(`feature.nutrition.${food.key}`)}</span>
            <span className="border border-white/12 px-2 py-1 font-mono text-[11px] text-white/70">{food.grams} g</span>
            <span className="w-14 text-right font-mono text-[11px] text-white/45">{food.kcal} kcal</span>
          </li>
        ))}
      </ul>

      <div className="border-t border-white/10 px-5 py-4">
        <p className="font-mono text-[11px] leading-relaxed text-white/40">{t('feature.nutrition.mockPortionNote')}</p>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[.16em] text-white/40">{t('nutrition.dailyScore')}</span>
          <span className="grid h-7 w-7 place-items-center bg-lime font-bebas text-base leading-none text-[hsl(75_8%_5%)]">
            {GRADE}
          </span>
        </div>
        <div className="mt-4 bg-lime py-2.5 text-center font-bebas text-base tracking-[.12em] text-[hsl(75_8%_5%)]">
          {t('nutrition.edit.saveChanges')}
        </div>
      </div>
    </div>
  )
}

/**
 * Líneas de la lista del mock. `reason` son las tres etiquetas reales
 * (`packages/core/lib/shopping.ts:224,232,237`); `price` a `null` es una línea
 * sin histórico de compra, que sale «sin precio».
 */
const LIST = [
  { key: 'mockItem1', qty: 'mockQty1', reason: 'shopping.reason.se_acabo', price: 'mockPrice1' },
  { key: 'mockItem2', qty: 'mockQty2', reason: 'shopping.reason.plan', price: 'mockPrice2' },
  { key: 'mockItem3', qty: 'mockQty3', reason: 'shopping.reason.vence', price: 'mockPrice3' },
  { key: 'mockItem4', qty: 'mockQty4', reason: 'shopping.reason.plan', price: null },
] as const

/** S2: la lista de compra con los tres motivos y los precios estimados. */
export function ShoppingListPanel() {
  const { t } = useTranslation()
  return (
    <div
      role="img"
      aria-label={t('feature.nutrition.shot2Alt')}
      className="w-full border border-white/10 bg-[hsl(75_6%_6%)] shadow-2xl shadow-black/40"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 px-5 py-4">
        <p className="font-bebas text-xl tracking-wide">{t('shopping.title')}</p>
        <p className="font-mono text-[11px] text-white/45">
          {t('shopping.nextPurchase')} · {t('shopping.inDays', { count: 3 })}
        </p>
      </div>

      <ul className="divide-y divide-white/8">
        {LIST.map(line => (
          <li key={line.key} className="flex items-center gap-3 px-5 py-3.5">
            <span aria-hidden="true" className="h-4 w-4 shrink-0 border border-white/25" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-white/85">{t(`feature.nutrition.${line.key}`)}</span>
              <span className="mt-0.5 block font-mono text-[10px] text-white/40">{t(`feature.nutrition.${line.qty}`)}</span>
            </span>
            <span className="shrink-0 border border-white/12 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[.12em] text-white/55">
              {t(line.reason)}
            </span>
            <span className={`w-20 shrink-0 text-right font-mono text-[11px] ${line.price ? 'text-white/70' : 'text-white/35'}`}>
              {line.price ? t(`feature.nutrition.${line.price}`) : t('shopping.noPrice')}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-4">
        <p className="font-mono text-[11px] text-white/50">
          {t('shopping.totalEst')} {t('feature.nutrition.mockTotal')}
        </p>
        <span className="bg-lime px-4 py-2 font-bebas text-sm tracking-[.12em] text-[hsl(75_8%_5%)]">
          {t('shopping.done')}
        </span>
      </div>
    </div>
  )
}

/** S6: el bloque de gasto del día, con el `≥` de la cobertura parcial. */
export function SpendPanel() {
  const { t } = useTranslation()
  const cells: Array<[string, string]> = [
    [t('nutrition.spend.today'), t('feature.nutrition.mockSpendToday')],
    [t('nutrition.spend.week'), t('feature.nutrition.mockSpendWeek')],
    [t('nutrition.spend.perMeal'), t('feature.nutrition.mockMealCost')],
  ]
  return (
    <div
      role="img"
      aria-label={t('feature.nutrition.shot3Alt')}
      className="w-full max-w-sm border border-white/10 bg-[hsl(75_6%_6%)] shadow-2xl shadow-black/40"
    >
      <p className="border-b border-white/10 px-5 py-3.5 text-[10px] font-semibold uppercase tracking-[.18em] text-lime">
        {t('nutrition.spend.kicker')}
      </p>
      <div className="grid grid-cols-3 divide-x divide-white/10">
        {cells.map(([label, value]) => (
          <div key={label} className="px-3 py-5 text-center">
            <p className="font-bebas text-2xl leading-none tracking-wide">{value}</p>
            <p className="mt-2 text-[9px] uppercase tracking-[.14em] text-white/40">{label}</p>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 px-5 py-4">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center bg-lime/12 text-base">🥣</span>
          <span className="min-w-0 flex-1 truncate text-sm text-white/85">{t('feature.nutrition.mockItem4')}</span>
          {/* `≥`: la despensa solo cubrió parte de la comida (`packages/core/lib/spend.ts:43-101`). */}
          <span className="shrink-0 font-mono text-[11px] text-white/50">{t('feature.nutrition.mockSpendPartial')}</span>
        </div>
      </div>
    </div>
  )
}
