/**
 * Formulario de perfil: reducer del estado editable + el I/O que web y móvil
 * duplicaban línea por línea (#478).
 *
 * Dos piezas separadas a propósito:
 *
 * - `useProfileForm` es estado LOCAL de formulario (16 campos que se hidratan
 *   juntos y se envían juntos). Por eso es un `useReducer` y no react-query:
 *   no hay nada que cachear ni invalidar mientras el usuario teclea.
 * - `fetchProfileBody` / `saveBodyDemographics` / `bodyUserPatch` son el I/O de
 *   composición corporal, que estaba copiado en `apps/web/src/pages/ProfilePage.tsx`
 *   y en `apps/mobile/src/app/(tabs)/profile.tsx`.
 *
 * Lo que NO se unifica: el `users.update` completo. Web guarda los 12 campos de
 * una vez con un solo botón; móvil los parte en dos guardados independientes
 * (nombre / cuerpo). Son dos UX distintas y unificarlas sería un cambio de
 * comportamiento, así que cada app compone su propio update y solo comparte el
 * trozo de cuerpo vía `bodyUserPatch`.
 */
import { useCallback, useReducer } from 'react'
import { pb } from '../lib/pocketbase'
import { parseDecimal } from '../lib/bmi'
import type {
  ActivityLevel, ConditionId, DayId, FocusAreaId, InjuryId, Intensity, Pace,
} from '../types/onboarding'

export interface ProfileFormState {
  displayName: string
  weight: string
  height: string
  /** PII: vive en `nutrition_goals`, no en `users`. Ver `fetchProfileBody`. */
  age: string
  /** PII: vive en `nutrition_goals`, no en `users`. Ver `fetchProfileBody`. */
  sex: string
  level: string
  goal: string
  goalWeight: string
  activityLevel: ActivityLevel | ''
  pace: Pace | ''
  medicalConditions: ConditionId[]
  injuries: InjuryId[]
  focusAreas: FocusAreaId[]
  trainingDays: DayId[]
  intensity: Intensity | ''
  timezone: string
}

/** Campos que son listas y por tanto admiten `toggle`. */
type ListField = {
  [K in keyof ProfileFormState]: ProfileFormState[K] extends readonly unknown[] ? K : never
}[keyof ProfileFormState]

export type ProfileFormAction =
  | { [K in keyof ProfileFormState]: { type: 'set'; field: K; value: ProfileFormState[K] } }[keyof ProfileFormState]
  | { [K in ListField]: { type: 'toggle'; field: K; item: ProfileFormState[K][number] } }[ListField]
  | { type: 'hydrate'; values: Partial<ProfileFormState> }

export const EMPTY_PROFILE_FORM: ProfileFormState = {
  displayName: '',
  weight: '',
  height: '',
  age: '',
  sex: '',
  level: 'principiante',
  goal: '',
  goalWeight: '',
  activityLevel: '',
  pace: '',
  medicalConditions: [],
  injuries: [],
  focusAreas: [],
  trainingDays: [],
  intensity: '',
  timezone: '',
}

export function profileFormReducer(state: ProfileFormState, action: ProfileFormAction): ProfileFormState {
  switch (action.type) {
    case 'set':
      return { ...state, [action.field]: action.value }
    case 'toggle': {
      const list = state[action.field] as readonly string[]
      const next = list.includes(action.item as string)
        ? list.filter(x => x !== action.item)
        : [...list, action.item]
      return { ...state, [action.field]: next }
    }
    case 'hydrate':
      return { ...state, ...action.values }
    default:
      return state
  }
}

export interface UseProfileFormReturn {
  form: ProfileFormState
  /** Fija un campo. Equivale al `setX(v)` que había antes por campo. */
  set: <K extends keyof ProfileFormState>(field: K, value: ProfileFormState[K]) => void
  /** Añade o quita un elemento de un campo lista (condiciones, lesiones, áreas, días). */
  toggle: <K extends ListField>(field: K, item: ProfileFormState[K][number]) => void
  /** Vuelca de golpe lo que llega del servidor. */
  hydrate: (values: Partial<ProfileFormState>) => void
  dispatch: React.Dispatch<ProfileFormAction>
}

