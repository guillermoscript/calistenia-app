/**
 * Visuales de `/features/progress`.
 *
 * Mock HTML/CSS, no captura. El hero necesita un mes entero con sus once
 * señales encima — reproducirlo con una imagen real obligaría a maquetar una
 * cuenta con entrenos, cardio, comidas, sueño, peso, medidas y fotos a la vez,
 * o a publicar el calendario de una persona real (peso, sueño y fotos
 * incluidos). Un mock evita las dos cosas, es nítido a cualquier ancho y no
 * envejece con el estilo de la app.
 *
 * ⚠️ No importa nada de `apps/web/src/pages/ProgressPage.tsx` (la pantalla de
 * producto), ni de `useProgress`, `monthActivity` o `components/progress/*`:
 * esos asumen sesión y arrastran Recharts, que no pinta nada en el bundle de
 * marketing.
 *
 * Los once colores del mock son literales y copiados de
 * `apps/web/src/pages/CalendarPage.tsx:296-312` — el mismo orden que usa la
 * app real (entrenamiento, sesión libre, cardio, circuito, comidas, agua,
 * sueño, peso, medidas, fotos, chequeo lumbar). Los días con puntos son un
 * patrón inventado: ningún número sale de un usuario real.
 */
import { useTranslation } from 'react-i18next'

/**
 * Punto de color por señal, mismo orden que las claves `feature.progress.calNSignal`
 * (N = índice + 1) y que la leyenda del calendario real. Clases literales:
 * Tailwind purga lo que no ve compuesto en el fuente.
 */
const DOT_COLORS = [
  'bg-lime',
  'bg-violet-400',
  'bg-sky-400',
  'bg-orange-500',
  'bg-amber-400',
  'bg-cyan-400',
  'bg-indigo-400',
  'bg-rose-400',
  'bg-teal-400',
  'bg-fuchsia-400',
  'bg-emerald-400',
] as const

/**
 * Iniciales de día, lunes primero — igual que la rejilla real
 * (`CalendarPage.tsx:16-25,55`). Se reutilizan las claves `dayShort.N` del
 * producto en vez de duplicarlas bajo `feature.progress.*`.
 */
const DOW_KEYS = [0, 1, 2, 3, 4, 5, 6] as const

/**
 * Puntos por día del mock (mes de 30 días). Cada valor es un índice de
 * `DOT_COLORS`; como mucho tres por día, igual que el tope real
 * (`CalendarPage.tsx:296` recorta a `.slice(0, 3)`).
 */
const DAY_DOTS: Record<number, number[]> = {
  1: [0],
  2: [0, 4],
  3: [0, 4, 5],
  5: [0],
  6: [1],
  8: [0, 4, 6],
  9: [0, 4],
  10: [4, 5],
  12: [0, 3],
  13: [0, 4, 7],
  15: [2],
  16: [0, 4],
  17: [0, 4, 6],
  19: [8],
  20: [0, 4, 9],
  22: [0],
  23: [0, 4, 5],
  24: [10],
  26: [0, 4],
  27: [0, 4, 6],
  29: [0, 4],
  30: [0, 4, 5],
}

const MONTH_DAYS = Array.from({ length: 30 }, (_, i) => i + 1)

/**
 * Hero: un mes entero con sus once señales. Mini-calendario de 30 días (lunes
 * primero, como la rejilla real) con hasta tres puntos de color por día, y la
 * leyenda completa debajo.
 */
export function MonthDotsPanel() {
  const { t } = useTranslation()
  return (
    <div
      role="img"
      aria-label={t('feature.progress.heroAlt')}
      className="w-full max-w-sm border border-white/10 bg-[hsl(75_6%_6%)] shadow-2xl shadow-black/40"
    >
      <div className="grid grid-cols-7 gap-1 px-5 py-5">
        {DOW_KEYS.map(i => (
          <span key={i} className="text-center text-[9px] font-semibold uppercase tracking-wide text-white/35">
            {t(`dayShort.${i}`)}
          </span>
        ))}
        {MONTH_DAYS.map((day) => {
          const dots = DAY_DOTS[day] ?? []
          return (
            <div
              key={day}
              className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-sm ${dots.length ? 'bg-white/[.05]' : ''}`}
            >
              <span className="font-mono text-[10px] text-white/50">{day}</span>
              {dots.length ? (
                <span className="flex gap-0.5" aria-hidden="true">
                  {dots.map((colorIdx, i) => (
                    <span key={i} className={`size-1 rounded-full ${DOT_COLORS[colorIdx]}`} />
                  ))}
                </span>
              ) : (
                <span className="h-1" aria-hidden="true" />
              )}
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-white/10 px-5 py-4">
        {DOT_COLORS.map((color, i) => (
          <div key={color} className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${color}`} />
            <span className="truncate text-[10px] text-white/55">{t(`feature.progress.cal${i + 1}Signal`)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
