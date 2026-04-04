import { useState, useEffect, useId, useRef, useCallback, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { op } from '../lib/analytics'

interface LandingPageProps {
  onGetStarted: () => void
}

/* ── Scroll reveal hook ──────────────────────────────────────── */
function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return { ref, visible }
}

function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const { ref, visible } = useReveal(0.1)
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : 'translateY(20px)',
        transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}

/* ── Stagger for hero ────────────────────────────────────────── */
function useStagger(count: number, baseDelay = 100) {
  const [visible, setVisible] = useState<boolean[]>(Array(count).fill(false))
  useEffect(() => {
    const timers = Array.from({ length: count }, (_, i) =>
      setTimeout(() => setVisible(v => { const next = [...v]; next[i] = true; return next }), baseDelay * (i + 1))
    )
    return () => timers.forEach(clearTimeout)
  }, [count, baseDelay])
  return visible
}

const ease = 'cubic-bezier(0.16,1,0.3,1)'
function staggerStyle(visible: boolean, translateY = 8, duration = 0.6) {
  return {
    opacity: visible ? 1 : 0,
    transform: visible ? 'none' : `translateY(${translateY}px)`,
    transition: `opacity ${duration}s ${ease}, transform ${duration}s ${ease}`,
  } as const
}

/* ── Mini UI mockup components ───────────────────────────────── */
function MockWorkoutCard() {
  const { ref, visible } = useReveal(0.3)
  return (
    <div ref={ref} className="bg-[hsl(0_0%_6%)] border border-[hsl(0_0%_12%)] rounded-xl p-5 w-full max-w-sm">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs uppercase tracking-widest text-[hsl(0_0%_50%)]">Día 1 — Push</span>
        <span className="text-xs text-lime font-medium">Fase 2</span>
      </div>
      {[
        { name: 'Diamond Push-ups', sets: '4×12', done: true },
        { name: 'Parallel Bar Dips', sets: '3×10', done: true },
        { name: 'Pike Push-ups', sets: '3×8', done: false },
      ].map((ex, i) => (
        <div
          key={i}
          className="flex items-center gap-3 py-2.5 border-b border-[hsl(0_0%_10%)] last:border-0"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'none' : 'translateX(-8px)',
            transition: `opacity 0.5s cubic-bezier(0.16,1,0.3,1) ${200 + i * 150}ms, transform 0.5s cubic-bezier(0.16,1,0.3,1) ${200 + i * 150}ms`,
          }}
        >
          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${ex.done ? 'border-lime bg-lime/20' : 'border-[hsl(0_0%_25%)]'
            }`}>
            {ex.done && (
              <svg
                width="10"
                height="10"
                viewBox="0 0 16 16"
                fill="none"
                style={{
                  strokeDasharray: 20,
                  strokeDashoffset: visible ? 0 : 20,
                  transition: `stroke-dashoffset 0.4s ease ${400 + i * 150}ms`,
                }}
              >
                <path d="M3 8l4 4 6-7" stroke="hsl(74 90% 57%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-[hsl(0_0%_90%)] truncate">{ex.name}</p>
          </div>
          <span className="text-xs text-[hsl(0_0%_50%)] tabular-nums">{ex.sets}</span>
        </div>
      ))}
    </div>
  )
}

function MockProgressChart() {
  const gradId = useId()
  const { ref, visible } = useReveal(0.3)
  const points = [68, 67.5, 67.8, 67.2, 66.5, 66.8, 66.1, 65.5, 65.2, 65.8, 65.0, 64.5]
  const maxVal = Math.max(...points)
  const minVal = Math.min(...points)
  const range = maxVal - minVal || 1
  const w = 280
  const h = 100
  const pad = 8
  const pathData = points
    .map((p, i) => {
      const x = pad + (i / (points.length - 1)) * (w - 2 * pad)
      const y = pad + (1 - (p - minVal) / range) * (h - 2 * pad)
      return `${i === 0 ? 'M' : 'L'}${x},${y}`
    })
    .join(' ')

  const pathLength = 350

  return (
    <div ref={ref} className="bg-[hsl(0_0%_6%)] border border-[hsl(0_0%_12%)] rounded-xl p-5 w-full max-w-sm">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs uppercase tracking-widest text-[hsl(0_0%_50%)]">Peso corporal</span>
        <span className="text-2xl font-bebas tracking-wide text-[hsl(0_0%_95%)]">64.5 <span className="text-sm text-[hsl(0_0%_50%)]">kg</span></span>
      </div>
      <span className="text-xs text-lime">-3.5 kg en 12 semanas</span>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-4 w-full" style={{ height: 100 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(74 90% 57%)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="hsl(74 90% 57%)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d={`${pathData} L${w - pad},${h - pad} L${pad},${h - pad} Z`}
          fill={`url(#${gradId})`}
          style={{ opacity: visible ? 1 : 0, transition: 'opacity 1s ease 0.8s' }}
        />
        <path
          d={pathData}
          fill="none"
          stroke="hsl(74 90% 57%)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={pathLength}
          strokeDashoffset={visible ? 0 : pathLength}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1)' }}
        />
        <circle
          cx={w - pad}
          cy={pad + (1 - (points[points.length - 1] - minVal) / range) * (h - 2 * pad)}
          r="4"
          fill="hsl(74 90% 57%)"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'scale(1)' : 'scale(0)',
            transformOrigin: 'center',
            transformBox: 'fill-box',
            transition: 'opacity 0.3s ease 1.1s, transform 0.3s cubic-bezier(0.34,1.56,0.64,1) 1.1s',
          }}
        />
      </svg>
    </div>
  )
}

