import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Tercera pata del guardarraíl de i18n (issue #561).
//
// `usage.test.ts` (#444) comprueba que toda clave usada en `t('x')` EXISTE en
// los dos locales; `jsx-text.test.ts` (#484) caza copy en español escrito a
// pelo en el JSX. Ninguno mira el CONTENIDO de los valores: una clave que
// existe en `es` y en `en`, que se usa bien con `t()`, pasa las dos guardas
// aunque el valor español esté en inglés. Así llegaron a producción
// `"race.prsWins": "Wins"` o `"race.prsTitle": "Records de Race"` (#560).
//
// Dos heurísticas, en unión, sacadas del propio issue:
//
//   1. Valor IDÉNTICO en `es` y en `en`. Es la señal más exhaustiva pero la más
//      ruidosa: hoy hay ~175 claves así y la mayoría son correctas (`Cardio`,
//      `Core`, `Yoga`, `kcal`, `PR`, autores de citas…). Por eso se tokeniza el
//      valor y solo cuenta si ALGUNA palabra no está en `SHARED_WORDS`, la
//      lista de vocabulario que legítimamente no se traduce.
//
//   2. Valor de `es` que contiene una palabra inglesa frecuente en copy de
//      producto (`Wins`, `Finished`, `Loading`…). Menos exhaustiva, casi sin
//      falsos positivos, y no depende de que `en` coincida — habría cazado
//      `Records de Race` aunque el inglés dijese otra cosa.
//
// Ni la una ni la otra son un detector de idioma: son redes. Cada palabra que
// se cuele en una revisión se añade a `ENGLISH_WORDS`; cada préstamo legítimo
// que moleste se añade a `SHARED_WORDS`. Las dos listas son cortas a propósito.
//
// ## Baseline
//
// Lo que hay hoy se congela en `untranslated-baseline.json`: `exempt` es lo que
// no se va a traducir nunca (nombres propios), con su motivo; `pending` es la
// lista exacta de claves pendientes. El test falla si aparece una clave nueva,
// y también si una del baseline deja de ser candidata sin salir de la lista:
// el trinquete solo gira hacia abajo.

const LOCALES_DIR = path.dirname(fileURLToPath(import.meta.url))
const localeFile = (locale: string) => path.join(LOCALES_DIR, locale, 'translation.json')

// Solo lectura: el fichero de locale tiene líneas en blanco a propósito y
// nunca se reescribe desde un test.
const readLocale = (locale: string) =>
  JSON.parse(fs.readFileSync(localeFile(locale), 'utf8')) as Record<string, string>

const es = readLocale('es')
const en = readLocale('en')

// Vocabulario que se escribe igual en los dos idiomas: préstamos asentados en
// el gimnasio, siglas, unidades, marcas, palabras que existen en español con
// el mismo significado. Todo en minúsculas; la comparación ignora mayúsculas.
const SHARED_WORDS = new Set([
  // préstamos y disciplinas
  'cardio', 'core', 'yoga', 'tabata', 'emom', 'planche', 'muscle', 'up', 'ups', 'l', 'sit',
  'fitball', 'trx', 'kettlebell', 'snack', 'blog', 'coach', 'feedback', 'spam', 'whatsapp',
  // marcas y tiendas: la pregunta «¿cómo conociste la app?» (#586)
  'google', 'play', 'store', 'github',
  // «skills» es como se llaman en calistenia los movimientos que se desbloquean
  // (front lever, muscle up): nadie dice «habilidades» en el gimnasio.
  'skill', 'skills',
  'ranking', 'tutorial', 'online', 'offline', 'app', 'premium', 'pro', 'ok',
  // palabras que existen en español tal cual
  'error', 'no', 'total', 'normal', 'general', 'social', 'legal', 'lumbar', 'admin', 'editor',
  'email', 'info', 'extras', 'manual', 'balance', 'plan', 'gradual', 'diabetes', 'variable',
  'irregular', 'ideal', 'natural', 'personal', 'final', 'base', 'visible', 'simple',
  // unidades, siglas y abreviaturas
  'km', 'kg', 'g', 'm', 's', 'h', 'min', 'kcal', 'pts', 'reps', 'rep', 'pr', 'prs', 'rpe', 'dnf',
  'xp', 'r', 'imc', 'bpm', 'gps', 'ia', 'id', 'url', 'pdf', 'csv', 'json', 'qr', 'sms',
])

// Palabras inglesas que aparecen en copy de interfaz y que NO existen en
// español (ni como préstamo habitual). Cada una se ha contrastado contra el
// locale `es` actual para que no marque nada legítimo. Se buscan con los
// `{{placeholders}}` ya quitados: `{{max}}` o `{{day}}` no son copy.
const ENGLISH_WORDS = [
  // función — ninguna existe en español
  'the', 'and', 'with', 'without', 'your', 'you', 'for', 'from', 'this', 'that', 'are', 'is',
  'not', 'new', 'all', 'any', 'of', 'to', 'in', 'on', 'at', 'by', 'or', 'an', 'it', 'we',
  // verbos y estados de interfaz
  'wins', 'win', 'finished', 'finish', 'loading', 'saving', 'save', 'saved', 'cancel', 'delete',
  'remove', 'edit', 'create', 'search', 'share', 'start', 'stop', 'pause', 'resume', 'retry',
  'done', 'next', 'back', 'close', 'open', 'add', 'select', 'choose', 'continue', 'skip',
  'settings', 'profile', 'account', 'workout', 'workouts', 'session', 'sessions', 'exercise',
  'exercises', 'history', 'today', 'week', 'weekly', 'month', 'monthly', 'day', 'days', 'time',
  'minutes', 'seconds', 'hours', 'points', 'level', 'streak', 'goal', 'goals',
  'race', 'races', 'run', 'running', 'distance', 'pace', 'speed', 'friends',
  'challenges', 'battle', 'program', 'programs', 'routine', 'weight', 'water', 'sleep',
  // cuerpo y ejercicio
  'body', 'stretch', 'stretching', 'squat', 'squats', 'hip', 'glute', 'bridge', 'thoracic',
  'rotation', 'finisher', 'upper', 'lower', 'strength', 'mobility',
  // NO van aquí, aunque sean inglés, porque el copy en español los usa a
  // propósito como préstamo: push/pull/legs, records, challenge, splits,
  // handstand, skills, items, fix (de GPS), dashboard. Cuando el valor entero
  // está en inglés los caza igualmente la heurística de «idéntico a en».
]
const ENGLISH_WORDS_RE = new RegExp(
  `(^|[^\\p{L}])(${ENGLISH_WORDS.join('|')})([^\\p{L}]|$)`,
  'iu',
)

const stripPlaceholders = (value: string) => value.replace(/\{\{[^}]*\}\}/g, ' ')

