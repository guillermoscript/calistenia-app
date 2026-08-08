/**
 * Componentes disponibles dentro de los `.mdx` del blog.
 *
 * Se inyectan por la prop `components`, así que en el MDX se usan directamente
 * (`<Callout>…</Callout>`) sin importarlos en cada artículo.
 *
 * Lenguaje visual: el mismo brutalist-athletic de la landing —esquinas rectas,
 * filetes `white/10`, Bebas para los títulos, lima como único acento—. Nada de
 * tarjetas redondeadas con sombra: el cuerpo del artículo era una pila de cajas
 * idénticas que aplanaba la jerarquía y hacía ilegible la progresión.
 *
 * Los bloques propios llevan `not-prose` para escapar de @tailwindcss/typography.
 */
import type { ReactNode, AnchorHTMLAttributes, ImgHTMLAttributes, TableHTMLAttributes } from 'react'
import { Link } from 'react-router-dom'
import type { MDXComponents } from 'mdx/types'

/* ── Callout ──────────────────────────────────────────────────────────────── */

type CalloutVariant = 'tip' | 'warn' | 'note'

const CALLOUT_RULE: Record<CalloutVariant, string> = {
  tip: 'border-lime/70 text-lime',
  warn: 'border-amber-400/70 text-amber-300',
  note: 'border-white/25 text-white/50',
}

/** Filete lateral + eyebrow. Sin caja: un aside no debería competir con el texto. */
export function Callout({
  variant = 'note',
  title,
  children,
}: {
  variant?: CalloutVariant
  title?: string
  children: ReactNode
}) {
  const tone = CALLOUT_RULE[variant] ?? CALLOUT_RULE.note

  return (
    <aside className={`not-prose my-8 border-l-2 pl-5 ${tone.split(' ')[0]}`}>
      {title && (
        <p className={`text-[11px] font-semibold uppercase tracking-[.24em] ${tone.split(' ')[1]}`}>{title}</p>
      )}
      <div className="mt-2.5 space-y-3 text-[15px] leading-relaxed text-white/65 [&_strong]:font-semibold [&_strong]:text-white">
        {children}
      </div>
    </aside>
  )
}

/* ── Escalera de progresiones ─────────────────────────────────────────────── */

/**
 * Contenedor de la progresión: dibuja la línea vertical continua sobre la que
 * se apoyan los números. Es el recurso editorial propio del blog — la metáfora
 * de "escalera" del artículo, hecha visible.
 */
export function Ladder({ children }: { children: ReactNode }) {
  return (
    <div className="not-prose relative my-10 space-y-10 pl-16">
      <span
        aria-hidden="true"
        className="absolute bottom-4 left-[1.375rem] top-4 w-px bg-gradient-to-b from-lime/60 via-white/15 to-transparent"
      />
      {children}
    </div>
  )
}

/** Un escalón. Debe ir dentro de <Ladder>. */
export function ProgressionStep({
  n,
  title,
  goal,
  children,
}: {
  n: number
  title: string
  /** Criterio medible para pasar al siguiente escalón */
  goal?: string
  children: ReactNode
}) {
  return (
    <section className="relative">
      {/* El fondo sólido "perfora" la línea para que el número se apoye en ella */}
      <span
        aria-hidden="true"
        className="absolute -left-16 top-0 grid h-11 w-11 place-items-center border border-lime/40 bg-[hsl(75_8%_3%)] font-bebas text-2xl leading-none text-lime"
      >
        {n}
      </span>
      <h3 className="font-bebas text-2xl leading-none tracking-wide text-white">
        <span className="sr-only">Paso {n}: </span>
        {title}
      </h3>
      {goal && (
        <p className="mt-2.5 text-[11px] font-semibold uppercase tracking-[.16em] text-lime">{goal}</p>
      )}
      <div className="mt-3.5 space-y-3 text-[15px] leading-relaxed text-white/60 [&_strong]:font-semibold [&_strong]:text-white">
        {children}
      </div>
    </section>
  )
}

/* ── Otros bloques ────────────────────────────────────────────────────────── */

/** Enlace a un ejercicio real del catálogo (`packages/core/data/exercise-catalog.json`) */
export function ExerciseLink({ id, children }: { id: string; children: ReactNode }) {
  return (
    <Link
      to={`/exercises/${id}`}
      className="font-medium text-lime underline decoration-lime/30 underline-offset-[3px] transition hover:decoration-lime"
    >
      {children}
    </Link>
  )
}

/** Conclusiones: filetes arriba y abajo, sin caja */
export function KeyTakeaways({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="not-prose my-12 border-y border-white/12 py-8">
      <p className="text-[11px] font-semibold uppercase tracking-[.24em] text-lime">{title ?? 'En resumen'}</p>
      <div className="mt-5 text-[15px] leading-relaxed text-white/65 [&_li]:relative [&_li]:pl-5 [&_strong]:font-semibold [&_strong]:text-white [&_ul]:grid [&_ul]:gap-3 [&_ul]:list-none [&_ul]:pl-0 [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:top-[0.6em] [&_li]:before:h-1.5 [&_li]:before:w-1.5 [&_li]:before:bg-lime [&_li]:before:content-['']">
        {children}
      </div>
    </section>
  )
}

/* ── Overrides de elementos base ──────────────────────────────────────────── */

/** Los enlaces internos usan el router; los externos, `rel` seguro */
function MdxAnchor({ href = '', children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const isInternal = href.startsWith('/') && !href.startsWith('//')

  if (isInternal) {
    return (
      <Link to={href} {...rest}>
        {children}
      </Link>
    )
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
    </a>
  )
}

/** `src` y `alt` llegan de la sintaxis `![alt](src)` del MDX */
function MdxImage({ src, alt = '', ...rest }: ImgHTMLAttributes<HTMLImageElement>) {
  // Sin `src` el navegador pintaría el recuadro de imagen rota: mejor no pintar nada.
  if (!src) return null
  return <img src={src} alt={alt} loading="lazy" decoding="async" {...rest} />
}

/** Tabla editorial: filetes finos y cifras en mono. Scroll propio si no cabe. */
function MdxTable({ children, ...rest }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="not-prose my-8 overflow-x-auto">
      <table
        className="w-full border-collapse text-left text-sm [&_td]:border-t [&_td]:border-white/10 [&_td]:py-3 [&_td]:pr-6 [&_td]:text-white/65 [&_th]:pb-3 [&_th]:pr-6 [&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-[.16em] [&_th]:text-white/40"
        {...rest}
      >
        {children}
      </table>
    </div>
  )
}

export const mdxComponents: MDXComponents = {
  a: MdxAnchor,
  img: MdxImage,
  table: MdxTable,
  Callout,
  Ladder,
  ProgressionStep,
  ExerciseLink,
  KeyTakeaways,
}
