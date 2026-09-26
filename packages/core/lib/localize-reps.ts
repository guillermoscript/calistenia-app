/**
 * localize-reps — el texto de `reps` de un programa, en el idioma de quien lo lee.
 *
 * `program_exercises.reps` es un campo `text` (no `{es, en}` como el nombre o la
 * nota) y los programas oficiales lo escriben en español: «10 por lado»,
 * «10-12 c/pierna», «30 s (15 s por brazo)» (#847). Cambiar el tipo del campo
 * obligaría a migrar el esquema y a tocar todos los editores; el vocabulario
 * es tan corto que basta traducirlo al pintarlo.
 *
 * Solo traduce: en español (o sin idioma) devuelve el texto tal cual, y un
 * texto que no reconoce pasa intacto. El dato guardado no cambia, así que
 * `inferTimerFromReps` y el historial siguen leyendo el original.
 */

const RULES: Array<[RegExp, string]> = [
  [/\b(?:c\/|por |cada )lado\b/gi, 'per side'],
  [/\b(?:c\/|por |cada )pierna\b/gi, 'per leg'],
  [/\b(?:c\/|por |cada )brazo\b/gi, 'per arm'],
  [/\b(?:c\/|por |cada )direcci[oó]n\b/gi, 'per direction'],
  [/\b(?:c\/|por |cada )posici[oó]n\b/gi, 'per position'],
  [/\bdescenso (\d+\s*s)\b/gi, '$1 lowering'],
  [/\brepeticiones\b/gi, 'reps'],
  [/\bnegativas\b/gi, 'negatives'],
  [/\bcada una\b/gi, 'each'],
  [/\bde intentos\b/gi, 'of attempts'],
  [/\bde bajada\b/gi, 'lowering'],
  [/\blibres\b/gi, 'free'],
  [/\b(\d+)\s*seg\b/gi, '$1 s'],
]

export function localizeReps(reps: string | null | undefined, locale: string | null | undefined): string {
  const text = reps ?? ''
  if (!text || !locale || locale.toLowerCase().startsWith('es')) return text
  // `\b` no reconoce la «c/» ni la «ó» como parte de palabra; se normaliza el
  // arranque de «c/» para que la regla case también pegada al número.
  let out = text.replace(/(\d)\s*c\//g, '$1 c/')
  for (const [re, en] of RULES) out = out.replace(re, en)
  return out
}
