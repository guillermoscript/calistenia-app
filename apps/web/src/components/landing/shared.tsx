/**
 * Primitivas compartidas entre la landing y las páginas de funciones.
 * Mantienen un mismo lenguaje visual (brutalist-athletic oscuro, acento lima).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Check, ChevronRight, Menu, X } from 'lucide-react'
import { op } from '@calistenia/core/lib/analytics'

export function usePrefersReducedMotion() {
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

export function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
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

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-medium uppercase tracking-[.24em] text-lime">{children}</p>
}

export function BenefitList({ items }: { items: string[] }) {
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

export function AndroidButton({ location, className = '' }: { location: string; className?: string }) {
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

const WEB_BUTTON_CLASS = 'inline-flex min-h-13 items-center justify-center gap-2 rounded-lg border border-white/15 px-5 py-3.5 text-sm font-semibold text-white/85 transition hover:border-white/50 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white'

/**
 * Con `onGetStarted` se comporta como botón (landing, que ya controla el flujo de auth).
 * Sin él navega a /auth — así las páginas de funciones no necesitan el callback.
 */
export function WebButton({ onGetStarted, location, className = '' }: { onGetStarted?: () => void; location: string; className?: string }) {
  const { t } = useTranslation()
  const label = <>{t('landing.webCta')} <ChevronRight className="h-4 w-4" /></>
  if (!onGetStarted) {
    return (
      <Link
        to="/auth"
        onClick={() => op.track('cta_clicked', { location, intent: 'web_start' })}
        className={`${WEB_BUTTON_CLASS} ${className}`}
      >
        {label}
      </Link>
    )
  }
  return (
    <button
      onClick={() => { op.track('cta_clicked', { location, intent: 'web_start' }); onGetStarted() }}
      className={`${WEB_BUTTON_CLASS} ${className}`}
    >
      {label}
    </button>
  )
}

/** Keyframes usadas por la landing y las páginas de funciones. */
export function LandingStyles() {
  return (
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
  )
}

/**
 * Cabecera pública. En la landing el CTA es un botón; en el resto navega a /auth.
 *
 * Los enlaces van en línea desde `sm`. Por debajo no caben —el logotipo solo ya
 * ocupa media pantalla en un móvil de 390px— así que se pliegan en un panel
 * desplegable. Antes se ocultaban sin más: en móvil no había navegación alguna.
 */
export function PublicHeader({ onGetStarted }: { onGetStarted?: () => void }) {
  const { t } = useTranslation()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  const navLinks = [
    { to: '/features', label: t('feature.navLink') },
    { to: '/blog', label: t('blog.title') },
    { to: '/download', label: t('landing.navDownload') },
  ]

  // Al navegar, el panel debe cerrarse solo: si no, queda abierto sobre la
  // página nueva.
  useEffect(() => { setMenuOpen(false) }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  const linkClass = 'text-sm font-semibold text-white/65 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white'

  const webCta = (className: string) =>
    onGetStarted ? (
      <button
        onClick={() => { op.track('cta_clicked', { location: 'header', intent: 'web_start' }); onGetStarted() }}
        className={className}
      >
        {t('landing.webCta')} <ChevronRight className="h-4 w-4" />
      </button>
    ) : (
      <Link
        to="/auth"
        onClick={() => op.track('cta_clicked', { location: 'header', intent: 'web_start' })}
        className={className}
      >
        {t('landing.webCta')} <ChevronRight className="h-4 w-4" />
      </Link>
    )

  return (
    <header className="absolute inset-x-0 top-0 z-20 px-6 py-6 md:px-10">
      <div className="flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
          <img src="/logo.png" alt="" className="h-8 w-8 rounded-lg" />
          <span className="font-bebas text-2xl tracking-[.15em]">CALISTENIA</span>
        </Link>

        <nav className="hidden items-center gap-6 sm:flex">
          {navLinks.map(link => (
            <Link key={link.to} to={link.to} className={linkClass}>{link.label}</Link>
          ))}
          {webCta(`inline-flex items-center gap-1.5 ${linkClass}`)}
        </nav>

        <button
          type="button"
          onClick={() => setMenuOpen(open => !open)}
          aria-expanded={menuOpen}
          aria-controls="public-nav"
          aria-label={t('landing.navMenu')}
          className="-mr-2 grid h-10 w-10 place-items-center text-white/70 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:hidden"
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {menuOpen && (
        <nav
          id="public-nav"
          className="mt-4 grid gap-1 border border-white/10 bg-[hsl(75_6%_6%)] p-2 sm:hidden"
        >
          {navLinks.map(link => (
            <Link key={link.to} to={link.to} className={`px-3 py-2.5 ${linkClass}`}>{link.label}</Link>
          ))}
          {webCta(`inline-flex items-center gap-1.5 border-t border-white/10 px-3 py-2.5 text-left ${linkClass}`)}
        </nav>
      )}
    </header>
  )
}

/** Pie público con el índice completo de funciones — descubrimiento + enlaces internos. */
export function PublicFooter({ featureLinks }: { featureLinks: Array<{ slug: string; label: string }> }) {
  const { t } = useTranslation()
  return (
    <footer className="border-t border-white/10 px-6 py-12 md:px-10">
      <div className="mx-auto grid max-w-6xl gap-10 text-xs text-white/45 lg:grid-cols-[1fr_auto]">
        <div>
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="" className="h-5 w-5 rounded" />
            <span className="font-bebas text-sm tracking-[.18em] text-white/70">CALISTENIA</span>
          </div>
          <p className="mt-3 max-w-xs leading-relaxed">{t('landing.footerAbout')}</p>
          <p className="mt-2 max-w-xs leading-relaxed text-white/30">{t('landing.footerBuiltDesc')}</p>
        </div>
        {/* Producto y Legal iban mezclados bajo el título "Legal": el índice del
            sitio quedaba escondido bajo una etiqueta que no le correspondía. */}
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <p className="text-[10px] uppercase tracking-[.2em] text-white/35">{t('feature.footerTitle')}</p>
            <ul className="mt-4 grid gap-2.5">
              {featureLinks.map(link => (
                <li key={link.slug}>
                  <Link to={`/features/${link.slug}`} className="transition hover:text-white">{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[.2em] text-white/35">{t('landing.footerProductTitle')}</p>
            <ul className="mt-4 grid gap-2.5">
              <li><Link to="/features" className="transition hover:text-white">{t('feature.allFeatures')}</Link></li>
              <li><Link to="/blog" className="transition hover:text-white">{t('blog.title')}</Link></li>
              <li><Link to="/download" className="transition hover:text-white">{t('landing.androidCta')}</Link></li>
              <li><Link to="/auth" className="transition hover:text-white">{t('landing.webCta')}</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[.2em] text-white/35">{t('landing.footerLinksTitle')}</p>
            <ul className="mt-4 grid gap-2.5">
              <li><Link to="/legal#privacy" className="transition hover:text-white">{t('landing.privacy')}</Link></li>
              <li><Link to="/legal#terms" className="transition hover:text-white">{t('landing.terms')}</Link></li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  )
}

/** Enlace "ver cómo funciona" que la landing usa al pie de cada sección. */
export function FeatureLink({ slug, location }: { slug: string; location: string }) {
  const { t } = useTranslation()
  return (
    <Link
      to={`/features/${slug}`}
      onClick={() => op.track('cta_clicked', { location, intent: 'feature_detail' })}
      className="group mt-8 inline-flex items-center gap-2 text-sm font-semibold text-lime transition hover:gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
    >
      {t('feature.learnMore')} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}
