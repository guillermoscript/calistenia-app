/**
 * Piezas de la lista de ajustes del perfil.
 *
 * El rediseño (canvas 1d) baja los formularios de siempre a una lista de filas,
 * una por tema. Para que eso no sea «el formulario viejo metido en un cajón»,
 * lo que se despliega tiene lenguaje propio: fondo hundido que lo separa de la
 * lista, etiquetas mono en mayúsculas como el resto de la spec sheet, y los
 * mismos controles en todas partes (segmentado para elegir uno, píldora para
 * elegir varios) en vez de cuatro rejillas de botones ligeramente distintas.
 *
 * Viven en un fichero aparte, y a nivel de módulo, por dos razones: `ProfilePage`
 * ya era largo, y definir estos componentes dentro de su render los recrearía en
 * cada pulsación — React desmontaría el panel abierto y los `Input` de dentro
 * perderían el foco a cada letra.
 */
import * as React from 'react'

import { Input } from '../ui/input'
import { Kicker } from '../ui/kicker'
import { cn } from '../../lib/utils'

// ─── Fila y cajón ────────────────────────────────────────────────────────────

interface SettingsRowProps {
  label: string
  /** Resumen a la derecha: lo que hay guardado, sin tener que abrir. */
  value?: string
  /** Solo para las filas que despliegan; las que navegan no la pasan. */
  open?: boolean
  onClick: () => void
  children?: React.ReactNode
}

export function SettingsRow({ label, value, open = false, onClick, children }: SettingsRowProps) {
  const expandable = Boolean(children)
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onClick}
        aria-expanded={expandable ? open : undefined}
        className="group flex w-full items-center justify-between gap-3 py-3.5 text-left"
      >
        <span className={cn('text-[15px] transition-colors', open ? 'text-lime' : 'group-hover:text-lime')}>
          {label}
        </span>
        <span className="flex min-w-0 items-center gap-2">
          {value ? (
            <span className="truncate font-mono text-[11px] text-muted-foreground">{value}</span>
          ) : null}
          <svg
            className={cn(
              'size-4 shrink-0 transition-transform',
              open ? 'rotate-90 text-lime' : 'text-muted-foreground group-hover:text-lime',
            )}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
      </button>
      {open && expandable ? (
        // Sangra hasta el borde de la tarjeta: el cajón es un plano distinto de
        // la lista, no un bloque más dentro de la misma fila.
        <div className="-mx-4 border-t border-border bg-muted/40 px-4 py-5 md:-mx-5 md:px-5">
          <div className="flex flex-col gap-5">{children}</div>
        </div>
      ) : null}
    </div>
  )
}

// ─── Campos ──────────────────────────────────────────────────────────────────

/** Etiqueta de campo: mono en mayúsculas, como los rótulos de bloque. */
export function Field({ label, htmlFor, hint, children }: {
  label: string
  htmlFor?: string
  /** Nota corta bajo el control (unidades, consecuencias). */
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <Kicker as="span" size="xs" className={htmlFor ? undefined : 'cursor-default'}>
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}
      </Kicker>
      {children}
      {hint ? <p className="font-mono text-[9px] tracking-wide text-muted-foreground/70">{hint}</p> : null}
    </div>
  )
}

/** Input con la unidad fijada dentro, para que la etiqueta no tenga que decirla. */
export function UnitInput({ unit, className, ...props }: React.ComponentProps<typeof Input> & { unit?: string }) {
  return (
    <div className="relative">
      <Input className={cn('h-11', unit && 'pr-12', className)} {...props} />
      {unit ? (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {unit}
        </span>
      ) : null}
    </div>
  )
}

// ─── Controles ───────────────────────────────────────────────────────────────

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

/**
 * Elegir uno: pista hundida y la opción activa levantada en lima.
 *
 * Volver a pulsar la opción activa la limpia — varios de estos campos son
 * opcionales y sin eso no habría forma de dejarlos en blanco.
 */
export function Segmented<T extends string>({ options, value, onChange, columns, allowClear = true }: {
  options: readonly SegmentedOption<T>[]
  value: T | ''
  onChange: (next: T | '') => void
  /** Por defecto una fila; con muchas opciones largas conviene una rejilla. */
  columns?: 2
  /** `false` en los campos que siempre tienen que valer algo (nivel, idioma). */
  allowClear?: boolean
}) {
  return (
    <div className={cn('gap-1 rounded-lg bg-muted p-1', columns === 2 ? 'grid grid-cols-2' : 'flex')}>
      {options.map(opt => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active && allowClear ? '' : opt.value)}
            className={cn(
              // El borde transparente lo llevan todas para que marcar la activa
              // no desplace un píxel al resto.
              'rounded-md border border-transparent px-2 py-2.5 font-mono text-[10px] uppercase tracking-widest transition-colors',
              columns === 2 ? 'w-full' : 'flex-1',
              active
                ? 'border-lime/50 bg-background text-lime shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Elegir varios: misma píldora que las skills del carné, para que «activo» se
 * lea igual en toda la pantalla.
 */
export function ChipToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors',
        active
          ? 'border-lime/40 bg-lime/10 text-lime'
          : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
      )}
    >
      {label}
    </button>
  )
}

/** Casilla de día: cuadrada y compacta, siete en fila. */
export function DayToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-11 rounded-md border font-mono text-[10px] uppercase tracking-widest transition-colors',
        active
          ? 'border-lime/40 bg-lime/10 text-lime'
          : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
      )}
    >
      {label}
    </button>
  )
}
