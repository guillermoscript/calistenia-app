/**
 * Envoltorio del blog.
 *
 * Reutiliza la cabecera y el pie públicos de `components/landing/shared.tsx`:
 * el blog es la puerta de entrada del tráfico orgánico, así que tiene que
 * llevar exactamente la misma identidad que la landing y las páginas de
 * funciones (logo + CALISTENIA en Bebas), no una propia.
 *
 * Antes tenía cabecera y pie inventados con las primitivas de la APP
 * (`bg-card`, `border`, iconos de lucide), que son las del dashboard privado.
 * El resultado eran dos marcas distintas en el mismo dominio.
 */
import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { FEATURES } from '../../data/features'
import { LandingStyles, PublicFooter, PublicHeader } from '../landing/shared'

interface BlogLayoutProps {
  children: ReactNode
}

export default function BlogLayout({ children }: BlogLayoutProps) {
  const { t } = useTranslation()
  const featureLinks = FEATURES.map((f) => ({ slug: f.slug, label: t(`feature.${f.slug}.name`) }))

  return (
    <div className="min-h-screen overflow-x-hidden bg-[hsl(75_8%_3%)] text-white selection:bg-lime/30">
      <LandingStyles />
      <PublicHeader />
      {/* La cabecera es `absolute` sobre el hero — este padding la despeja. */}
      <main className="pt-24 md:pt-28">{children}</main>
      <PublicFooter featureLinks={featureLinks} />
    </div>
  )
}
