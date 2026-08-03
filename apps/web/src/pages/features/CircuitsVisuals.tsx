/**
 * Visuales de `/features/circuits`.
 *
 * Son mocks HTML/SVG, no capturas ni componentes del producto. `CircuitView` y
 * `CircuitBuilder` viven dentro del shell autenticado y dependen de
 * `CircuitSessionContext`: esta página está antes del gate, así que aquí se
 * reconstruye el anillo desde cero.
 *
 * Los números NO son decorativos. Salen del producto y si allí cambian, esto
 * miente:
 * - 5 s de «prepárate», fijos → `apps/web/src/components/circuit/CircuitView.tsx:476-484`
 * - 40 s de trabajo y 20 s de descanso por defecto →
 *   `apps/web/src/components/circuit/CircuitBuilder.tsx:267-273`
 * - aviso a los 11 s, tics en el 4-3-2 y rojo por debajo de 10 s →
 *   `apps/web/src/components/circuit/CircuitView.tsx:110-137`
 *
 * El color: en el producto los circuitos son naranja
 * (`packages/core/lib/style-tokens.ts:26`), pero el sistema visual de las
 * páginas públicas es lima. Aquí se usa lima por coherencia con el resto de la
 * épica #279, y el copy nunca dice que sea «el color de los circuitos».
 * `text-lime` cambia de tono con el modo del usuario, así que en SVG va el
 * valor crudo, como ya hace `apps/web/src/components/landing/panels.tsx:167-176`.
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pause, Play } from 'lucide-react'
import { usePrefersReducedMotion } from '../../components/landing/shared'

/** Lima cruda: la clase `text-lime` cambia de tono con el tema del usuario. */
const LIME = 'hsl(74 90% 57%)'
/** El rojo de los últimos 10 s. Mismo papel que `--destructive` en el producto. */
const URGENT = 'hsl(0 72% 58%)'

const RING_SIZE = 180
const RING_R = 78
const RING_CIRC = 2 * Math.PI * RING_R

/** Las tres fases del ciclo, con la duración real que trae la app por defecto. */
const PHASES = [
  { key: 'demoPhaseReady', seconds: 5, color: LIME },
  { key: 'demoPhaseWork', seconds: 40, color: LIME },
  { key: 'demoPhaseRest', seconds: 20, color: URGENT },
] as const

function mmss(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * El anillo, sin nada de lógica: recibe los segundos que quedan y los pinta.
 * Lo comparten el panel del hero (estático) y la demo (viva).
 */
function Ring({ remaining, total, label, color }: { remaining: number; total: number; label: string; color: string }) {
  // Por debajo de 10 s el producto tiñe el anillo y el número de rojo.
  const urgent = remaining > 0 && remaining <= 10
  const stroke = urgent ? URGENT : color
  const pct = total > 0 ? remaining / total : 0

  return (
    <div className="relative" style={{ width: RING_SIZE, height: RING_SIZE }}>
      <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} className="-rotate-90">
        <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R} fill="none" stroke="hsl(0 0% 100% / .1)" strokeWidth="8" />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_R}
          fill="none"
          stroke={stroke}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={RING_CIRC}
          strokeDashoffset={RING_CIRC * (1 - pct)}
          style={{ transition: 'stroke-dashoffset .9s linear, stroke .3s' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-bebas text-5xl leading-none" style={{ color: urgent ? URGENT : undefined }}>
          {mmss(remaining)}
        </span>
        <span className="mt-1.5 font-mono text-[10px] tracking-[.2em]" style={{ color: stroke }}>{label}</span>
      </div>
    </div>
  )
}

/**
 * S1 · el hero. Estático a propósito: el que se mueve es el de S3, y dos
 * cronómetros corriendo en la misma página compiten entre ellos.
 */
export function RingPanel() {
  const { t } = useTranslation()
  const k = (s: string) => t(`feature.circuits.${s}`)

  return (
    <div
      role="img"
      aria-label={k('heroAlt')}
      className="grid w-full max-w-sm place-items-center border border-white/10 bg-[hsl(75_6%_6%)] px-6 py-10 shadow-2xl shadow-black/40"
    >
      <Ring remaining={18} total={40} label={k('demoPhaseWork')} color={LIME} />
      <p className="mt-7 font-mono text-[11px] tracking-[.14em] text-white/50">
        {t('circuit.roundOf', { current: 2, total: 3 })}
      </p>
      <p className="mt-1.5 font-mono text-[11px] tracking-[.14em] text-white/35">
        {t('circuit.nextUp', { name: k('mockExercise') })}
      </p>
    </div>
  )
}

/**
 * S3 · la demo, la sección que hace que esta página no sea la plantilla.
 *
 * Reglas que son criterios de aceptación de la issue #284, no matices:
 * - arranca PARADA (nada de reproducción automática),
 * - no suena NADA (los avisos sonoros se cuentan en la lista de al lado),
 * - se detiene al salir de pantalla — un `setInterval` corriendo mientras
 *   alguien lee el resto de la página es batería tirada,
 * - con `prefers-reduced-motion` no se anima: se pinta la fase de trabajo
 *   parada y el texto describe la secuencia.
 */
