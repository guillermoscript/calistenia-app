/**
 * Tipado y parsing de los UIMessage parts del coach IA (AI SDK v7).
 *
 * En v7 las tool-parts son `{ type: 'tool-<toolName>', state, input, output }`
 * (NO la API vieja `tool-invocation`/`toolName`/`result` de v4). Definimos el
 * tool set que emite el backend (`POST /api/generate-free-session`, ver
 * `mcp-server/src/api/free-session-generator.ts`) para que `useChat` devuelva
 * mensajes tipados y el render no necesite `any`.
 *
 * Espejo de `apps/mobile/src/lib/ai-message-parts.ts`.
 */
import type { UIMessage, ToolUIPart, UIDataTypes } from 'ai'
import { isTextUIPart } from 'ai'

export interface AIExercise {
  id: string
  sets: number
  reps: string
  rest: number
  phase?: 'warmup' | 'main' | 'cooldown'
}

export interface CreateSessionResult {
  success: boolean
  exercises: AIExercise[]
  exercise_count: number
  format?: string
  invalid_ids?: string[]
}

/** Argumentos con los que la IA invoca `search_exercises`. */
export interface SearchExercisesInput {
  category?: string
  muscles?: string
  equipment?: string
}

/** Resultado de `search_exercises` (solo consumimos `found` en el UI). */
export interface SearchExercisesOutput {
  found?: number
}

/** Tool set del backend de free-session. (type, no interface: una interface no
 *  satisface el index signature de `UITools = Record<string, UITool>`.) */
export type FreeSessionTools = {
  search_exercises: { input: SearchExercisesInput; output: SearchExercisesOutput }
  create_session: { input: unknown; output: CreateSessionResult }
}

export type FreeSessionUIMessage = UIMessage<unknown, UIDataTypes, FreeSessionTools>
export type FreeSessionPart = FreeSessionUIMessage['parts'][number]
export type SearchPart = Extract<ToolUIPart<FreeSessionTools>, { type: 'tool-search_exercises' }>
export type SessionPart = Extract<ToolUIPart<FreeSessionTools>, { type: 'tool-create_session' }>

// ── Parsing ──────────────────────────────────────────────────────────────────

/** Concatena el texto de los `text` parts del mensaje. */
export function getMessageText(parts: FreeSessionPart[]): string {
  return parts.filter(isTextUIPart).map((p) => p.text).join('')
}

/** Sub-parts de búsqueda de ejercicios, en orden. */
export function getSearchParts(parts: FreeSessionPart[]): SearchPart[] {
  return parts.filter((p): p is SearchPart => p.type === 'tool-search_exercises')
}

/** Sub-parts de `create_session`, en orden. */
export function getSessionParts(parts: FreeSessionPart[]): SessionPart[] {
  return parts.filter((p): p is SessionPart => p.type === 'tool-create_session')
}

/** Ejercicios de la primera `create_session` completa del mensaje con resultado, o null. */
export function getSessionFromParts(parts: FreeSessionPart[]): AIExercise[] | null {
  for (const p of getSessionParts(parts)) {
    if (p.state === 'output-available' && p.output?.exercises?.length) {
      return p.output.exercises
    }
  }
  return null
}

/** True si el mensaje del asistente ya tiene texto o alguna tool-part (no shimmer). */
export function hasAssistantContent(parts: FreeSessionPart[]): boolean {
  return parts.some(
    (p) => (p.type === 'text' && p.text.length > 0) || p.type.startsWith('tool-'),
  )
}

/** Fallback: parsea ejercicios de bloques ```json del texto (compat con respuestas viejas). */
export function parseExercisesFromText(text: string): AIExercise[] {
  const jsonBlockRegex = /```json\s*([\s\S]*?)```/g
  let match: RegExpExecArray | null
  while ((match = jsonBlockRegex.exec(text)) !== null) {
    try {
      const parsed: unknown = JSON.parse(match[1])
      const exercises =
        parsed && typeof parsed === 'object' && 'exercises' in parsed
          ? (parsed as { exercises: unknown }).exercises
          : parsed
      if (Array.isArray(exercises)) {
        return exercises.filter(
          (e): e is AIExercise => !!e && typeof e === 'object' && typeof (e as AIExercise).id === 'string',
        )
      }
    } catch { /* try next block */ }
  }
  return []
}
