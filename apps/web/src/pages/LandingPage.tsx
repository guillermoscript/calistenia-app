import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight, Check, ChevronRight, Flame, RefreshCw, Route, Search,
  ShoppingBasket, Sparkles, Timer, Trophy, Users, WifiOff,
} from 'lucide-react'
import { op } from '@calistenia/core/lib/analytics'

interface LandingPageProps { onGetStarted: () => void }

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const reduced = usePrefersReducedMotion()
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect() }
    }, { threshold: 0.14 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const shown = visible || reduced
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0)' : 'translateY(18px)',
        transition: reduced ? 'none' : `opacity 700ms cubic-bezier(.16,1,.3,1) ${delay}ms, transform 700ms cubic-bezier(.16,1,.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-medium uppercase tracking-[.24em] text-lime">{children}</p>
}

function BenefitList({ items }: { items: string[] }) {
  return (
    <ul className="mt-8 grid gap-3 border-t border-white/10 pt-6 text-sm leading-relaxed text-white/72">
      {items.map(item => (
        <li key={item} className="flex gap-3">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-lime" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function AndroidButton({ location, className = '' }: { location: string; className?: string }) {
  const { t } = useTranslation()
  return (
    <Link
      to="/download"
      onClick={() => op.track('cta_clicked', { location, intent: 'android_download' })}
      className={`group inline-flex min-h-13 items-center justify-center gap-2 rounded-lg bg-lime px-7 py-3.5 text-[15px] font-bold text-[hsl(75_8%_5%)] transition hover:brightness-110 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(75_8%_3%)] ${className}`}
    >
      {t('landing.androidCta')} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}

function WebButton({ onGetStarted, location, className = '' }: { onGetStarted: () => void; location: string; className?: string }) {
  const { t } = useTranslation()
  return (
    <button
      onClick={() => { op.track('cta_clicked', { location, intent: 'web_start' }); onGetStarted() }}
      className={`inline-flex min-h-13 items-center justify-center gap-2 rounded-lg border border-white/15 px-5 py-3.5 text-sm font-semibold text-white/85 transition hover:border-white/50 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${className}`}
    >
      {t('landing.webCta')} <ChevronRight className="h-4 w-4" />
    </button>
  )
}

/** Real Today-session UI inside a phone frame — the product, above the fold. */
function HeroPhone() {
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

function Ticker() {
  const { t } = useTranslation()
  const reduced = usePrefersReducedMotion()
  const items = [t('landing.ticker1'), t('landing.ticker2'), t('landing.ticker3'), t('landing.ticker4'), t('landing.ticker5'), t('landing.ticker6')]
  if (reduced) {
    return (
      <div className="border-y border-white/10 px-6 py-5">
        <ul className="mx-auto flex max-w-6xl flex-wrap gap-x-8 gap-y-2 text-sm text-white/60">
          {items.map(item => <li key={item} className="flex items-center gap-3"><span className="h-1 w-1 rounded-full bg-lime" />{item}</li>)}
        </ul>
      </div>
    )
  }
  const strip = items.map(item => (
    <span key={item} className="flex items-center gap-10">
      <span className="whitespace-nowrap text-sm text-white/60">{item}</span>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-lime" />
    </span>
  ))
  return (
    <div className="overflow-hidden border-y border-white/10 py-5" aria-hidden="true">
      <div className="landing-marquee flex w-max items-center gap-10">
        {strip}
        {items.map(item => (
          <span key={`${item}-dup`} className="flex items-center gap-10">
            <span className="whitespace-nowrap text-sm text-white/60">{item}</span>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-lime" />
          </span>
        ))}
      </div>
    </div>
  )
}

/** Exercise-library panel: breadth + level variants without repeating the hero screen. */
function LibraryPanel() {
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

function PantryPanel() {
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

/** Month dots + personal record + weekly insight — the literal product concepts named in the copy. */
function ProgressPanel() {
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

function BeyondVisual({ index }: { index: number }) {
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

export default function LandingPage({ onGetStarted }: LandingPageProps) {
  const { t } = useTranslation()
  const reduced = usePrefersReducedMotion()
  const [active, setActive] = useState(0)
  const [autoPlay, setAutoPlay] = useState(true)
  const features = [t('landing.beyond1'), t('landing.beyond2'), t('landing.beyond3'), t('landing.beyond4'), t('landing.beyond5'), t('landing.beyond6')]

  useEffect(() => {
    if (reduced || !autoPlay) return
    const id = setInterval(() => setActive(prev => (prev + 1) % 6), 3500)
    return () => clearInterval(id)
  }, [reduced, autoPlay])

  const selectFeature = (index: number) => { setAutoPlay(false); setActive(index) }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[hsl(75_8%_3%)] text-white selection:bg-lime/30">
      <style>{`
        @keyframes landing-marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        @keyframes landing-float { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-7px) } }
        @keyframes landing-rise { from { opacity: 0; transform: translateY(24px) } to { opacity: 1; transform: translateY(0) } }
        .landing-marquee { animation: landing-marquee 36s linear infinite }
        .landing-float { animation: landing-float 5.5s ease-in-out infinite }
        .landing-rise { animation: landing-rise 800ms cubic-bezier(.16,1,.3,1) both }
        @media (prefers-reduced-motion: reduce) {
          .landing-marquee, .landing-float, .landing-rise { animation: none }
        }
      `}</style>

      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-6 md:px-10">
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="" className="h-8 w-8 rounded-lg" />
          <span className="font-bebas text-2xl tracking-[.15em]">CALISTENIA</span>
        </div>
        <button
          onClick={() => { op.track('cta_clicked', { location: 'header', intent: 'web_start' }); onGetStarted() }}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/65 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          {t('landing.webCta')} <ChevronRight className="h-4 w-4" />
        </button>
      </header>

      <main>
        {/* Hero — full-bleed, type-led, real product UI above the fold */}
        <section className="relative isolate overflow-hidden bg-[radial-gradient(ellipse_at_75%_20%,hsl(74_90%_57%_/_0.14),transparent_40%),hsl(75_8%_3%)] px-6 pb-20 pt-28 md:px-10 lg:pt-32">
          <div aria-hidden="true" className="absolute inset-0 opacity-40 [background-image:linear-gradient(hsl(0_0%_100%_/_0.045)_1px,transparent_1px),linear-gradient(90deg,hsl(0_0%_100%_/_0.045)_1px,transparent_1px)] [background-size:52px_52px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />
          <div aria-hidden="true" className="absolute -right-24 top-1/2 hidden h-[560px] w-[560px] -translate-y-1/2 rounded-full border border-lime/20 lg:block" />
          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-16 lg:grid-cols-[1.05fr_.75fr]">
            <div className="max-w-2xl">
              <div className="landing-rise"><Eyebrow>{t('landing.kicker')}</Eyebrow></div>
              <h1 className="landing-rise mt-5 font-bebas text-[clamp(4rem,10.5vw,8.5rem)] leading-[.84] tracking-tight" style={{ animationDelay: '80ms' }}>
                {t('landing.heroTitle1')}<br />
                <span className="text-lime">{t('landing.heroTitle2')}</span>
              </h1>
              <p className="landing-rise mt-8 max-w-lg text-lg leading-relaxed text-white/68 sm:text-xl" style={{ animationDelay: '160ms' }}>
                {t('landing.heroDesc')}
              </p>
              <div className="landing-rise mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center" style={{ animationDelay: '240ms' }}>
                <AndroidButton location="hero" />
                <WebButton onGetStarted={onGetStarted} location="hero" />
              </div>
              <p className="landing-rise mt-5 text-[13px] text-white/45" style={{ animationDelay: '320ms' }}>{t('landing.trust')}</p>
            </div>
            <div className="landing-rise mx-auto pr-2 sm:pr-0" style={{ animationDelay: '280ms' }}>
              <HeroPhone />
            </div>
          </div>
        </section>

        {/* Real numbers, right after the hero */}
        <Ticker />

        {/* Beginner promise */}
        <section>
          <Reveal className="mx-auto max-w-6xl px-6 py-16 md:px-10 md:py-20">
            <Eyebrow>{t('landing.startEyebrow')}</Eyebrow>
            <div className="mt-5 grid gap-10 lg:grid-cols-[.72fr_1fr]">
              <div>
                <h2 className="font-bebas text-5xl leading-[.88] tracking-tight sm:text-6xl">{t('landing.startTitle')}</h2>
                <p className="mt-6 max-w-md text-sm leading-relaxed text-white/55">{t('landing.stepsProof')}</p>
              </div>
              <div className="grid gap-6 sm:grid-cols-3">
                {[t('landing.step1'), t('landing.step2'), t('landing.step3')].map((step, i) => (
                  <div key={step} className="border-t border-white/20 pt-4">
                    <span className="font-mono text-xs text-lime">0{i + 1}</span>
                    <p className="mt-5 text-base leading-snug text-white/80">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </section>

        {/* Training */}
        <section className="border-t border-white/10">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-24 md:px-10 lg:grid-cols-2 lg:py-32">
            <Reveal>
              <Eyebrow>{t('landing.trainingEyebrow')}</Eyebrow>
              <h2 className="mt-5 max-w-md font-bebas text-5xl leading-[.88] tracking-tight sm:text-6xl">{t('landing.trainingTitle')}</h2>
              <p className="mt-6 max-w-md text-base leading-relaxed text-white/60">{t('landing.trainingDesc')}</p>
              <BenefitList items={[t('landing.trainingFeature1'), t('landing.trainingFeature2'), t('landing.trainingFeature3')]} />
            </Reveal>
            <Reveal delay={120} className="flex justify-center lg:justify-end">
              <LibraryPanel />
            </Reveal>
          </div>
        </section>

        {/* Nutrition + pantry */}
        <section className="border-y border-white/10 bg-white/[.025]">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-24 md:px-10 lg:grid-cols-2 lg:py-32">
            <Reveal className="order-2 flex justify-center lg:order-1 lg:justify-start">
              <PantryPanel />
            </Reveal>
            <Reveal className="order-1 lg:order-2">
              <Eyebrow>{t('landing.foodEyebrow')}</Eyebrow>
              <h2 className="mt-5 max-w-md font-bebas text-5xl leading-[.88] tracking-tight sm:text-6xl">{t('landing.foodTitle')}</h2>
              <p className="mt-6 max-w-md text-base leading-relaxed text-white/60">{t('landing.foodDesc')}</p>
              <BenefitList items={[t('landing.foodFeature1'), t('landing.foodFeature2'), t('landing.foodFeature3')]} />
            </Reveal>
          </div>
        </section>

        {/* Progress */}
        <section>
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-24 md:px-10 lg:grid-cols-2 lg:py-32">
            <Reveal>
              <Eyebrow>{t('landing.progressEyebrow')}</Eyebrow>
              <h2 className="mt-5 max-w-md font-bebas text-5xl leading-[.88] tracking-tight sm:text-6xl">{t('landing.progressTitle')}</h2>
              <p className="mt-6 max-w-md text-base leading-relaxed text-white/60">{t('landing.progressDesc')}</p>
              <BenefitList items={[t('landing.progressFeature1'), t('landing.progressFeature2'), t('landing.progressFeature3')]} />
            </Reveal>
            <Reveal delay={120} className="flex justify-center lg:justify-end">
              <ProgressPanel />
            </Reveal>
          </div>
        </section>

        {/* Beyond the routine — interactive reveal with a visual per item */}
        <section className="border-t border-white/10">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 md:px-10 lg:grid-cols-[1fr_.85fr] lg:py-32">
            <Reveal>
              <Eyebrow>{t('landing.beyondEyebrow')}</Eyebrow>
              <h2 className="mt-5 font-bebas text-5xl leading-[.88] tracking-tight sm:text-6xl">{t('landing.beyondTitle')}</h2>
              <div className="mt-10 border-t border-white/15">
                {features.map((feature, index) => (
                  <button
                    key={feature}
                    onMouseEnter={() => selectFeature(index)}
                    onFocus={() => selectFeature(index)}
                    onClick={() => selectFeature(index)}
                    aria-pressed={active === index}
                    className={`flex w-full items-center justify-between border-b border-white/15 py-4 text-left text-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime sm:text-xl ${active === index ? 'text-lime' : 'text-white/45 hover:text-white/85'}`}
                  >
                    <span>{feature}</span>
                    <span className={`font-mono text-xs transition-opacity ${active === index ? 'opacity-100' : 'opacity-0'}`}>0{index + 1}</span>
                  </button>
                ))}
              </div>
              <p className="mt-4 text-xs text-white/35">{t('landing.beyondHint')}</p>
            </Reveal>
            <Reveal delay={90} className="flex items-start justify-center lg:sticky lg:top-24 lg:justify-end lg:self-start">
              <BeyondVisual index={active} />
            </Reveal>
          </div>
        </section>

        {/* Platform choice */}
        <section className="border-y border-white/10 bg-lime px-6 py-20 text-[hsl(75_8%_5%)] md:px-10 md:py-28">
          <Reveal className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.24em] text-black/55">{t('landing.platformEyebrow')}</p>
              <h2 className="mt-5 max-w-2xl font-bebas text-5xl leading-[.88] tracking-tight sm:text-6xl">{t('landing.platformTitle')}</h2>
              <p className="mt-6 max-w-lg text-base leading-relaxed text-black/65">{t('landing.platformDesc')}</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <AndroidButton location="platform" className="!bg-black !text-white focus-visible:!ring-black focus-visible:!ring-offset-lime" />
              <WebButton onGetStarted={onGetStarted} location="platform" className="!border-black/30 !text-black hover:!border-black hover:!bg-black/5 focus-visible:!ring-black" />
            </div>
          </Reveal>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-6xl px-6 py-28 md:px-10 md:py-40">
          <Reveal>
            <h2 className="max-w-3xl font-bebas text-[clamp(3.5rem,9vw,7rem)] leading-[.84] tracking-tight">{t('landing.finalTitle')}</h2>
            <p className="mt-7 max-w-lg text-lg leading-relaxed text-white/60">{t('landing.finalDesc')}</p>
            <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <AndroidButton location="final" />
              <WebButton onGetStarted={onGetStarted} location="final" />
            </div>
            <p className="mt-5 text-[13px] text-white/45">{t('landing.trust')}</p>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-white/10 px-6 py-10 md:px-10">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-8 text-xs text-white/45 sm:flex-row sm:items-end">
          <div>
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="" className="h-5 w-5 rounded" />
              <span className="font-bebas text-sm tracking-[.18em] text-white/70">CALISTENIA</span>
            </div>
            <p className="mt-3 max-w-xs leading-relaxed">{t('landing.footerAbout')}</p>
            <p className="mt-2 max-w-xs leading-relaxed text-white/30">{t('landing.footerBuiltDesc')}</p>
          </div>
          <div className="flex gap-5">
            <Link to="/legal#privacy" className="hover:text-white">{t('landing.privacy')}</Link>
            <Link to="/legal#terms" className="hover:text-white">{t('landing.terms')}</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
