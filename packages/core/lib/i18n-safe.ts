import i18n from 'i18next'

/**
 * `i18n.t()` que nunca devuelve `undefined`.
 *
 * `packages/core` importa `i18next` directamente en una docena de módulos, pero
 * la instancia que inicializa cada app (`apps/web/src/lib/i18n.ts`,
 * `apps/mobile/src/lib/i18n.ts`) puede NO ser la misma que ve core:
 *
 *  - pnpm resuelve `i18next` por peer de TypeScript, y `packages/core` (TS
 *    6.0.3) y `apps/web` (TS 5.9.3) enlazan copias distintas. En la copia de
 *    core `init()` no se llama nunca, y una instancia sin inicializar devuelve
 *    **`undefined`** en `t()` — no la clave, `undefined`. Así es como una sesión
 *    libre acababa en el muro de la web con el título vacío.
 *  - `mcp-server` importa helpers de core desde Node, sin i18n de ninguna clase.
 *  - un módulo que llama a `t()` en tiempo de carga se evalúa antes del `init()`
 *    de la app aunque la instancia sea la correcta.
 *
 * `apps/web/vite.config.js` deduplica `i18next` para atacar la causa; esto es el
 * cinturón: cualquier cadena que llegue al usuario pasa por aquí con un texto de
 * respaldo, de modo que el peor caso es "sin traducir", nunca "vacío".
 */
export function tr(key: string, fallback: string, options?: Record<string, unknown>): string {
  try {
    const value = i18n.t(key, options) as unknown
    // Una instancia sin init devuelve undefined; una con la clave ausente
    // devuelve la propia clave. Ninguna de las dos es texto para un humano.
    if (typeof value === 'string' && value !== '' && value !== key) return value
  } catch {
    /* i18next sin inicializar o ausente */
  }
  return fallback
}

/** Idioma activo con respaldo, para `localize()` y formateadores de Intl. */
export function currentLanguage(): string {
  try {
    return i18n.language || 'es'
  } catch {
    return 'es'
  }
}
