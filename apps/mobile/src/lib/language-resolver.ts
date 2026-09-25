/**
 * Decide qué idioma usar al arrancar la app (#821).
 *
 * Aparte en un módulo propio, sin `expo-localization` ni `storage`, para
 * poder testearlo con vitest sin montar módulos nativos — `i18n.ts` sí los
 * importa (`getLocales`, `storage`) y eso rompe bajo el entorno node de los
 * tests de móvil (ver CLAUDE.md de `apps/mobile`).
 */
export type SupportedLanguage = 'es' | 'en'

/**
 * `deviceLang` es el código corto ISO 639-1 que devuelve
 * `getLocales()[0]?.languageCode` (`"es"`, `"pt"`, `"hi"`…, nunca `"pt-BR"`).
 * `saved` es el override que el usuario eligió a mano y quedó persistido
 * (`storage.getItem(LANG_KEY)`) — si existe, gana siempre, incluido alguien
 * que ya eligió español a mano antes de este cambio.
 *
 * Sin override: español SOLO si el dispositivo es realmente español
 * (`es`, o cualquier variante que empiece por `es`); cualquier otro idioma
 * (incluido `undefined`/desconocido) cae a inglés — el mercado
 * hispanohablante es minoritario entre los países con más usuarios que no
 * tienen el dispositivo en español (India, Alemania, Brasil, Indonesia…).
 */
export function resolveInitialLanguage(
  deviceLang: string | null | undefined,
  saved?: string | null,
): string {
  if (saved) return saved
  const fallback: SupportedLanguage = deviceLang?.toLowerCase().startsWith('es') ? 'es' : 'en'
  return fallback
}