/* ── Section label ───────────────────────────────────────────── */
function SectionTag({ children }: { children: string }) {
  return (
    <span className="inline-block text-[11px] uppercase tracking-[0.25em] text-lime font-medium border border-lime/25 rounded-full px-3 py-1">
      {children}
    </span>
  )
}

/* ── Animated stat counter ────────────────────────────────────── */
function useCountUp(target: number, duration = 1200) {
  const [count, setCount] = useState(0)
  const [started, setStarted] = useState(false)
  const start = useCallback(() => setStarted(true), [])

  useEffect(() => {
    if (!started) return
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) { setCount(target); return }

    const steps = 40
    const increment = target / steps
    const interval = duration / steps
    let current = 0
    const timer = setInterval(() => {
      current += increment
      if (current >= target) { setCount(target); clearInterval(timer) }
      else setCount(Math.floor(current))
    }, interval)
    return () => clearInterval(timer)
  }, [started, target, duration])

  return { count, start }
}

function Stat({ value, label, numeric }: { value: string; label: string; numeric?: number }) {
  const { ref, visible } = useReveal(0.2)
  const { count, start } = useCountUp(numeric ?? 0)

  useEffect(() => { if (visible) start() }, [visible, start])

  const display = numeric != null ? `${count}${value.replace(/\d+/, '')}` : value

  return (
    <div ref={ref}>
      <p className="font-bebas text-[clamp(2.5rem,5vw,4rem)] leading-none tracking-tight">{display}</p>
      <p className="text-sm text-muted-foreground mt-1">{label}</p>
    </div>
  )
}

/* ── Feature card for compact grid ───────────────────────────── */
function FeatureCard({ icon, title, desc }: { icon: ReactNode; title: string; desc: string }) {
  return (
    <div className="group bg-[hsl(0_0%_4%)] border border-[hsl(0_0%_10%)] rounded-xl p-5 transition-all duration-300 hover:-translate-y-1 hover:border-lime/20 hover:shadow-[0_4px_24px_rgba(74,205,61,0.06)]">
      <div className="text-lime mb-3 opacity-70 group-hover:opacity-100 transition-opacity duration-300">{icon}</div>
      <h3 className="font-bebas text-lg tracking-wide text-[hsl(0_0%_90%)]">{title}</h3>
      <p className="mt-1.5 text-sm text-[hsl(0_0%_55%)] leading-relaxed">{desc}</p>
    </div>
  )
}

