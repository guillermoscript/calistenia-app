/**
 * Fake `CanvasRenderingContext2D` + `HTMLCanvasElement` that record every
 * method call and property assignment into a flat string "op log" — the
 * deterministic fixture golden-regression tests diff against.
 *
 * See `CardioShareCard.golden.test.tsx` / `RaceShareCard.golden.test.tsx`.
 */

/** Format a value for the op log. Numbers are rounded to 3 decimals (and
 * printed without trailing zeros) to avoid float noise across machines;
 * strings are printed verbatim; objects (gradients) use their own
 * `toString()`. */
function fmt(value: unknown): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return String(value)
    return String(Number(value.toFixed(3)))
  }
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return String(value)
  if (typeof value === 'boolean') return String(value)
  // Objects (gradients) format themselves via a custom toString().
  return String(value)
}

interface GradientStop {
  offset: number
  color: string
}

/**
 * Fake `CanvasGradient`. Stringifies to a stable tag encoding the
 * constructor args and every stop added so far — formatted LAZILY, at
 * `toString()` time, so a gradient assigned to `fillStyle`/`strokeStyle`
 * AFTER its stops were added (the order used throughout both share cards)
 * captures the full stop list.
 *
 * If a gradient is ever formatted BEFORE all its stops are added, later
 * `addColorStop` calls append a `gradient stops …` line to `ops` so that
 * information is never silently lost, even though the tag already recorded
 * in an earlier `set fillStyle = …` line can't be rewritten in place.
 */
function makeGradient(kind: 'linear' | 'radial', args: number[], id: string, ops: string[]) {
  const stops: GradientStop[] = []
  let formatted = false

  const tag = () => {
    const stopsStr = stops.map(s => `${fmt(s.offset)}:${s.color}`).join(' ')
    return `gradient(${kind},${args.map(fmt).join(',')})[${stopsStr}]`
  }

  return {
    __gradientId: id,
    addColorStop(offset: number, color: string) {
      stops.push({ offset, color })
      if (formatted) {
        ops.push(`gradient stops ${id} += ${fmt(offset)}:${color}`)
      }
    },
    toString() {
      formatted = true
      return tag()
    },
  }
}

export interface CanvasRecorder {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  ops: string[]
}

/** Canvas 2D context properties that default to something other than `undefined`. */
const DEFAULT_PROP_STATE: Record<string, unknown> = {
  fillStyle: '#000000',
  strokeStyle: '#000000',
  lineWidth: 1,
  globalAlpha: 1,
  letterSpacing: '0px',
  font: '',
  textAlign: 'left',
  textBaseline: 'alphabetic',
  lineJoin: 'miter',
  lineCap: 'butt',
}

/**
 * Create a fake canvas + 2D context that records every interaction as a flat
 * string in `ops`, in call order — deterministic and free of float noise.
 */
export function createCanvasRecorder(): CanvasRecorder {
  const ops: string[] = []
  let gradientCounter = 0

  const propState: Record<string, unknown> = { ...DEFAULT_PROP_STATE }

  const ctx = new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== 'string') return undefined

        // Deterministic text metrics — real font metrics vary by machine, so
        // this is stubbed instead of recorded as a plain call.
        if (prop === 'measureText') {
          return (text: string) => ({ width: text.length * 6 })
        }

        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
          return (...args: number[]) => {
            ops.push(`call ${prop}(${args.map(fmt).join(', ')})`)
            gradientCounter += 1
            const kind = prop === 'createLinearGradient' ? 'linear' : 'radial'
            return makeGradient(kind, args, `gradient#${gradientCounter}`, ops)
          }
        }

        // The image argument is never serialized — only its position/size args are.
        if (prop === 'drawImage') {
          return (_img: unknown, ...rest: number[]) => {
            ops.push(`call drawImage(<image>, ${rest.map(fmt).join(', ')})`)
          }
        }

        if (prop in propState) {
          return propState[prop]
        }

        // Any other property access is a method call.
        return (...args: unknown[]) => {
          ops.push(`call ${prop}(${args.map(fmt).join(', ')})`)
        }
      },
      set(_target, prop, value) {
        if (typeof prop !== 'string') return true
        propState[prop] = value
        ops.push(`set ${prop} = ${fmt(value)}`)
        return true
      },
    },
  ) as unknown as CanvasRenderingContext2D

  let width = 300
  let height = 150
  const canvas = {
    getContext: (_type?: string) => ctx,
    toDataURL: () => 'data:image/png;base64,',
    toBlob: (cb: (blob: Blob | null) => void) => cb(null),
  } as unknown as HTMLCanvasElement

  Object.defineProperty(canvas, 'width', {
    get: () => width,
    set: (v: number) => {
      width = v
      ops.push(`set canvas.width = ${fmt(v)}`)
    },
    enumerable: true,
    configurable: true,
  })
  Object.defineProperty(canvas, 'height', {
    get: () => height,
    set: (v: number) => {
      height = v
      ops.push(`set canvas.height = ${fmt(v)}`)
    },
    enumerable: true,
    configurable: true,
  })

  return { canvas, ctx, ops }
}