export function CircuitDemo() {
  const { t } = useTranslation()
  const k = (s: string) => t(`feature.circuits.${s}`)
  const reduced = usePrefersReducedMotion()

  const [playing, setPlaying] = useState(false)
  // Antes del primer play se enseña la fase de trabajo entera: es el fotograma
  // que explica la función. El ciclo, al darle, empieza por «prepárate».
  const [started, setStarted] = useState(false)
  // Fase y segundos en el mismo estado: al agotarse una fase hay que cambiar
  // las dos a la vez, y dos `useState` sueltos dejan un tick incoherente.
  const [clock, setClock] = useState<{ phase: number; remaining: number }>({ phase: 0, remaining: PHASES[0].seconds })
  const [inView, setInView] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Fuera de pantalla no hay reloj. Mismo umbral que `Reveal`.
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.2 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (reduced || !playing || !inView) return
    const id = setInterval(() => {
      setClock(({ phase, remaining }) => {
        if (remaining > 1) return { phase, remaining: remaining - 1 }
        // Fin de fase: se encadena la siguiente y el ciclo vuelve a empezar.
        const next = (phase + 1) % PHASES.length
        return { phase: next, remaining: PHASES[next].seconds }
      })
    }, 1000)
    return () => clearInterval(id)
  }, [reduced, playing, inView])

  // Con movimiento reducido —o antes del primer play— se pinta la fase de
  // trabajo, parada y entera.
  const poster = reduced || !started
  const current = poster ? PHASES[1] : PHASES[clock.phase]
  const shown = poster ? current.seconds : clock.remaining

  return (
    <div ref={ref} className="flex flex-col items-center gap-6 border border-white/10 bg-[hsl(75_6%_6%)] px-6 py-10">
      <div role="img" aria-label={k('demoAlt')}>
        <Ring remaining={shown} total={current.seconds} label={k(current.key)} color={current.color} />
      </div>

      <p className="font-mono text-[11px] tracking-[.14em] text-white/40">
        {t('circuit.roundOf', { current: 1, total: 3 })}
      </p>

      {reduced ? (
        <p className="max-w-xs text-center text-sm leading-relaxed text-white/60">{k('demoStatic')}</p>
      ) : (
        <button
          type="button"
          onClick={() => { setStarted(true); setPlaying(p => !p) }}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-5 py-2.5 text-sm font-semibold text-white/85 transition hover:border-white/50 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
        >
          {playing
            ? <><Pause className="h-4 w-4" aria-hidden="true" /> {k('demoPause')}</>
            : <><Play className="h-4 w-4" aria-hidden="true" /> {k('demoPlay')}</>}
        </button>
      )}
    </div>
  )
}

/**
 * S5 · el detalle de un circuito terminado, tal y como lo pinta
 * `apps/web/src/pages/CircuitSessionDetailPage.tsx:150-240`: badge de modo,
 * cuatro cifras, la lista de ejercicios y la configuración guardada.
 *
 * Va como mock y no como captura por la misma razón que en `/features/races`:
 * una captura real lleva encima el entrenamiento de alguien y un nombre propio.
 */
export function DetailMock() {
  const { t } = useTranslation()
  const k = (s: string) => t(`feature.circuits.${s}`)

  // Un cronometrado de 3 rondas con los tiempos por defecto: 5 ejercicios ×
  // (40 s + 20 s) + 60 s entre rondas = 360 s por ronda → 18 min.
  const stats: Array<[string, string]> = [
    [t('circuit.rounds'), '3 / 3'],
    [t('circuit.elapsed'), '18:24'],
    [t('circuit.exerciseList'), '5'],
  ]
  const exercises = [k('mockExercise'), k('mockExercise2'), k('mockExercise3')]
  const config: Array<[string, string]> = [
    [t('circuit.workTime'), '40 s'],
    [t('circuit.restTime'), '20 s'],
    [t('circuit.restBetweenRounds'), '60 s'],
  ]

  return (
    <div
      role="img"
      aria-label={k('shot1Alt')}
      className="w-full max-w-sm border border-white/10 bg-[hsl(75_6%_6%)] p-5 shadow-2xl shadow-black/40"
    >
      <p className="font-bebas text-2xl leading-none tracking-wide">{t('circuit.pageTitle')}</p>
      <span className="mt-2.5 inline-block border border-white/15 px-2 py-0.5 text-[9px] uppercase tracking-[.16em] text-white/50">
        {t('circuit.modes.timed')}
      </span>

      <div className="mt-4 grid grid-cols-3 gap-px bg-white/10">
        {stats.map(([label, value]) => (
          <div key={label} className="bg-[hsl(75_6%_6%)] px-3 py-3">
            <p className="text-[9px] uppercase tracking-[.14em] text-white/35">{label}</p>
            <p className="mt-1 font-bebas text-xl leading-none tracking-wide">{value}</p>
          </div>
        ))}
      </div>

      <ul className="mt-4 divide-y divide-white/8 border border-white/10">
        {exercises.map((name, i) => (
          <li key={name} className="flex items-center gap-3 px-3 py-2.5 text-xs text-white/70">
            <span className="w-4 text-center font-mono text-[10px] text-white/30">{i + 1}</span>
            <span className="flex-1">{name}</span>
            <span className="font-mono text-[10px] text-white/40">40 s</span>
          </li>
        ))}
      </ul>

      <dl className="mt-4 grid gap-1.5 text-xs">
        {config.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4">
            <dt className="text-white/45">{label}</dt>
            <dd className="font-mono text-[11px] text-white/75">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