/** Palabras del valor, sin `{{placeholders}}`, números ni puntuación. */
function words(value: string): string[] {
  return stripPlaceholders(value).toLowerCase().match(/\p{L}+/gu) ?? []
}

/** Motivo por el que la clave parece sin traducir, o `null` si no lo parece. */
function untranslatedReason(key: string): string | null {
  const value = es[key]
  if (!/\p{L}/u.test(value)) return null
  const english = stripPlaceholders(value).match(ENGLISH_WORDS_RE)
  if (english) return `palabra inglesa «${english[2]}»`
  if (key in en && en[key] === value) {
    const foreign = words(value).filter((w) => !SHARED_WORDS.has(w))
    if (foreign.length > 0) return `idéntico a en («${foreign[0]}» no está en SHARED_WORDS)`
  }
  return null
}

interface Baseline {
  exempt: Record<string, string>
  pending: string[]
}

const BASELINE_FILE = path.join(LOCALES_DIR, 'untranslated-baseline.json')
const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) as Baseline

const candidates = new Map<string, string>()
for (const key of Object.keys(es)) {
  const reason = untranslatedReason(key)
  if (reason) candidates.set(key, reason)
}

// Regenerar `pending` tras un barrido:
//   UPDATE_UNTRANSLATED_BASELINE=1 pnpm --filter @calistenia/core test untranslated
// `exempt` se conserva tal cual — esa lista se cura a mano.
if (process.env.UPDATE_UNTRANSLATED_BASELINE) {
  const pending = [...candidates.keys()].filter((key) => !(key in baseline.exempt)).sort()
  fs.writeFileSync(BASELINE_FILE, `${JSON.stringify({ ...baseline, pending }, null, 2)}\n`)
  baseline.pending = pending
}

const describeKey = (key: string) => `${key}: ${JSON.stringify(es[key])} — ${candidates.get(key)}`

describe('valores del locale es sin traducir', () => {
  it('el escaneo sigue vivo', () => {
    // Si las heurísticas dejan de encontrar nada, todo lo de abajo pasa en
    // vacío. El baseline es la prueba de vida: sabemos que esas claves están
    // pendientes mientras alguien no las traduzca (y entonces las borrará).
    expect(Object.keys(es).length).toBeGreaterThan(1000)
    expect(candidates.size).toBeGreaterThan(0)
  })

  it('las palabras inglesas de la lista no marcan copy legítimo por sí solas', () => {
    // Guarda contra ampliar ENGLISH_WORDS con algo que también es español
    // («no», «total»…): el baseline absorbería el ruido sin que nadie lo viera.
    const overlap = ENGLISH_WORDS.filter((w) => SHARED_WORDS.has(w))
    expect(overlap).toEqual([])
  })

  it('ninguna clave nueva tiene el valor en inglés', () => {
    const known = new Set([...Object.keys(baseline.exempt), ...baseline.pending])
    const offenders = [...candidates.keys()].filter((key) => !known.has(key)).map(describeKey)
    // Traduce el valor en locales/es/translation.json. Si es un préstamo o una
    // sigla que de verdad no se traduce, añade la palabra a SHARED_WORDS.
    expect(offenders).toEqual([])
  })

  it('el baseline no tiene entradas obsoletas', () => {
    const stale = [...baseline.pending, ...Object.keys(baseline.exempt)]
      .filter((key) => !candidates.has(key))
      .map((key) => `${key}: ya no parece sin traducir — bórralo del baseline`)
    expect(stale).toEqual([])
  })

  it('el baseline no repite claves entre exempt y pending', () => {
    const both = baseline.pending.filter((key) => key in baseline.exempt)
    expect(both).toEqual([])
    expect([...baseline.pending].sort()).toEqual(baseline.pending)
  })
})
