import { useState, useEffect } from 'react'

interface LandingPageProps {
  onGetStarted: () => void
}

/* ── Stagger helper ─────────────────────────────────────────── */
function useStagger(count: number, baseDelay = 80) {
  const [visible, setVisible] = useState<boolean[]>(Array(count).fill(false))
  useEffect(() => {
    const timers = Array.from({ length: count }, (_, i) =>
      setTimeout(() => setVisible(v => { const next = [...v]; next[i] = true; return next }), baseDelay * (i + 1))
    )
    return () => timers.forEach(clearTimeout)
  }, [count, baseDelay])
  return visible
}

/* ── Feature data ───────────────────────────────────────────── */
const FEATURES = [
  {
    title: 'Entrena con estructura',
    desc: 'Programas de calistenia con progresiones claras. Registra series, repeticiones y peso.',
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <rect x="3" y="12" width="4" height="8" rx="1" fill="currentColor" opacity=".6" />
        <rect x="9" y="8" width="4" height="16" rx="1" fill="currentColor" opacity=".8" />
        <rect x="15" y="4" width="4" height="24" rx="1" fill="currentColor" />
        <rect x="21" y="10" width="4" height="12" rx="1" fill="currentColor" opacity=".7" />
        <rect x="27" y="6" width="4" height="20" rx="1" fill="currentColor" opacity=".9" />
      </svg>
    ),
  },
  {
    title: 'Nutrición simple',
    desc: 'Registra comidas, controla macros y agua. Base de datos de alimentos comunes.',
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="2" fill="none" />
        <path d="M16 8v8l5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'Mira tu progreso',
    desc: 'Gráficas de peso, volumen muscular, medidas corporales y fotos de progreso.',
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <polyline points="4,24 10,16 16,20 22,10 28,14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="28" cy="14" r="2.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    title: 'Calendario y rachas',
    desc: 'Visualiza tu constancia. Cada día cuenta.',
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <rect x="4" y="6" width="24" height="22" rx="3" stroke="currentColor" strokeWidth="2" fill="none" />
        <line x1="4" y1="13" x2="28" y2="13" stroke="currentColor" strokeWidth="2" />
        <line x1="11" y1="3" x2="11" y2="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="21" y1="3" x2="21" y2="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="11" cy="20" r="2" fill="currentColor" />
        <circle cx="16" cy="20" r="2" fill="currentColor" />
        <circle cx="21" cy="20" r="2" fill="currentColor" />
      </svg>
    ),
  },
]

export default function LandingPage({ onGetStarted }: LandingPageProps) {
  const vis = useStagger(FEATURES.length + 3, 100) // +3 for hero elements

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-lime/30">
      {/* ── Nav ─────────────────────────────────── */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-5xl mx-auto">
        <span className="font-bebas text-2xl tracking-wider">CALISTENIA</span>
        <button
          onClick={onGetStarted}
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Entrar
        </button>
      </nav>

      {/* ── Hero ────────────────────────────────── */}
      <section className="px-6 pt-16 pb-24 max-w-5xl mx-auto">
        <div className="max-w-2xl">
          <h1
            className="font-bebas text-[clamp(3.5rem,10vw,7rem)] leading-[0.9] tracking-tight"
            style={{
              opacity: vis[0] ? 1 : 0,
              transform: vis[0] ? 'none' : 'translateY(12px)',
              transition: 'opacity 0.6s cubic-bezier(0.16,1,0.3,1), transform 0.6s cubic-bezier(0.16,1,0.3,1)',
            }}
          >
            Tu entrenamiento.
            <br />
            <span className="text-lime">Tu progreso.</span>
          </h1>

          <p
            className="mt-6 text-lg text-muted-foreground max-w-md leading-relaxed"
            style={{
              opacity: vis[1] ? 1 : 0,
              transform: vis[1] ? 'none' : 'translateY(8px)',
              transition: 'opacity 0.5s cubic-bezier(0.16,1,0.3,1), transform 0.5s cubic-bezier(0.16,1,0.3,1)',
            }}
          >
            Registra ejercicios de calistenia, controla tu nutrición
            y mide tu progreso. Simple y directo.
          </p>

          <button
            onClick={onGetStarted}
            className="mt-10 inline-flex items-center gap-2 bg-foreground text-background font-medium text-sm px-7 py-3.5 rounded-lg hover:opacity-90 active:scale-[0.98] transition-all"
            style={{
              opacity: vis[2] ? 1 : 0,
              transform: vis[2] ? 'none' : 'translateY(8px)',
              transition: 'opacity 0.5s cubic-bezier(0.16,1,0.3,1), transform 0.5s cubic-bezier(0.16,1,0.3,1)',
            }}
          >
            Empezar gratis
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8h10m0 0L9 4m4 4L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </section>

      {/* ── Divider ─────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-6">
        <div className="h-px bg-border" />
      </div>

      {/* ── Features ────────────────────────────── */}
      <section className="px-6 py-20 max-w-5xl mx-auto">
        <div className="grid sm:grid-cols-2 gap-x-16 gap-y-14">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              style={{
                opacity: vis[i + 3] ? 1 : 0,
                transform: vis[i + 3] ? 'none' : 'translateY(10px)',
                transition: 'opacity 0.5s cubic-bezier(0.16,1,0.3,1), transform 0.5s cubic-bezier(0.16,1,0.3,1)',
              }}
            >
              <div className="text-lime mb-3">{f.icon}</div>
              <h3 className="font-bebas text-xl tracking-wide">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Divider ─────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-6">
        <div className="h-px bg-border" />
      </div>

      {/* ── Bottom CTA ──────────────────────────── */}
      <section className="px-6 py-24 max-w-5xl mx-auto text-center">
        <h2 className="font-bebas text-[clamp(2rem,6vw,4rem)] leading-[0.95] tracking-tight">
          Empieza hoy
        </h2>
        <p className="mt-4 text-muted-foreground max-w-sm mx-auto">
          Sin distracciones. Solo tu y tu entrenamiento.
        </p>
        <button
          onClick={onGetStarted}
          className="mt-8 inline-flex items-center gap-2 bg-lime text-lime-foreground font-medium text-sm px-7 py-3.5 rounded-lg hover:opacity-90 active:scale-[0.98] transition-all"
        >
          Crear cuenta
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8h10m0 0L9 4m4 4L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </section>

      {/* ── Footer ──────────────────────────────── */}
      <footer className="px-6 pb-8 max-w-5xl mx-auto">
        <div className="h-px bg-border mb-6" />
        <p className="text-xs text-muted-foreground">CALISTENIA &middot; Entrena con propósito</p>
      </footer>
    </div>
  )
}
