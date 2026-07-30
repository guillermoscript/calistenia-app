/**
 * Paneles ilustrativos (UI real del producto en miniatura).
 * Los comparten la landing y las páginas de funciones.
 */
import { useTranslation } from 'react-i18next'
import { Check, Flame, RefreshCw, Route, Search, ShoppingBasket, Sparkles, Timer, Trophy, WifiOff } from 'lucide-react'

/** Sesión de hoy dentro de un marco de teléfono — el producto, sobre el pliegue. */
export function HeroPhone() {
  const { t } = useTranslation()
  const rows: Array<[string, string, boolean]> = [
    [t('landing.mockExercise1'), '3 × 8', true],
    [t('landing.mockExercise2'), '3 × 8', false],
    [t('landing.mockExercise3'), '3 × 12', false],
  ]
  return (
    <div className="relative">
      <div className="landing-float relative w-[272px] rounded-[2.4rem] border border-white/15 bg-[hsl(75_6%_7%)] p-2.5 shadow-[0_40px_80px_-20px_rgba(0,0,0,.8)] sm:w-[300px]" style={{ animationDelay: '1.2s' }}>
        <div className="overflow-hidden rounded-[1.9rem] bg-[hsl(75_8%_4%)]">
          <div className="flex justify-center pt-2.5"><span className="h-1.5 w-16 rounded-full bg-white/10" /></div>
          <div className="px-5 pb-6 pt-5">
            <div className="flex items-end justify-between border-b border-white/10 pb-4">
              <div>
                <p className="text-[10px] uppercase tracking-[.18em] text-white/45">{t('landing.mockToday')}</p>
                <p className="mt-1 font-bebas text-2xl tracking-wide">{t('landing.mockSession')}</p>
              </div>
              <span className="font-mono text-xs text-lime">01 / 03</span>
            </div>
            {rows.map(([name, sets, done]) => (
              <div key={name} className="flex items-center gap-3 border-b border-white/5 py-3.5 last:border-0">
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${done ? 'border-lime bg-lime text-black' : 'border-white/25'}`}>
                  {done ? <Check className="h-3 w-3" /> : null}
                </span>
                <span className="flex-1 truncate text-sm text-white/85">{name}</span>
                <span className="font-mono text-xs text-white/45">{sets}</span>
              </div>
            ))}
            <div className="mt-2 rounded-lg bg-white/[.05] px-4 py-3">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-white/60"><Timer className="h-3.5 w-3.5 text-lime" />{t('landing.mockRest')}</span>
                <span className="font-mono text-lime">0:42</span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-[70%] rounded-full bg-lime" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="landing-float absolute -left-4 -top-4 flex items-center gap-2 rounded-full border border-white/12 bg-[hsl(75_6%_8%)] py-2 pl-2.5 pr-4 text-xs font-semibold shadow-xl shadow-black/50 sm:-left-8" style={{ animationDelay: '.4s' }}>
        <span className="grid h-6 w-6 place-items-center rounded-full bg-lime/15 text-lime"><Flame className="h-3.5 w-3.5" /></span>
        {t('landing.mockStreak')}
      </div>
      <div className="landing-float absolute -bottom-4 -right-4 flex items-center gap-2 rounded-full border border-white/12 bg-[hsl(75_6%_8%)] py-2 pl-2.5 pr-4 text-xs shadow-xl shadow-black/50 sm:-right-10" style={{ animationDelay: '.8s' }}>
        <span className="grid h-6 w-6 place-items-center rounded-full bg-lime/15 text-lime"><Trophy className="h-3.5 w-3.5" /></span>
        <span><span className="font-semibold">{t('landing.mockPR')}</span> <span className="text-white/55">{t('landing.mockPRDetail')}</span></span>
      </div>
    </div>
  )
}

/** Panel de librería: amplitud + variantes por nivel sin repetir la pantalla del hero. */
export function LibraryPanel() {
  const { t, i18n } = useTranslation()
  const exerciseCount = i18n.language.startsWith('es') ? '1.578' : '1,578'
  const rows: Array<[string, number]> = [
    [t('landing.mockExercise1'), 1],
    [t('landing.mockExercise2'), 2],
    [t('landing.mockExercise3'), 1],
  ]
  return (
    <div className="w-full max-w-sm border border-white/10 bg-[hsl(75_6%_6%)] p-5 shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div>
          <p className="font-bebas text-3xl tracking-wide text-lime">{exerciseCount}</p>
          <p className="text-xs text-white/45">{t('landing.statsExercises')}</p>
        </div>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-white/50"><Search className="h-4 w-4" /></span>
      </div>
      {rows.map(([name, level]) => (
        <div key={name} className="flex items-center justify-between border-b border-white/5 py-3.5 last:border-0">
          <span className="text-sm text-white/85">{name}</span>
          <span className="flex gap-1" aria-hidden="true">
            {[1, 2, 3].map(dot => <span key={dot} className={`h-1.5 w-1.5 rounded-full ${dot <= level ? 'bg-lime' : 'bg-white/15'}`} />)}
          </span>
        </div>
      ))}
      <p className="flex items-center gap-2 border-t border-white/10 pt-4 text-xs text-lime"><Sparkles className="h-3.5 w-3.5" />{t('landing.trainingFeature2')}</p>
    </div>
  )
}

export function PantryPanel() {
  const { t } = useTranslation()
  const foods: Array<[string, string]> = [
    [t('landing.mockFood1'), t('landing.mockQty1')],
    [t('landing.mockFood2'), t('landing.mockQty2')],
    [t('landing.mockFood3'), t('landing.mockQty3')],
  ]
  return (
    <div className="w-full max-w-sm border border-white/10 bg-[hsl(75_6%_6%)] p-5 shadow-2xl shadow-black/40">
      <div className="flex items-center gap-3 border-b border-white/10 pb-4">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-lime/15 text-lime"><ShoppingBasket className="h-4 w-4" /></span>
        <div>
          <p className="font-bebas text-xl tracking-wide">{t('landing.mockPantry')}</p>
          <p className="text-xs text-white/45">{t('landing.mockPantrySub')}</p>
        </div>
      </div>
      <div className="space-y-3 py-4">
        {foods.map(([food, amount]) => (
          <div key={food} className="flex items-center justify-between text-sm">
            <span>{food}</span>
            <span className="text-white/45">{amount}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 pt-4">
        <p className="text-xs text-lime">{t('landing.mockRecipe')}</p>
        <p className="mt-1 font-bebas text-xl tracking-wide">{t('landing.mockRecipeName')}</p>
      </div>
      <div className="mt-4 flex items-center justify-between rounded-lg bg-white/[.05] px-4 py-3 text-xs">
        <span className="text-white/60">{t('landing.mockShopping')}: {t('landing.mockShoppingItem')}</span>
        <span className="font-mono text-lime">{t('landing.mockCost')}</span>
      </div>
    </div>
  )
}

/** Puntos del mes + récord personal + resumen semanal. */
export function ProgressPanel() {
  const { t } = useTranslation()
  const trained = new Set([1, 3, 4, 7, 9, 10, 12, 14, 16, 17, 20, 22, 23, 25])
  return (
    <div className="w-full max-w-sm border border-white/10 bg-[hsl(75_6%_6%)] p-5 shadow-2xl shadow-black/40">
      <p className="text-[10px] uppercase tracking-[.18em] text-white/45">{t('landing.mockMonth')}</p>
      <div className="mt-4 grid grid-cols-7 gap-2" aria-hidden="true">
        {Array.from({ length: 28 }, (_, i) => (
          <span
            key={i}
            className={`aspect-square rounded-[4px] ${i === 26 ? 'border border-lime' : trained.has(i) ? 'bg-lime/80' : 'bg-white/8'}`}
          />
        ))}
      </div>
      <div className="mt-5 flex items-center gap-3 border-t border-white/10 pt-4">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-lime/15 text-lime"><Trophy className="h-4 w-4" /></span>
        <p className="text-sm"><span className="font-semibold">{t('landing.mockPR')}</span> <span className="text-white/55">{t('landing.mockPRDetail')}</span></p>
      </div>
      <div className="mt-4 border-l-2 border-lime bg-white/[.04] px-4 py-3">
        <p className="text-[10px] uppercase tracking-[.18em] text-white/45">{t('landing.mockInsightLabel')}</p>
        <p className="mt-1 text-sm text-white/85">{t('landing.mockInsight')}</p>
      </div>
    </div>
  )
}

export function BeyondVisual({ index }: { index: number }) {
  const { t, i18n } = useTranslation()
  const stat = t(`landing.beyondStat${index + 1}`)
  const caption = t(`landing.beyondCaption${index + 1}`)
  const km = (value: string) => `${i18n.language.startsWith('es') ? value : value.replace(',', '.')} km`
  return (
    <div className="w-full max-w-sm">
      <div className="relative grid aspect-[4/3] place-items-center overflow-hidden border border-white/10 bg-[hsl(75_6%_6%)]">
        {index === 0 && (
          <svg viewBox="0 0 300 220" className="h-full w-full">
            <g stroke="hsl(0 0% 100% / .06)"><path d="M0 55h300M0 110h300M0 165h300M75 0v220M150 0v220M225 0v220" /></g>
            <path d="M40 180 C80 160 90 120 130 115 S190 140 215 95 S260 60 268 42" fill="none" stroke="hsl(74 90% 57%)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 0" />
            <circle cx="40" cy="180" r="5" fill="hsl(74 90% 57%)" />
            <circle cx="268" cy="42" r="5" fill="none" stroke="hsl(74 90% 57%)" strokeWidth="2" />
          </svg>
        )}
        {index === 1 && (
          <div className="relative grid place-items-center">
            <svg viewBox="0 0 120 120" className="h-36 w-36 -rotate-90">
              <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(0 0% 100% / .1)" strokeWidth="6" />
              <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(74 90% 57%)" strokeWidth="6" strokeLinecap="round" strokeDasharray="327" strokeDashoffset="98" />
            </svg>
            <span className="absolute font-mono text-2xl">0:24</span>
          </div>
        )}
        {index === 2 && (
          <div className="w-full px-8">
            <p className="text-center font-mono text-3xl tracking-tight text-lime">02:15:33</p>
            <div className="mt-5 space-y-2">
              {[['Ana', km('8,4'), false], ['Leo', km('7,9'), true], ['Mar', km('7,1'), false]].map(([name, dist, me], pos) => (
                <div key={String(name)} className={`flex items-center gap-3 px-3 py-2 text-sm ${me ? 'bg-lime/10 text-white' : 'text-white/55'}`}>
                  <span className="font-mono text-xs">{pos + 1}</span>
                  <span className="flex-1">{name}</span>
                  <span className="font-mono text-xs">{dist}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {index === 3 && (
          <div className="w-full px-8">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-lime/15 text-lime"><Flame className="h-4 w-4" /></span>
              <p className="font-bebas text-2xl tracking-wide">{t('landing.beyond4')}</p>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-[60%] rounded-full bg-lime" />
            </div>
            <p className="mt-3 font-mono text-xs text-white/55">{stat}</p>
          </div>
        )}
        {index === 4 && (
          <div className="w-full space-y-3 px-8">
            {['A', 'L'].map(initial => (
              <div key={initial} className="flex items-center gap-3 border border-white/8 bg-white/[.03] px-3 py-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-lime/15 text-xs font-bold text-lime">{initial}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-white/70">{stat}</span>
                <span className="shrink-0 rounded-full bg-white/8 px-2 py-0.5 text-[10px]">🔥 4</span>
              </div>
            ))}
          </div>
        )}
        {index === 5 && (
          <div className="w-full px-8">
            <div className="flex items-center gap-3 text-sm text-white/70">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-white/8"><WifiOff className="h-4 w-4" /></span>
              {stat}
            </div>
            <div className="mt-4 flex items-center gap-3 text-sm text-lime">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-lime/15"><RefreshCw className="h-4 w-4" /></span>
              <span className="flex items-center gap-2">{t('landing.ticker6')} <Check className="h-4 w-4 shrink-0" /></span>
            </div>
          </div>
        )}
        {index === 0 && <span className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-[hsl(75_8%_4%)]/90 px-2.5 py-1.5 font-mono text-[11px] text-lime"><Route className="h-3 w-3" />{stat}</span>}
        {index === 1 && <span className="absolute bottom-3 left-3 bg-[hsl(75_8%_4%)]/90 px-2.5 py-1.5 font-mono text-[11px] text-lime">{stat}</span>}
      </div>
      <p className="mt-4 text-sm leading-relaxed text-white/60">{caption}</p>
    </div>
  )
}
