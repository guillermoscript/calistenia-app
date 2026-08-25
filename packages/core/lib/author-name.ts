/**
 * El nombre con el que se acredita a una persona en pantalla.
 *
 * POR QUÉ HACEN FALTA LOS TRES CAMPOS
 * -----------------------------------
 * `display_name` es opcional y quien se da de alta con Google no lo tiene: el
 * proveedor rellena `name`, no `display_name`. Mirar solo `display_name` —que es
 * lo que hacía `created_by_name` en `usePrograms`— deja a esa gente sin nombre,
 * y la UI acaba pintando un hueco o un «?» donde debería ir su crédito.
 *
 * `email` cierra la cascada por si los dos anteriores están vacíos. No es una
 * fuga: para un tercero llega vacío igualmente (ver abajo), así que en la
 * práctica solo se usa cuando el que mira eres tú mismo.
 *
 * QUÉ SOBREVIVE A LA PRIVACIDAD POR CAMPO (#411)
 * ----------------------------------------------
 * `pb_hooks/users_field_privacy.pb.js` recorta la fila de `users` con una LISTA
 * BLANCA antes de serializarla, y eso incluye los `expand`. `display_name` y
 * `name` están dentro; el resto de columnas no `system` se esconden. `email` no lo
 * gobierna ese hook sino `emailVisibility` de PocketBase, que por defecto es
 * falso: a un tercero le llega como cadena vacía.
 *
 * O sea que esta cascada NO puede filtrar nada que el servidor no haya decidido
 * ya entregar. Si algún día se quita un campo de la lista blanca, aquí llegará
 * vacío y la cascada caerá al siguiente sola.
 *
 * DEVUELVE CADENA VACÍA, NUNCA `undefined`
 * ----------------------------------------
 * Para que quien llame pueda hacer `name || fallback` sin pensar. Devolver
 * `undefined` invita a interpolarlo en una plantilla y pintar «undefined» en
 * pantalla, que es peor que no pintar nada.
 */

/** Lo que queda de una fila de `users` después del recorte de #411. */
export interface AuthorLike {
  display_name?: unknown
  name?: unknown
  email?: unknown
}

/** El primer campo no vacío de la cascada, ya recortado. `''` si no hay ninguno. */
export function authorDisplayName(user: AuthorLike | null | undefined): string {
  if (!user) return ''
  // `trim()` porque un `display_name` de solo espacios pinta igual que uno vacío
  // pero no es falsy, y se comería el fallback sin que se notara.
  const candidates = [user.display_name, user.name, user.email]
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const trimmed = candidate.trim()
    if (trimmed) return trimmed
  }
  return ''
}
