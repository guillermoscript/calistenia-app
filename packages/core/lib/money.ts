/**
 * Multimoneda con USD de referencia (F5 #174). CÓDIGO PURO.
 * Principio: price_total se guarda SIEMPRE en USD (moneda funcional); la
 * factura conserva su moneda original y la tasa usada AL MOMENTO de la compra.
 * Conversión en precisión completa — redondear solo al presentar (formatMoney).
 */

/** Monedas con soporte de primera clase en la UI (selector de Perfil). */
export const SUPPORTED_CURRENCIES = ['USD', 'VES', 'EUR'] as const

const CANON: Record<string, string> = {
  usd: 'USD', us$: 'USD', $: 'USD', dolar: 'USD', dolares: 'USD', dollar: 'USD',
  ves: 'VES', bs: 'VES', 'bs.': 'VES', bss: 'VES', bsd: 'VES', bsf: 'VES',
  bolivar: 'VES', bolivares: 'VES',
  eur: 'EUR', '€': 'EUR', euro: 'EUR', euros: 'EUR',
}

/**
 * Código canónico desde lo que venga del LLM/recibo ("Bs", "bs.", "€", "USD").
 * Desconocido → uppercase tal cual (se conserva, no se pierde info); null → null.
 */
export function canonCurrency(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const key = raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  if (key.length === 0) return null
  return CANON[key] ?? raw.trim().toUpperCase()
}

/** Símbolo/prefijo de display: USD→"$", VES→"Bs", EUR→"€", resto el código. */
export function currencySymbol(code: string | null | undefined): string {
  switch (code) {
    case 'USD': case null: case undefined: return '$'
    case 'VES': return 'Bs'
    case 'EUR': return '€'
    default: return code
  }
}

export interface ParseLocaleNumberOptions {
  /** Cota inferior inclusiva; por debajo se trata como inválido (null). */
  min?: number
}

/**
 * Lee un número escrito a mano en un input, aceptando la coma decimal (#468).
 *
 * Devuelve `null`, y no 0, cuando el campo está vacío o no es un número: en la
 * despensa "no he escrito nada" y "vale 0" son cosas distintas —un precio 0
 * borraría el precio real del item— y por eso el vacío nunca colapsa a cero.
 *
 * Estaba copiado como `parseNum` en ocho componentes de despensa entre las dos
 * apps; seis eran idénticos y dos (las listas de la compra) además rechazaban
 * los negativos, que aquí es `{ min: 0 }`.
 */
export function parseLocaleNumber(raw: string, options: ParseLocaleNumberOptions = {}): number | null {
  if (raw.trim() === '') return null
  const n = Number(raw.replace(',', '.'))
  if (!Number.isFinite(n)) return null
  if (options.min != null && n < options.min) return null
  return n
}

/**
 * Convierte a USD con la tasa "unidades de la moneda por 1 USD" (ej. VES 143.5).
 * Precisión completa. Tasa inválida (≤0/NaN) → null (nunca inventar dinero).
 */
export function toUSD(amount: number, rate: number): number | null {
  if (!Number.isFinite(amount) || !Number.isFinite(rate) || rate <= 0) return null
  return amount / rate
}
