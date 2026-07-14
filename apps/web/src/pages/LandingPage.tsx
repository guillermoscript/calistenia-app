import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Check, ChevronRight, Dumbbell, ShoppingBasket, Sparkles, TrendingUp } from 'lucide-react'
import { op } from '@calistenia/core/lib/analytics'

interface LandingPageProps { onGetStarted: () => void }

function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect() }
    }, { threshold: 0.14 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return <div ref={ref} className={className} style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(18px)', transition: `opacity 700ms cubic-bezier(.16,1,.3,1) ${delay}ms, transform 700ms cubic-bezier(.16,1,.3,1) ${delay}ms` }}>{children}</div>
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-medium uppercase tracking-[.24em] text-lime">{children}</p>
}

function AndroidButton({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  return <Link to="/download" onClick={() => op.track('cta_clicked', { location: className || 'landing', intent: 'android_download' })} className={`group inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-lime px-5 py-3 text-sm font-bold text-[hsl(0_0%_5%)] transition hover:brightness-110 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(0_0%_3%)] ${className}`}>
    {t('landing.androidCta')} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
  </Link>
}

function WebButton({ onGetStarted, className = '' }: { onGetStarted: () => void; className?: string }) {
  const { t } = useTranslation()
  return <button onClick={() => { op.track('cta_clicked', { location: className || 'landing', intent: 'web_start' }); onGetStarted() }} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/55 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${className}`}>
    {t('landing.webCta')} <ChevronRight className="h-4 w-4" />
  </button>
}

function ProductPanel({ type }: { type: 'session' | 'pantry' | 'progress' }) {
  const { t } = useTranslation()
  if (type === 'session') return <div className="w-full max-w-sm border border-white/10 bg-[hsl(0_0%_6%)] p-5 shadow-2xl shadow-black/40">
    <div className="flex items-center justify-between border-b border-white/10 pb-4"><div><p className="text-[10px] uppercase tracking-[.18em] text-white/45">{t('landing.mockToday')}</p><p className="mt-1 font-bebas text-2xl tracking-wide">{t('landing.mockSession')}</p></div><span className="text-xs text-lime">01 / 03</span></div>
    {[['Incline push-ups', '3 × 8', true], ['Bodyweight row', '3 × 8', false], ['Squat', '3 × 12', false]].map(([name, sets, done]) => <div key={String(name)} className="flex items-center gap-3 border-b border-white/5 py-4 last:border-0"><span className={`flex h-5 w-5 items-center justify-center rounded-full border ${done ? 'border-lime bg-lime text-black' : 'border-white/25'}`}>{done ? <Check className="h-3 w-3" /> : null}</span><span className="flex-1 text-sm text-white/85">{name}</span><span className="font-mono text-xs text-white/45">{sets}</span></div>)}</div>
  if (type === 'pantry') return <div className="w-full max-w-sm border border-white/10 bg-[hsl(0_0%_6%)] p-5 shadow-2xl shadow-black/40">
    <div className="flex items-center gap-3 border-b border-white/10 pb-4"><span className="grid h-9 w-9 place-items-center rounded-full bg-lime/15 text-lime"><ShoppingBasket className="h-4 w-4" /></span><div><p className="font-bebas text-xl tracking-wide">{t('landing.mockPantry')}</p><p className="text-xs text-white/45">{t('landing.mockPantrySub')}</p></div></div>
    <div className="space-y-3 py-5">{[['Avena', '4 porciones'], ['Huevos', '6 unidades'], ['Banano', '3 unidades']].map(([food, amount]) => <div key={food} className="flex items-center justify-between text-sm"><span>{food}</span><span className="text-white/45">{amount}</span></div>)}</div>
    <div className="border-t border-white/10 pt-4"><p className="text-xs text-lime">{t('landing.mockRecipe')}</p><p className="mt-1 font-bebas text-xl tracking-wide">Avena con banano</p></div></div>
  return <div className="w-full max-w-sm border border-white/10 bg-[hsl(0_0%_6%)] p-5 shadow-2xl shadow-black/40"><div className="flex items-start justify-between"><div><p className="text-[10px] uppercase tracking-[.18em] text-white/45">{t('landing.mockWeek')}</p><p className="mt-1 font-bebas text-2xl tracking-wide">{t('landing.mockProgress')}</p></div><TrendingUp className="h-5 w-5 text-lime" /></div><svg viewBox="0 0 260 90" className="mt-7 w-full overflow-visible"><path d="M0 75 C28 68 37 75 58 57 S87 68 108 46 S143 55 161 32 S202 41 260 10" fill="none" stroke="hsl(74 90% 57%)" strokeWidth="2" /><circle cx="260" cy="10" r="4" fill="hsl(74 90% 57%)" /></svg><div className="mt-4 flex justify-between border-t border-white/10 pt-4 text-xs text-white/45"><span>{t('landing.mockWorkouts')}</span><span className="text-lime">3 / 3</span></div></div>
}

export default function LandingPage({ onGetStarted }: LandingPageProps) {
  const { t } = useTranslation()
  const [active, setActive] = useState(0)
  const features = [t('landing.beyond1'), t('landing.beyond2'), t('landing.beyond3'), t('landing.beyond4'), t('landing.beyond5'), t('landing.beyond6')]
  return <div className="min-h-screen overflow-x-hidden bg-[hsl(0_0%_3%)] text-white selection:bg-lime/30">
    <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-6 md:px-10"><div className="flex items-center gap-2.5"><img src="/logo.png" alt="" className="h-8 w-8 rounded-lg" /><span className="font-bebas text-2xl tracking-[.15em]">CALISTENIA</span></div><WebButton onGetStarted={onGetStarted} className="!min-h-0 !border-0 !px-2 !py-2 text-white/65 hover:text-white" /></header>
    <main>
      <section className="relative isolate flex min-h-[100svh] items-end overflow-hidden bg-[radial-gradient(ellipse_at_78%_22%,hsl(74_90%_57%_/_0.2),transparent_35%),radial-gradient(ellipse_at_78%_70%,hsl(0_0%_18%),transparent_38%),hsl(0_0%_3%)] px-6 pb-16 pt-32 md:px-10 md:pb-20">
        <div aria-hidden="true" className="absolute inset-0 opacity-40 [background-image:linear-gradient(hsl(0_0%_100%_/_0.045)_1px,transparent_1px),linear-gradient(90deg,hsl(0_0%_100%_/_0.045)_1px,transparent_1px)] [background-size:52px_52px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
        <div aria-hidden="true" className="absolute bottom-[-15vw] right-[-4vw] h-[min(67vw,680px)] w-[min(67vw,680px)] rounded-full border border-lime/25 bg-[radial-gradient(circle_at_40%_40%,hsl(74_90%_57%_/_0.25),transparent_45%)]" />
        <div className="relative mx-auto grid w-full max-w-6xl items-end gap-10 lg:grid-cols-[1fr_.75fr]"><div className="max-w-2xl"><Eyebrow>{t('landing.kicker')}</Eyebrow><h1 className="mt-5 font-bebas text-[clamp(4.2rem,11vw,9rem)] leading-[.82] tracking-tight">{t('landing.heroTitle1')}<br /><span className="text-lime">{t('landing.heroTitle2')}</span></h1><p className="mt-8 max-w-lg text-lg leading-relaxed text-white/68 sm:text-xl">{t('landing.heroDesc')}</p><div className="mt-10 flex flex-col gap-3 sm:flex-row"><AndroidButton className="hero-android" /><WebButton onGetStarted={onGetStarted} className="hero-web" /></div></div><div className="hidden lg:block"><p className="max-w-xs border-l border-lime pl-5 text-sm leading-relaxed text-white/65">{t('landing.heroProof')}</p></div></div>
      </section>
      <section className="border-y border-white/10"><Reveal className="mx-auto max-w-6xl px-6 py-16 md:px-10 md:py-20"><Eyebrow>{t('landing.startEyebrow')}</Eyebrow><div className="mt-5 grid gap-10 lg:grid-cols-[.72fr_1fr]"><h2 className="font-bebas text-5xl leading-[.88] tracking-tight sm:text-6xl">{t('landing.startTitle')}</h2><div className="grid gap-6 sm:grid-cols-3">{[t('landing.step1'), t('landing.step2'), t('landing.step3')].map((step, i) => <div key={step} className="border-t border-white/20 pt-4"><span className="font-mono text-xs text-lime">0{i + 1}</span><p className="mt-5 text-base leading-snug text-white/80">{step}</p></div>)}</div></div></Reveal></section>
      <section className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-24 md:px-10 lg:grid-cols-2 lg:py-36"><Reveal><Eyebrow>{t('landing.trainingEyebrow')}</Eyebrow><h2 className="mt-5 max-w-md font-bebas text-5xl leading-[.88] tracking-tight sm:text-6xl">{t('landing.trainingTitle')}</h2><p className="mt-6 max-w-md text-base leading-relaxed text-white/60">{t('landing.trainingDesc')}</p><p className="mt-8 flex items-center gap-2 text-sm text-lime"><Dumbbell className="h-4 w-4" />{t('landing.trainingProof')}</p></Reveal><Reveal delay={120} className="flex justify-center lg:justify-end"><ProductPanel type="session" /></Reveal></section>
      <section className="border-y border-white/10 bg-white/[.025]"><div className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-24 md:px-10 lg:grid-cols-2 lg:py-36"><Reveal className="order-2 flex justify-center lg:order-1 lg:justify-start"><ProductPanel type="pantry" /></Reveal><Reveal className="order-1 lg:order-2"><Eyebrow>{t('landing.foodEyebrow')}</Eyebrow><h2 className="mt-5 max-w-md font-bebas text-5xl leading-[.88] tracking-tight sm:text-6xl">{t('landing.foodTitle')}</h2><p className="mt-6 max-w-md text-base leading-relaxed text-white/60">{t('landing.foodDesc')}</p><p className="mt-8 flex items-center gap-2 text-sm text-lime"><Sparkles className="h-4 w-4" />{t('landing.foodProof')}</p></Reveal></div></section>
      <section className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-24 md:px-10 lg:grid-cols-2 lg:py-36"><Reveal><Eyebrow>{t('landing.progressEyebrow')}</Eyebrow><h2 className="mt-5 max-w-md font-bebas text-5xl leading-[.88] tracking-tight sm:text-6xl">{t('landing.progressTitle')}</h2><p className="mt-6 max-w-md text-base leading-relaxed text-white/60">{t('landing.progressDesc')}</p></Reveal><Reveal delay={120} className="flex justify-center lg:justify-end"><ProductPanel type="progress" /></Reveal></section>
      <section className="border-t border-white/10"><div className="mx-auto grid max-w-6xl gap-10 px-6 py-24 md:px-10 lg:grid-cols-[.7fr_1fr] lg:py-36"><Reveal><Eyebrow>{t('landing.beyondEyebrow')}</Eyebrow><h2 className="mt-5 font-bebas text-5xl leading-[.88] tracking-tight sm:text-6xl">{t('landing.beyondTitle')}</h2></Reveal><Reveal delay={90}><div className="border-t border-white/15">{features.map((feature, index) => <button key={feature} onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)} onClick={() => setActive(index)} className={`flex w-full items-center justify-between border-b border-white/15 py-4 text-left text-lg transition sm:text-xl ${active === index ? 'text-lime' : 'text-white/45 hover:text-white/85'}`}><span>{feature}</span><span className={`font-mono text-xs ${active === index ? 'opacity-100' : 'opacity-0'}`}>0{index + 1}</span></button>)}</div></Reveal></div></section>
      <section className="border-y border-white/10 bg-lime px-6 py-20 text-[hsl(0_0%_5%)] md:px-10 md:py-28"><Reveal className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_auto] lg:items-end"><div><Eyebrow>{t('landing.platformEyebrow')}</Eyebrow><h2 className="mt-5 max-w-2xl font-bebas text-5xl leading-[.88] tracking-tight sm:text-6xl">{t('landing.platformTitle')}</h2><p className="mt-6 max-w-lg text-base leading-relaxed text-black/65">{t('landing.platformDesc')}</p></div><div className="flex flex-col gap-3 sm:flex-row"><AndroidButton className="platform-android !bg-black !text-white" /><WebButton onGetStarted={onGetStarted} className="platform-web !border-black/30 !text-black hover:!border-black hover:!bg-black/5" /></div></Reveal></section>
      <section className="mx-auto max-w-6xl px-6 py-28 md:px-10 md:py-40"><Reveal><h2 className="max-w-3xl font-bebas text-[clamp(3.5rem,9vw,7rem)] leading-[.84] tracking-tight">{t('landing.finalTitle')}</h2><p className="mt-7 max-w-lg text-lg leading-relaxed text-white/60">{t('landing.finalDesc')}</p><div className="mt-10 flex flex-col gap-3 sm:flex-row"><AndroidButton className="final-android" /><WebButton onGetStarted={onGetStarted} className="final-web" /></div></Reveal></section>
    </main>
    <footer className="border-t border-white/10 px-6 py-10 md:px-10"><div className="mx-auto flex max-w-6xl flex-col justify-between gap-6 text-xs text-white/45 sm:flex-row sm:items-end"><div><div className="flex items-center gap-2"><img src="/logo.png" alt="" className="h-5 w-5 rounded" /><span className="font-bebas text-sm tracking-[.18em] text-white/70">CALISTENIA</span></div><p className="mt-3 max-w-xs leading-relaxed">{t('landing.footerAbout')}</p></div><div className="flex gap-5"><Link to="/legal#privacy" className="hover:text-white">{t('landing.privacy')}</Link><Link to="/legal#terms" className="hover:text-white">{t('landing.terms')}</Link></div></div></footer>
  </div>
}