/* ── Main landing page ───────────────────────────────────────── */
export default function LandingPage({ onGetStarted }: LandingPageProps) {
  const { t } = useTranslation()
  const vis = useStagger(4, 120)

  const handleCTA = (location: string) => {
    op.track('cta_clicked', { location })
    onGetStarted()
  }

  return (
    <div className="min-h-screen bg-[hsl(0_0%_2%)] text-[hsl(0_0%_92%)] selection:bg-lime/20 overflow-x-hidden">
      {/* ── Nav ─────────────────────────────────── */}
      <nav aria-label="Principal" className="flex items-center justify-between px-6 md:px-10 py-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="" className="w-8 h-8 rounded-lg" />
          <span className="font-bebas text-2xl tracking-[0.15em] text-[hsl(0_0%_95%)]">CALISTENIA</span>
        </div>
        <button
          onClick={() => handleCTA('nav')}
          className="text-sm text-[hsl(0_0%_55%)] hover:text-[hsl(0_0%_90%)] transition-colors duration-200 px-3 py-2 -mr-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(0_0%_2%)]"
        >
          {t('landing.enter')}
        </button>
      </nav>

      <main>
        {/* ── Hero ────────────────────────────────── */}
        <section className="relative px-6 md:px-10 pt-12 sm:pt-20 pb-16 sm:pb-28 max-w-6xl mx-auto overflow-hidden">
          {/* Decorative grid overlay */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `linear-gradient(hsl(74 90% 57% / 0.04) 1px, transparent 1px),
                                linear-gradient(90deg, hsl(74 90% 57% / 0.04) 1px, transparent 1px)`,
              backgroundSize: '48px 48px',
              maskImage: 'radial-gradient(ellipse 80% 60% at 70% 50%, black 30%, transparent 80%)',
              pointerEvents: 'none',
            }}
          />

          <div className="relative grid lg:grid-cols-2 gap-0 lg:gap-0 items-center">
            {/* ── Logo (mobile: above text, desktop: right column) ── */}
            <div
              className="order-first lg:order-last flex items-center justify-center lg:justify-end"
              aria-hidden="true"
              style={{
                opacity: vis[0] ? 1 : 0,
                transition: `opacity 0.9s ${ease} 80ms`,
              }}
            >
              <img
                src="/logo-bg-less.png"
                alt="Calistenia athlete logo"
                className="w-[200px] h-[200px] sm:w-[260px] sm:h-[260px] lg:w-[clamp(280px,40vw,480px)] lg:h-[clamp(280px,40vw,480px)]"
                style={{ objectFit: 'contain' }}
              />
            </div>

            {/* ── Text column ── */}
            <div className="order-last lg:order-first flex flex-col justify-center lg:pr-12 z-10 pb-10 lg:pb-0">
              <p
                className="text-sm uppercase tracking-[0.3em] text-lime mb-6"
                style={staggerStyle(vis[0])}
              >
                {t('landing.tagline')}
              </p>

              <h1
                className="font-bebas text-[clamp(3.5rem,9vw,7.5rem)] leading-[0.88] tracking-tight"
                style={staggerStyle(vis[1], 16, 0.7)}
              >
                {t('landing.heroTitle1')}{' '}
                <br className="sm:hidden" />
                {t('landing.heroTitle2')}
                <br />
                <span className="text-lime">{t('landing.heroTitle3')}</span>
              </h1>

              <p
                className="mt-8 text-lg sm:text-xl text-[hsl(0_0%_62%)] max-w-md leading-relaxed"
                style={staggerStyle(vis[2])}
              >
                {t('landing.heroDesc')}
              </p>

              <div className="mt-10 flex flex-wrap items-center gap-4" style={staggerStyle(vis[3])}>
                <button
                  onClick={() => handleCTA('hero')}
                  className="group/cta w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-lime text-[hsl(0_0%_5%)] font-semibold text-sm px-7 py-3.5 rounded-lg hover:brightness-110 active:scale-[0.97] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(0_0%_2%)]"
                >
                  {t('landing.startFree')}
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="transition-transform duration-200 group-hover/cta:translate-x-0.5">
                    <path d="M3 8h10m0 0L9 4m4 4L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <span className="text-xs text-[hsl(0_0%_50%)] w-full sm:w-auto text-center sm:text-left">
                  {t('landing.earlyAccess')}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Stats bar ───────────────────────────── */}
        <Reveal>
          <div className="border-y border-[hsl(0_0%_10%)]">
            <div className="max-w-6xl mx-auto px-6 md:px-10 py-12 grid grid-cols-3 gap-8">
              <Stat value="150+" label={t('landing.statsExercises')} numeric={150} />
              <Stat value="4" label={t('landing.statsPhases')} numeric={4} />
              <Stat value="100%" label={t('landing.statsPWA')} numeric={100} />
            </div>
          </div>
        </Reveal>

        {/* ── Hero feature: Training ─────────────── */}
        <section className="max-w-6xl mx-auto px-6 md:px-10 py-16 sm:py-24 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-10 sm:gap-16 lg:gap-20 items-center">
            <Reveal>
              <div>
                <SectionTag>{t('landing.training')}</SectionTag>
                <h2 className="font-bebas text-[clamp(2rem,5vw,3.5rem)] leading-[0.92] tracking-tight mt-5">
                  {t('landing.trainingTitle')}
                </h2>
                <p className="mt-5 text-[hsl(0_0%_55%)] leading-relaxed max-w-md">
                  {t('landing.trainingDesc')}
                </p>
                <ul className="mt-6 space-y-2.5">
                  {[
                    t('landing.trainingFeature1'),
                    t('landing.trainingFeature2'),
                    t('landing.trainingFeature3'),
                    t('landing.trainingFeature4'),
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm text-[hsl(0_0%_65%)]">
                      <svg className="w-4 h-4 text-lime mt-0.5 shrink-0" viewBox="0 0 16 16" fill="none">
                        <path d="M3 8l4 4 6-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal delay={150}>
              <div className="flex justify-center lg:justify-end" aria-hidden="true">
                <MockWorkoutCard />
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Analytics highlight with chart ──────── */}
        <section className="max-w-6xl mx-auto px-6 md:px-10 py-16 sm:py-24 lg:py-32 border-t border-[hsl(0_0%_8%)]">
          <div className="grid lg:grid-cols-2 gap-10 sm:gap-16 lg:gap-20 items-center">
            <Reveal delay={150} className="order-2 lg:order-1">
              <div className="flex justify-center lg:justify-start" aria-hidden="true">
                <MockProgressChart />
              </div>
            </Reveal>
            <Reveal className="order-1 lg:order-2">
              <div>
                <SectionTag>{t('landing.analytics')}</SectionTag>
                <h2 className="font-bebas text-[clamp(2rem,5vw,3.5rem)] leading-[0.92] tracking-tight mt-5">
                  {t('landing.analyticsTitle')}
                </h2>
                <p className="mt-5 text-[hsl(0_0%_55%)] leading-relaxed max-w-md">
                  {t('landing.analyticsDesc')}
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Features grid (compact) ──────────────── */}
        <section className="max-w-6xl mx-auto px-6 md:px-10 py-16 sm:py-24 lg:py-32 border-t border-[hsl(0_0%_8%)]">
          <Reveal>
            <SectionTag>{t('landing.more')}</SectionTag>
            <h2 className="font-bebas text-[clamp(2rem,5vw,3.5rem)] leading-[0.92] tracking-tight mt-5 mb-14">
              {t('landing.moreTitle')}
            </h2>
          </Reveal>
          <Reveal>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {([
                { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5"><path d="M12 2C8 2 6 5 6 8c0 2 1 3.5 2 4.5S10 15 10 17h4c0-2 0-3.5 2-4.5S18 10 18 8c0-3-2-6-6-6z" strokeLinecap="round" strokeLinejoin="round" /><path d="M10 21h4M10 17v1a2 2 0 002 2 2 2 0 002-2v-1" strokeLinecap="round" /></svg>, key: 'Nutrition', title: t('landing.featureNutrition'), desc: t('landing.featureNutritionDesc') },
                { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" /></svg>, key: 'Cardio', title: t('landing.featureCardio'), desc: t('landing.featureCardioDesc') },
                { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeLinecap="round" strokeLinejoin="round" /></svg>, key: 'Social', title: t('landing.featureSocial'), desc: t('landing.featureSocialDesc') },
                { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" /></svg>, key: 'Consistency', title: t('landing.featureConsistency'), desc: t('landing.featureConsistencyDesc') },
                { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5"><path d="M2 8.82a15 15 0 0120 0M5 12.86a10 10 0 0114 0M8.5 16.9a5 5 0 017 0" strokeLinecap="round" strokeLinejoin="round" /><path d="M12 20h.01" strokeLinecap="round" /></svg>, key: 'Offline', title: t('landing.featureOffline'), desc: t('landing.featureOfflineDesc') },
                { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>, key: 'FreeSessions', title: t('landing.featureFreeSessions'), desc: t('landing.featureFreeSessionsDesc') },
              ] as const).map((f) => (
                <FeatureCard key={f.key} icon={f.icon} title={f.title} desc={f.desc} />
              ))}
            </div>
          </Reveal>
        </section>

        {/* ── Install / How to use ───────────────── */}
        <section className="max-w-6xl mx-auto px-6 md:px-10 py-16 sm:py-24 lg:py-32 border-t border-[hsl(0_0%_8%)]">
          <Reveal>
            <div className="max-w-2xl mx-auto text-center">
              <SectionTag>{t('landing.install')}</SectionTag>
              <h2 className="font-bebas text-[clamp(2rem,5vw,3.5rem)] leading-[0.92] tracking-tight mt-5">
                {t('landing.installTitle')}
              </h2>
              <p className="mt-5 text-[hsl(0_0%_55%)] leading-relaxed">
                {t('landing.installDesc')}
              </p>
            </div>
          </Reveal>
          <Reveal>
            <div className="mt-12 grid sm:grid-cols-3 gap-6 mx-auto">
              {[
                { step: '1', title: t('landing.installStep1'), desc: t('landing.installStep1Desc') },
                { step: '2', title: t('landing.installStep2'), desc: t('landing.installStep2Desc') },
                { step: '3', title: t('landing.installStep3'), desc: t('landing.installStep3Desc') },
              ].map((s) => (
                <div key={s.step} className="text-center">
                  <div className="w-8 h-8 rounded-full bg-lime/15 text-lime font-bebas text-lg flex items-center justify-center mx-auto mb-3">
                    {s.step}
                  </div>
                  <h3 className="font-bebas text-base tracking-wide text-[hsl(0_0%_90%)]">{s.title}</h3>
                  <p className="mt-1.5 text-sm text-[hsl(0_0%_50%)] leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        {/* ── Bottom CTA ──────────────────────────── */}
        <section className="border-t border-[hsl(0_0%_8%)]">
          <div className="max-w-6xl mx-auto px-6 md:px-10 py-20 sm:py-28 lg:py-36">
            <Reveal>
              <div className="max-w-2xl">
                <h2 className="font-bebas text-[clamp(2.5rem,7vw,5rem)] leading-[0.88] tracking-tight">
                  {t('landing.ctaTitle')}
                </h2>
                <p className="mt-6 text-[hsl(0_0%_55%)] text-lg max-w-md leading-relaxed">
                  {t('landing.ctaDesc')}
                </p>
                <div className="mt-10 flex flex-wrap items-center gap-4">
                  <button
                    onClick={() => handleCTA('bottom')}
                    className="group/cta w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-lime text-[hsl(0_0%_5%)] font-semibold text-sm px-8 py-4 rounded-lg hover:brightness-110 active:scale-[0.97] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(0_0%_2%)]"
                  >
                    {t('landing.createFreeAccount')}
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8h10m0 0L9 4m4 4L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

      </main>
      {/* ── Footer ──────────────────────────────── */}
      <footer className="border-t border-[hsl(0_0%_8%)] px-6 md:px-10 py-10 max-w-6xl mx-auto">
        <div className="grid sm:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <img src="/logo.png" alt="" className="w-6 h-6 rounded" />
              <span className="font-bebas text-sm tracking-[0.2em] text-[hsl(0_0%_70%)]">CALISTENIA</span>
            </div>
            <p className="text-xs text-[hsl(0_0%_45%)] leading-relaxed max-w-xs">
              {t('landing.footerAbout')}
            </p>
          </div>
          {/* Links */}
          <div>
            <h4 className="font-bebas text-sm tracking-[0.15em] text-[hsl(0_0%_60%)] mb-3">{t('landing.footerLinksTitle')}</h4>
            <ul className="space-y-2 text-sm text-[hsl(0_0%_45%)]">
              <li><Link to="/legal#privacy" className="hover:text-[hsl(0_0%_70%)] transition-colors">{t('landing.privacy')}</Link></li>
              <li><Link to="/legal#terms" className="hover:text-[hsl(0_0%_70%)] transition-colors">{t('landing.terms')}</Link></li>
            </ul>
          </div>
          {/* Built by */}
          <div>
            <h4 className="font-bebas text-sm tracking-[0.15em] text-[hsl(0_0%_60%)] mb-3">{t('landing.footerBuiltTitle')}</h4>
            <p className="text-xs text-[hsl(0_0%_45%)] leading-relaxed">
              {t('landing.footerBuiltDesc')}
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
