import { useState, useEffect, useId, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

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

/* ── Mini UI mockup components ───────────────────────────────── */
function MockWorkoutCard() {
  return (
    <div className="bg-[hsl(0_0%_6%)] border border-[hsl(0_0%_12%)] rounded-xl p-5 w-full max-w-sm">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs uppercase tracking-widest text-[hsl(0_0%_50%)]">Día 1 — Push</span>
        <span className="text-xs text-lime font-medium">Fase 2</span>
      </div>
      {[
        { name: 'Diamond Push-ups', sets: '4×12', done: true },
        { name: 'Parallel Bar Dips', sets: '3×10', done: true },
        { name: 'Pike Push-ups', sets: '3×8', done: false },
      ].map((ex, i) => (
        <div key={i} className="flex items-center gap-3 py-2.5 border-b border-[hsl(0_0%_10%)] last:border-0">
          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
            ex.done ? 'border-lime bg-lime/20' : 'border-[hsl(0_0%_25%)]'
          }`}>
            {ex.done && (
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
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

  return (
    <div className="bg-[hsl(0_0%_6%)] border border-[hsl(0_0%_12%)] rounded-xl p-5 w-full max-w-sm">
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
        <path d={`${pathData} L${w - pad},${h - pad} L${pad},${h - pad} Z`} fill={`url(#${gradId})`} />
        <path d={pathData} fill="none" stroke="hsl(74 90% 57%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={w - pad} cy={pad + (1 - (points[points.length - 1] - minVal) / range) * (h - 2 * pad)} r="4" fill="hsl(74 90% 57%)" />
      </svg>
    </div>
  )
}

function MockNutrition() {
  const macros = [
    { label: 'Proteína', value: 142, max: 160, color: 'hsl(74 90% 57%)' },
    { label: 'Carbos', value: 210, max: 250, color: 'hsl(45 90% 55%)' },
    { label: 'Grasa', value: 55, max: 70, color: 'hsl(20 80% 55%)' },
  ]
  return (
    <div className="bg-[hsl(0_0%_6%)] border border-[hsl(0_0%_12%)] rounded-xl p-5 w-full max-w-sm">
      <div className="flex items-baseline justify-between mb-4">
        <span className="text-xs uppercase tracking-widest text-[hsl(0_0%_50%)]">Hoy</span>
        <span className="text-2xl font-bebas tracking-wide text-[hsl(0_0%_95%)]">1,840 <span className="text-sm text-[hsl(0_0%_50%)]">kcal</span></span>
      </div>
      <div className="space-y-3">
        {macros.map((m) => (
          <div key={m.label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-[hsl(0_0%_60%)]">{m.label}</span>
              <span className="text-[hsl(0_0%_80%)] tabular-nums">{m.value}g / {m.max}g</span>
            </div>
            <div className="h-1.5 bg-[hsl(0_0%_12%)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${(m.value / m.max) * 100}%`, background: m.color }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MockCalendar() {
  // 5 weeks × 7 days heatmap
  const data = [
    [0, 1, 0, 1, 1, 0, 0],
    [1, 0, 1, 1, 0, 1, 0],
    [1, 1, 0, 1, 1, 0, 0],
    [0, 1, 1, 0, 1, 1, 0],
    [1, 1, 0, 1, 0, 0, 0],
  ]
  return (
    <div className="bg-[hsl(0_0%_6%)] border border-[hsl(0_0%_12%)] rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs uppercase tracking-widest text-[hsl(0_0%_50%)]">Marzo 2026</span>
        <span className="text-xs text-lime font-medium">12 días racha</span>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
          <span key={d} className="text-[11px] text-center text-[hsl(0_0%_50%)]">{d}</span>
        ))}
        {data.flat().map((v, i) => (
          <div
            key={i}
            className="aspect-square rounded-sm"
            style={{
              background: v ? 'hsl(74 90% 57% / 0.7)' : 'hsl(0 0% 10%)',
            }}
          />
        ))}
      </div>
    </div>
  )
}

function MockCardio() {
  return (
    <div className="bg-[hsl(0_0%_6%)] border border-[hsl(0_0%_12%)] rounded-xl p-5 w-full max-w-sm">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-6 h-6 rounded-full bg-lime/20 flex items-center justify-center">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="hsl(74 90% 57%)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </div>
        <span className="text-xs uppercase tracking-widest text-[hsl(0_0%_50%)]">Carrera</span>
      </div>
      <div className="grid grid-cols-3 gap-4 text-center">
        {[
          { val: '5.2', unit: 'km', label: 'Distancia' },
          { val: '27:14', unit: '', label: 'Tiempo' },
          { val: "5'14\"", unit: '/km', label: 'Ritmo' },
        ].map((s) => (
          <div key={s.label}>
            <p className="text-xl font-bebas text-[hsl(0_0%_95%)]">{s.val}<span className="text-xs text-[hsl(0_0%_50%)]">{s.unit}</span></p>
            <p className="text-[11px] text-[hsl(0_0%_50%)] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>
      {/* Fake route line */}
      <div className="mt-4 h-16 rounded-lg bg-[hsl(0_0%_9%)] relative overflow-hidden">
        <svg viewBox="0 0 200 50" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
          <path d="M10,40 Q40,10 80,25 T150,15 T190,35" fill="none" stroke="hsl(74 90% 57%)" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
        </svg>
      </div>
    </div>
  )
}

function MockSocial() {
  const users = [
    { name: 'Carlos M.', val: '184 pts', pos: 1 },
    { name: 'Ana R.', val: '172 pts', pos: 2 },
    { name: 'Tú', val: '168 pts', pos: 3, highlight: true },
  ]
  return (
    <div className="bg-[hsl(0_0%_6%)] border border-[hsl(0_0%_12%)] rounded-xl p-5 w-full max-w-sm">
      <span className="text-xs uppercase tracking-widest text-[hsl(0_0%_50%)]">Tabla de líderes</span>
      <div className="mt-3 space-y-2">
        {users.map((u) => (
          <div key={u.name} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${u.highlight ? 'bg-lime/10 border border-lime/20' : ''}`}>
            <span className="text-sm font-bebas w-5 text-center text-[hsl(0_0%_50%)]">{u.pos}</span>
            <div className="w-7 h-7 rounded-full bg-[hsl(0_0%_15%)] flex items-center justify-center text-xs text-[hsl(0_0%_60%)]">
              {u.name[0]}
            </div>
            <span className={`flex-1 text-sm ${u.highlight ? 'text-lime' : 'text-[hsl(0_0%_80%)]'}`}>{u.name}</span>
            <span className="text-xs tabular-nums text-[hsl(0_0%_50%)]">{u.val}</span>
          </div>
        ))}
      </div>
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

/* ── Stat counter ────────────────────────────────────────────── */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-bebas text-[clamp(2.5rem,5vw,4rem)] leading-none tracking-tight">{value}</p>
      <p className="text-sm text-muted-foreground mt-1">{label}</p>
    </div>
  )
}

/* ── Main landing page ───────────────────────────────────────── */
export default function LandingPage({ onGetStarted }: LandingPageProps) {
  const { t } = useTranslation()
  const vis = useStagger(4, 120)

  return (
    <div className="min-h-screen bg-[hsl(0_0%_2%)] text-[hsl(0_0%_92%)] selection:bg-lime/20 overflow-x-hidden">
      {/* ── Nav ─────────────────────────────────── */}
      <nav aria-label="Principal" className="flex items-center justify-between px-6 md:px-10 py-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="" className="w-8 h-8 rounded-lg" />
          <span className="font-bebas text-2xl tracking-[0.15em] text-[hsl(0_0%_95%)]">CALISTENIA</span>
        </div>
        <button
          onClick={onGetStarted}
          className="text-sm text-[hsl(0_0%_55%)] hover:text-[hsl(0_0%_90%)] transition-colors duration-200 px-3 py-2 -mr-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(0_0%_2%)]"
        >
          {t('landing.enter')}
        </button>
      </nav>

      <main>
      {/* ── Hero ────────────────────────────────── */}
      <section className="px-6 md:px-10 pt-16 sm:pt-28 pb-20 sm:pb-32 max-w-6xl mx-auto">
        <div className="max-w-3xl">
          <p
            className="text-sm uppercase tracking-[0.3em] text-lime mb-6"
            style={{
              opacity: vis[0] ? 1 : 0,
              transform: vis[0] ? 'none' : 'translateY(8px)',
              transition: 'opacity 0.6s cubic-bezier(0.16,1,0.3,1), transform 0.6s cubic-bezier(0.16,1,0.3,1)',
            }}
          >
            {t('landing.tagline')}
          </p>
          <h1
            className="font-bebas text-[clamp(3.5rem,11vw,8rem)] leading-[0.88] tracking-tight"
            style={{
              opacity: vis[1] ? 1 : 0,
              transform: vis[1] ? 'none' : 'translateY(16px)',
              transition: 'opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1)',
            }}
          >
            {t('landing.heroTitle1')}{' '}
            <br className="sm:hidden" />
            {t('landing.heroTitle2')}
            <br />
            <span className="text-lime">{t('landing.heroTitle3')}</span>
          </h1>

          <p
            className="mt-8 text-lg sm:text-xl text-[hsl(0_0%_52%)] max-w-lg leading-relaxed"
            style={{
              opacity: vis[2] ? 1 : 0,
              transform: vis[2] ? 'none' : 'translateY(8px)',
              transition: 'opacity 0.6s cubic-bezier(0.16,1,0.3,1), transform 0.6s cubic-bezier(0.16,1,0.3,1)',
            }}
          >
            {t('landing.heroDesc')}
          </p>

          <div
            className="mt-10 flex flex-wrap items-center gap-4"
            style={{
              opacity: vis[3] ? 1 : 0,
              transform: vis[3] ? 'none' : 'translateY(8px)',
              transition: 'opacity 0.6s cubic-bezier(0.16,1,0.3,1), transform 0.6s cubic-bezier(0.16,1,0.3,1)',
            }}
          >
            <button
              onClick={onGetStarted}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-lime text-[hsl(0_0%_5%)] font-semibold text-sm px-7 py-3.5 rounded-lg hover:brightness-110 active:scale-[0.97] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(0_0%_2%)]"
            >
              {t('landing.startFree')}
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10m0 0L9 4m4 4L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <span className="text-xs text-[hsl(0_0%_50%)] w-full sm:w-auto text-center sm:text-left">{t('landing.freeForever')}</span>
          </div>
        </div>
      </section>

      {/* ── Stats bar ───────────────────────────── */}
      <Reveal>
        <div className="border-y border-[hsl(0_0%_10%)]">
          <div className="max-w-6xl mx-auto px-6 md:px-10 py-12 grid grid-cols-2 sm:grid-cols-4 gap-8">
            <Stat value="150+" label={t('landing.statsExercises')} />
            <Stat value="4" label={t('landing.statsPhases')} />
            <Stat value="PWA" label={t('landing.statsPWA')} />
            <Stat value="0" label={t('landing.statsCost')} />
          </div>
        </div>
      </Reveal>

      {/* ── Feature 1: Entrenamiento ─────────────── */}
      <section className="max-w-6xl mx-auto px-6 md:px-10 py-16 sm:py-24 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-10 sm:gap-16 lg:gap-20 items-center">
          <Reveal>
            <div>
              <SectionTag>{t('landing.training')}</SectionTag>
              <h2 className="font-bebas text-[clamp(2rem,5vw,3.5rem)] leading-[0.92] tracking-tight mt-5">
                {t('landing.trainingTitle')}
              </h2>
              <p className="mt-5 text-[hsl(0_0%_50%)] leading-relaxed max-w-md">
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

      {/* ── Feature 2: Progreso ──────────────────── */}
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
              <p className="mt-5 text-[hsl(0_0%_50%)] leading-relaxed max-w-md">
                {t('landing.analyticsDesc')}
              </p>
              <ul className="mt-6 space-y-2.5">
                {[
                  t('landing.analyticsFeature1'),
                  t('landing.analyticsFeature2'),
                  t('landing.analyticsFeature3'),
                  t('landing.analyticsFeature4'),
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
        </div>
      </section>

      {/* ── Feature 3: Nutrición ─────────────────── */}
      <section className="max-w-6xl mx-auto px-6 md:px-10 py-16 sm:py-24 lg:py-32 border-t border-[hsl(0_0%_8%)]">
        <div className="grid lg:grid-cols-2 gap-10 sm:gap-16 lg:gap-20 items-center">
          <Reveal>
            <div>
              <SectionTag>{t('landing.nutrition')}</SectionTag>
              <h2 className="font-bebas text-[clamp(2rem,5vw,3.5rem)] leading-[0.92] tracking-tight mt-5">
                {t('landing.nutritionTitle')}
              </h2>
              <p className="mt-5 text-[hsl(0_0%_50%)] leading-relaxed max-w-md">
                {t('landing.nutritionDesc')}
              </p>
              <ul className="mt-6 space-y-2.5">
                {[
                  t('landing.nutritionFeature1'),
                  t('landing.nutritionFeature2'),
                  t('landing.nutritionFeature3'),
                  t('landing.nutritionFeature4'),
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
              <MockNutrition />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Two-column: Cardio + Calendar ────────── */}
      <section className="max-w-6xl mx-auto px-6 md:px-10 py-16 sm:py-24 lg:py-32 border-t border-[hsl(0_0%_8%)]">
        <div className="grid md:grid-cols-2 gap-14 md:gap-20">
          {/* Cardio */}
          <Reveal>
            <div>
              <SectionTag>{t('landing.cardio')}</SectionTag>
              <h2 className="font-bebas text-[clamp(1.8rem,4vw,2.8rem)] leading-[0.92] tracking-tight mt-5">
                {t('landing.cardioTitle')}
              </h2>
              <p className="mt-4 text-[hsl(0_0%_50%)] leading-relaxed text-sm">
                {t('landing.cardioDesc')}
              </p>
              <div className="mt-6" aria-hidden="true">
                <MockCardio />
              </div>
            </div>
          </Reveal>

          {/* Calendar */}
          <Reveal delay={100}>
            <div>
              <SectionTag>{t('landing.consistency')}</SectionTag>
              <h2 className="font-bebas text-[clamp(1.8rem,4vw,2.8rem)] leading-[0.92] tracking-tight mt-5">
                {t('landing.consistencyTitle')}
              </h2>
              <p className="mt-4 text-[hsl(0_0%_50%)] leading-relaxed text-sm">
                {t('landing.consistencyDesc')}
              </p>
              <div className="mt-6" aria-hidden="true">
                <MockCalendar />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Feature 4: Social ────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 md:px-10 py-16 sm:py-24 lg:py-32 border-t border-[hsl(0_0%_8%)]">
        <div className="grid lg:grid-cols-2 gap-10 sm:gap-16 lg:gap-20 items-center">
          <Reveal delay={150} className="order-2 lg:order-1">
            <div className="flex justify-center lg:justify-start" aria-hidden="true">
              <MockSocial />
            </div>
          </Reveal>
          <Reveal className="order-1 lg:order-2">
            <div>
              <SectionTag>{t('landing.social')}</SectionTag>
              <h2 className="font-bebas text-[clamp(2rem,5vw,3.5rem)] leading-[0.92] tracking-tight mt-5">
                {t('landing.socialTitle')}
              </h2>
              <p className="mt-5 text-[hsl(0_0%_50%)] leading-relaxed max-w-md">
                {t('landing.socialDesc')}
              </p>
              <ul className="mt-6 space-y-2.5">
                {[
                  t('landing.socialFeature1'),
                  t('landing.socialFeature2'),
                  t('landing.socialFeature3'),
                  t('landing.socialFeature4'),
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
        </div>
      </section>

      {/* ── Extras grid ──────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 md:px-10 py-16 sm:py-24 lg:py-32 border-t border-[hsl(0_0%_8%)]">
        <Reveal>
          <SectionTag>{t('landing.more')}</SectionTag>
          <h2 className="font-bebas text-[clamp(2rem,5vw,3.5rem)] leading-[0.92] tracking-tight mt-5 mb-14">
            {t('landing.moreTitle')}
          </h2>
        </Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-12">
          {[
            {
              title: t('landing.extraLumbar'),
              desc: t('landing.extraLumbarDesc'),
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
                  <path d="M12 2C8 2 6 5 6 8c0 2 1 3.5 2 4.5S10 15 10 17h4c0-2 0-3.5 2-4.5S18 10 18 8c0-3-2-6-6-6z" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M10 21h4M10 17v1a2 2 0 002 2 2 2 0 002-2v-1" strokeLinecap="round" />
                </svg>
              ),
            },
            {
              title: t('landing.extraOffline'),
              desc: t('landing.extraOfflineDesc'),
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
                  <path d="M12 18h.01M8 21h8a1 1 0 001-1v-1a1 1 0 00-1-1H8a1 1 0 00-1 1v1a1 1 0 001 1z" strokeLinecap="round" />
                  <path d="M2 8.82a15 15 0 0120 0M5 12.86a10 10 0 0114 0M8.5 16.9a5 5 0 017 0" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ),
            },
            {
              title: t('landing.extraReminders'),
              desc: t('landing.extraRemindersDesc'),
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9zM13.73 21a2 2 0 01-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ),
            },
            {
              title: t('landing.extraFreeSessions'),
              desc: t('landing.extraFreeSessionsDesc'),
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
              ),
            },
            {
              title: t('landing.extraProfiles'),
              desc: t('landing.extraProfilesDesc'),
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 4-7 8-7s8 3 8 7" strokeLinecap="round" />
                </svg>
              ),
            },
            {
              title: t('landing.extraTour'),
              desc: t('landing.extraTourDesc'),
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
                </svg>
              ),
            },
          ].map((f, i) => (
            <Reveal key={f.title} delay={i * 60}>
              <div className="group">
                <div className="text-lime mb-3 opacity-70 group-hover:opacity-100 transition-opacity">{f.icon}</div>
                <h3 className="font-bebas text-lg tracking-wide text-[hsl(0_0%_90%)]">{f.title}</h3>
                <p className="mt-1.5 text-sm text-[hsl(0_0%_50%)] leading-relaxed">{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Bottom CTA ──────────────────────────── */}
      <section className="border-t border-[hsl(0_0%_8%)]">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-20 sm:py-28 lg:py-36">
          <Reveal>
            <div className="max-w-2xl">
              <h2 className="font-bebas text-[clamp(2.5rem,7vw,5rem)] leading-[0.88] tracking-tight">
                {t('landing.ctaTitle')}
                <br />
                <span className="text-lime">{t('landing.ctaFree')}</span>
              </h2>
              <p className="mt-6 text-[hsl(0_0%_48%)] text-lg max-w-md leading-relaxed">
                {t('landing.ctaDesc')}
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <button
                  onClick={onGetStarted}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-lime text-[hsl(0_0%_5%)] font-semibold text-sm px-8 py-4 rounded-lg hover:brightness-110 active:scale-[0.97] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(0_0%_2%)]"
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
      <footer className="border-t border-[hsl(0_0%_8%)] px-6 md:px-10 py-8 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="" className="w-5 h-5 rounded opacity-50" />
            <span className="font-bebas text-sm tracking-[0.2em] text-[hsl(0_0%_50%)]">CALISTENIA</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-[hsl(0_0%_50%)]">
            <Link to="/legal#privacy" className="hover:text-[hsl(0_0%_70%)] transition-colors">{t('landing.privacy')}</Link>
            <span>·</span>
            <Link to="/legal#terms" className="hover:text-[hsl(0_0%_70%)] transition-colors">{t('landing.terms')}</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