export function useProfileForm(initial?: Partial<ProfileFormState>): UseProfileFormReturn {
  const [form, dispatch] = useReducer(
    profileFormReducer,
    initial ? { ...EMPTY_PROFILE_FORM, ...initial } : EMPTY_PROFILE_FORM,
  )

  const set = useCallback(<K extends keyof ProfileFormState>(field: K, value: ProfileFormState[K]) => {
    dispatch({ type: 'set', field, value } as ProfileFormAction)
  }, [])

  const toggle = useCallback(<K extends ListField>(field: K, item: ProfileFormState[K][number]) => {
    dispatch({ type: 'toggle', field, item } as ProfileFormAction)
  }, [])

  const hydrate = useCallback((values: Partial<ProfileFormState>) => {
    dispatch({ type: 'hydrate', values })
  }, [])

  return { form, set, toggle, hydrate, dispatch }
}

// ─── I/O de composición corporal ────────────────────────────────────────────

export interface ProfileBody {
  /** Id de la fila de `nutrition_goals`; null si el usuario aún no tiene objetivo. */
  bodyGoalId: string | null
  age: string
  sex: string
}

/**
 * Lee edad y sexo desde `nutrition_goals`.
 *
 * No están en `users` a propósito: el fix GHSA-wwj3-9h95-wcpf los marcó `hidden`
 * ahí (PII en una colección legible por cualquier usuario autenticado), así que
 * ni se serializan ni se pueden escribir con token de usuario. Su fuente fiable
 * es la fila de `nutrition_goals`, protegida per-user, que además es la que
 * consume el cálculo de calorías. (#243 F4a)
 *
 * Si el usuario todavía no tiene objetivo nutricional no es un error: devuelve
 * los campos vacíos y `bodyGoalId` a null, y el wizard los pedirá al crearlo.
 */
export async function fetchProfileBody(userId: string): Promise<ProfileBody> {
  try {
    const rec = await pb.collection('nutrition_goals').getFirstListItem(
      pb.filter('user = {:uid}', { uid: userId }), { requestKey: null },
    ) as Record<string, unknown> & { id: string }
    return {
      bodyGoalId: rec.id,
      age: rec.age ? String(rec.age) : '',
      sex: (rec.sex as string) || '',
    }
  } catch {
    return { bodyGoalId: null, age: '', sex: '' }
  }
}

/**
 * Escribe edad/sexo en `nutrition_goals` (ver `fetchProfileBody` para el porqué).
 *
 * No hace nada si el usuario aún no tiene objetivo. Nunca lanza: el guardado del
 * perfil no debe caerse porque falle este trozo, y quien llama ya reporta el
 * error a su manera (`console.warn` en web, Sentry en móvil), así que se le pasa
 * por `onError`.
 */
export async function saveBodyDemographics(
  bodyGoalId: string | null,
  age: string,
  sex: string,
  onError?: (e: unknown) => void,
): Promise<void> {
  if (!bodyGoalId) return
  try {
    await pb.collection('nutrition_goals').update(bodyGoalId, {
      age: age ? parseInt(age, 10) : null,
      sex: sex || '',
    })
  } catch (e) {
    onError?.(e)
  }
}

/**
 * Trozo de cuerpo del `users.update`, para que web y móvil no lo escriban dos
 * veces. Cada app lo mezcla con los campos que solo ella guarda.
 */
export function bodyUserPatch(
  body: Pick<ProfileFormState, 'weight' | 'height' | 'activityLevel'>,
): { weight: number | null; height: number | null; activity_level: string } {
  return {
    weight: parseDecimal(body.weight),
    height: parseDecimal(body.height),
    activity_level: body.activityLevel || '',
  }
}

/**
 * Lee los campos de cuerpo de un registro de `users` YA CARGADO.
 *
 * Es un mapper puro y no una petición a propósito: las dos apps ya traen ese
 * registro para sus propios campos, así que hacer aquí un `getOne` añadiría una
 * lectura de más a cada una.
 */
export function bodyFromUserRecord(rec: Record<string, unknown>): Pick<ProfileFormState, 'weight' | 'height' | 'activityLevel'> {
  return {
    weight: rec.weight ? String(rec.weight) : '',
    height: rec.height ? String(rec.height) : '',
    activityLevel: (rec.activity_level as ActivityLevel) || '',
  }
}
