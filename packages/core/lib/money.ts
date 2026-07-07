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

/**
 * Convierte a USD con la tasa "unidades de la moneda por 1 USD" (ej. VES 143.5).
 * Precisión completa. Tasa inválida (≤0/NaN) → null (nunca inventar dinero).
 */
export function toUSD(amount: number, rate: number): number | null {
  if (!Number.isFinite(amount) || !Number.isFinite(rate) || rate <= 0) return null
  return amount / rate
}
