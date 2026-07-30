/**
 * Primitivas de sección para las páginas propias de `/features/:slug`.
 *
 * Todas las páginas de la épica #279 se construyen con estos bloques para que
 * nueve páginas distintas sigan pareciendo el mismo sitio. Si una página
 * necesita algo nuevo, se añade aquí — nunca un fichero paralelo.
 *
 * Reglas que conviene no romper:
 * - `Reveal` renderiza un `<div>`: envuelve la tabla o la lista completa, nunca
 *   un `<tr>`, `<li>` o `<dt>`.
 * - Las tablas llevan su propio `overflow-x-auto`; el `overflow-x-hidden` del
 *   contenedor de página oculta el síntoma pero no arregla la tabla.
 * - Nada de clases de Tailwind compuestas en runtime: el purge se las come.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Check, Minus, RotateCcw } from 'lucide-react'
import { Eyebrow, Reveal, usePrefersReducedMotion } from './shared'

/** Enlace de vuelta al índice, en la parte alta del hero de cada página. */
export function BackToFeatures() {
  const { t } = useTranslation()
  return (
    <Link
      to="/features"
      className="landing-rise inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-white/45 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> {t('feature.allFeatures')}
    </Link>
  )
}

export function SectionHeader({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return (
    <Reveal>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-5 max-w-3xl font-bebas text-5xl leading-[.88] tracking-tight sm:text-6xl">{title}</h2>
      {lead ? <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/60">{lead}</p> : null}
    </Reveal>
  )
}

/**
 * Tabla de datos con scroll propio. `rows` son celdas ya renderizadas: la
 * primera columna se pinta destacada porque siempre es el nombre de la fila.
 *
 * `dots` es opcional y va en paralelo a `rows`: cada entrada es la clase de
 * Tailwind del punto de color que precede a la primera celda de esa fila
 * (`/features/progress` la usa para reproducir la leyenda del calendario).
 * Las clases se escriben literales en quien llama, nunca compuestas en
 * runtime, porque Tailwind purga lo que no ve en el fuente.
 */
export function SpecTable({ columns, rows, dots }: { columns: string[]; rows: ReactNode[][]; dots?: Array<string | undefined> }) {
  return (
    <Reveal className="mt-12">
      <div className="overflow-x-auto border border-white/10">
        <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-white/15 bg-white/[.03]">
              {columns.map(col => (
                <th key={col} scope="col" className="px-5 py-4 text-[11px] font-semibold uppercase tracking-[.16em] text-white/45">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-white/8 last:border-0 align-top">
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className={j === 0 ? 'px-5 py-5 font-semibold text-white/90' : 'px-5 py-5 leading-relaxed text-white/60'}
                  >
                    {j === 0 && dots?.[i] ? (
                      <span className="flex items-start gap-2.5">
                        <span aria-hidden="true" className={`mt-[.45rem] size-2 shrink-0 rounded-full ${dots[i]}`} />
                        <span>{cell}</span>
                      </span>
                    ) : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Reveal>
  )
}

/**
 * Tabla de paridad web / Android / iOS. Cada celda lleva su texto para lectores
 * de pantalla: un ✓ suelto no dice nada sin la cabecera.
 */
export function PlatformTable({ rows }: { rows: Array<{ label: string; web: boolean; android: boolean; ios: boolean }> }) {
  const { t } = useTranslation()
  const platforms: Array<['web' | 'android' | 'ios', string]> = [['web', 'Web'], ['android', 'Android'], ['ios', 'iOS']]

  return (
    <Reveal className="mt-12">
      <div className="overflow-x-auto border border-white/10">
        <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-white/15 bg-white/[.03]">
              <th scope="col" className="px-5 py-4 text-[11px] font-semibold uppercase tracking-[.16em] text-white/45">
                {t('feature.platformCol')}
              </th>
              {platforms.map(([key, label]) => (
                <th key={key} scope="col" className="w-24 px-5 py-4 text-center text-[11px] font-semibold uppercase tracking-[.16em] text-white/45">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.label} className="border-b border-white/8 last:border-0">
                <th scope="row" className="px-5 py-4 text-left font-normal leading-relaxed text-white/80">{row.label}</th>
                {platforms.map(([key]) => (
                  <td key={key} className="px-5 py-4 text-center">
                    {row[key] ? (
                      <>
                        <Check aria-hidden="true" className="mx-auto h-4 w-4 text-lime" />
                        <span className="sr-only">{t('feature.platformYes')}</span>
                      </>
                    ) : (
                      <>
                        <Minus aria-hidden="true" className="mx-auto h-4 w-4 text-white/25" />
                        <span className="sr-only">{t('feature.platformNo')}</span>
                      </>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Reveal>
  )
}

/**
 * Recorrido corto de N pasos en horizontal, para «cómo se empieza». Sin
 * visuales: cuando cada paso merece una pantalla, lo que toca es `Walkthrough`.
 *
 * Con `loopLabel` el recorrido se dibuja como ciclo: tres columnas —para que
 * cinco pasos quepan en dos filas— y una última celda con la vuelta al primero.
 * Esa celda es la que cierra el círculo y, de paso, tapa el hueco que dejaría
 * un quinto paso en una rejilla de seis: no lleva número porque no es un paso.
 */
export function StepFlow({ items, loopLabel }: { items: Array<{ title: string; desc: string }>; loopLabel?: string }) {
  return (
    <Reveal className="mt-12">
      <ol className={`grid gap-px bg-white/10 sm:grid-cols-2 ${loopLabel ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
        {items.map((item, i) => (
          <li key={item.title} className="flex flex-col bg-[hsl(75_8%_3%)] p-6">
            <span className="font-mono text-xs text-lime">0{i + 1}</span>
            <h3 className="mt-4 font-bebas text-2xl leading-tight tracking-wide">{item.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-white/60">{item.desc}</p>
          </li>
        ))}
        {loopLabel ? (
          <li className="flex items-center justify-center gap-3 bg-[hsl(75_8%_3%)] p-6 text-center">
            <RotateCcw aria-hidden="true" className="h-5 w-5 shrink-0 text-lime" />
            <span className="font-bebas text-xl tracking-[.1em] text-lime">{loopLabel}</span>
          </li>
        ) : null}
      </ol>
    </Reveal>
  )
}

/**
 * Rejilla de tarjetas para los argumentos que no son un recorrido ni una tabla:
 * ideas del mismo peso, cada una con su título y su párrafo.
 *
 * `cols` solo admite 3 (por defecto) o 4, y las dos clases se escriben literales
 * porque Tailwind purga lo que se compone en runtime. Con 4 ideas la rejilla de
 * tres dejaría una tarjeta huérfana en la segunda fila.
 */
export function CardGrid({ items, cols = 3 }: { items: Array<{ title: string; desc: string }>; cols?: 3 | 4 }) {
  return (
    <Reveal className="mt-12">
      <div className={`grid gap-px bg-white/10 ${cols === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-3'}`}>
        {items.map(item => (
          <div key={item.title} className="flex flex-col bg-[hsl(75_8%_3%)] p-6">
            <h3 className="font-bebas text-2xl leading-tight tracking-wide">{item.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-white/60">{item.desc}</p>
          </div>
        ))}
      </div>
    </Reveal>
  )
}

/**
 * Recorrido vertical de una máquina de estados: cada paso lleva su badge de
 * fase, lo que se ve y lo que se puede hacer. El raíl es decorativo — la
 * semántica la pone la lista ordenada.
 */
export function StateWalkthrough({ items }: {
  // `desc`/`actions` son `ReactNode` para que un paso pueda llevar un enlace
  // interno en prosa. `title` sigue siendo `string`: es la key de la lista.
  items: Array<{ badge: string; title: string; desc: ReactNode; actions: ReactNode; visual?: ReactNode }>
}) {
  return (
    <ol className="mt-14 grid gap-12">
      {items.map((item, i) => (
        // El raíl vive en el `<li>`, fuera del `Reveal`: es decorativo y así el
        // tramo llega hasta el paso siguiente sea cual sea la altura del visual.
        // `Reveal` renderiza un `<div>`, por eso va dentro del `<li>` y no fuera.
        <li key={item.title} className="relative pl-10">
          <span aria-hidden="true" className="absolute left-[7px] top-2 h-2.5 w-2.5 rounded-full bg-lime" />
          {i < items.length - 1 ? (
            <span aria-hidden="true" className="absolute -bottom-12 left-[11px] top-6 w-px bg-gradient-to-b from-lime/40 to-white/5" />
          ) : null}
          <Reveal delay={i * 50}>
            {/* `items-start`: el badge tiene que quedar a la altura de su punto del raíl */}
            <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-start">
              <div>
                <span className="inline-block border border-lime/30 bg-lime/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.16em] text-lime">
                  {item.badge}
                </span>
                <h3 className="mt-4 font-bebas text-3xl leading-tight tracking-wide sm:text-4xl">{item.title}</h3>
                <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/60">{item.desc}</p>
                <p className="mt-4 max-w-xl font-mono text-xs leading-relaxed text-white/40">{item.actions}</p>
              </div>
              {item.visual ? <div className="flex justify-center lg:justify-end">{item.visual}</div> : null}
            </div>
          </Reveal>
        </li>
      ))}
    </ol>
  )
}

/** Recorrido de N pasos, cada uno con su visual. La sección «no plantilla». */
export function Walkthrough({ items }: { items: Array<{ label: string; title: string; desc: string; visual: ReactNode }> }) {
  return (
    <div className="mt-14 grid gap-14">
      {items.map((item, i) => (
        <Reveal key={item.title} delay={i * 60}>
          <div className={`grid items-center gap-10 lg:grid-cols-2 ${i % 2 === 1 ? 'lg:[&>*:first-child]:order-2' : ''}`}>
            <div>
              <span className="font-mono text-xs text-lime">0{i + 1} · {item.label}</span>
              <h3 className="mt-4 font-bebas text-3xl leading-tight tracking-wide sm:text-4xl">{item.title}</h3>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-white/60">{item.desc}</p>
            </div>
            <div className="flex justify-center">{item.visual}</div>
          </div>
        </Reveal>
      ))}
    </div>
  )
}

/**
 * Marco de teléfono para los mocks de pantalla nativa. Mismo lenguaje que
 * `HeroPhone` de la landing, pero reutilizable y sin contenido propio.
 */
export function PhoneFrame({ children, width = 300, float = false, floatDelay = '0s' }: {
  children: ReactNode
  width?: number
  float?: boolean
  floatDelay?: string
}) {
  const reduced = usePrefersReducedMotion()
  const animate = float && !reduced
  return (
    <div
      className={`relative rounded-[2.4rem] border border-white/15 bg-[hsl(75_6%_7%)] p-2.5 shadow-[0_40px_80px_-20px_rgba(0,0,0,.8)] ${animate ? 'landing-float' : ''}`}
      style={{ width, animationDelay: animate ? floatDelay : undefined }}
    >
      <div className="overflow-hidden rounded-[1.9rem] bg-[hsl(75_8%_4%)]">
        <div className="flex justify-center pt-2.5"><span className="h-1.5 w-16 rounded-full bg-white/10" /></div>
        {children}
      </div>
    </div>
  )
}

/** Captura del producto con su pie. `priority` para la del hero (sin lazy). */
export function Shot({ src, alt, caption, width, height, priority = false }: {
  src: string
  alt: string
  caption?: string
  width: number
  height: number
  priority?: boolean
}) {
  return (
    <figure className="w-full">
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        className="w-full rounded-lg border border-white/10 bg-[hsl(75_6%_6%)]"
      />
      {caption ? <figcaption className="mt-3 text-xs leading-relaxed text-white/40">{caption}</figcaption> : null}
    </figure>
  )
}

/** Bloque de «esto todavía no»: el límite honesto, visible y sin disfraz. */
export function LimitNote({ children }: { children: ReactNode }) {
  return (
    <Reveal className="mt-10">
      <div className="border-l-2 border-amber-400/60 bg-amber-400/[.06] px-5 py-4 text-sm leading-relaxed text-white/65">
        {children}
      </div>
    </Reveal>
  )
}

export interface FaqItem { q: string; a: ReactNode }

export function FaqBlock({ items }: { items: FaqItem[] }) {
  return (
    <Reveal delay={110}>
      <dl className="border-t border-white/15">
        {items.map(item => (
          <div key={item.q} className="border-b border-white/15 py-6">
            <dt className="flex gap-3 text-base font-semibold text-white/90">
              <Check className="mt-1 h-4 w-4 shrink-0 text-lime" />
              {item.q}
            </dt>
            <dd className="mt-3 pl-7 text-sm leading-relaxed text-white/60">{item.a}</dd>
          </div>
        ))}
      </dl>
    </Reveal>
  )
}

/**
 * JSON-LD de FAQPage. Recibe las respuestas en texto plano (no el nodo React
 * de `FaqBlock`) porque schema.org quiere una cadena, no marcado.
 */
export function FaqJsonLd({ items }: { items: Array<{ q: string; a: string }> }) {
  const json = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(item => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  })
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
}
