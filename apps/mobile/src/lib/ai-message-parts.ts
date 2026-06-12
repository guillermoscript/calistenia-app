/**
 * Tipado y parsing de los UIMessage parts del coach IA (AI SDK **v6**).
 *
 * En v6 las tool-parts son `{ type: 'tool-<toolName>', state, input, output }`
 * (NO la API vieja `tool-invocation`/`result`). Definimos el tool set que emite
 * el backend (`POST /api/generate-free-session`) para que `useChat` devuelva
 * mensajes tipados y el render no necesite `as any`.
 */
import type { UIMessage, ToolUIPart, UIDataTypes } from 'ai'
import { isTextUIPart } from 'ai'
import type { AIExercise, CreateSessionResult } from './ai-exercise-to-exercise'

/** Argumentos con los que la IA invoca `search_exercises`. */
export interface SearchExercisesInput {
  category?: string
  muscles?: string
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

// ── Parsing ──────────────────────────────────────────────────────────────────

/** Concatena el texto de los `text` parts del mensaje. */
export function getMessageText(parts: FreeSessionPart[]): string {
  return parts.filter(isTextUIPart).map((p) => p.text).join('')
}

/** Sub-parts de búsqueda de ejercicios, en orden. */
export function getSearchParts(parts: FreeSessionPart[]): SearchPart[] {
  return parts.filter((p): p is SearchPart => p.type === 'tool-search_exercises')
}

/** Sesión generada por la última `create_session` completa del mensaje, o null. */
export function getSessionFromParts(parts: FreeSessionPart[]): CreateSessionResult | null {
  for (const p of parts) {
    if (p.type === 'tool-create_session' && p.state === 'output-available') {
      const out = p.output
      if (out?.exercises?.length) return out
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

export type { AIExercise }
