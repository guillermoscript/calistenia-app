/**
 * Estado del coach IA de sesión libre: transport `expo/fetch` → `useChat`
 * (AI SDK v6), más las ediciones locales del preview.
 *
 * Las ediciones (reordenar/quitar/agregar) se guardan **asociadas al id del
 * mensaje** de la sesión que editan. Así, en vez de resetearlas con un effect
 * sobre `messages.length` (que las perdía a media edición cuando llegaba un
 * chunk nuevo), `sessionExercises` se **deriva**: las ediciones solo aplican si
 * siguen apuntando a la sesión vigente; una sesión nueva las ignora sin más.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { fetch as expoFetch } from 'expo/fetch'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { AI_API_URL } from '@calistenia/core/lib/ai-api'
import { pb } from '@calistenia/core/lib/pocketbase'
import type { UserContext } from '@/components/free-session/AISessionForm'
import { moveItem, removeAt } from '@/lib/reorder'
import {
  getSessionFromParts,
  type AIExercise,
  type FreeSessionUIMessage,
} from '@/lib/ai-message-parts'

interface SessionEdits {
  msgId: string
  exercises: AIExercise[]
}

export function useFreeSessionChat() {
  const userContextRef = useRef<UserContext | null>(null)
  const [edits, setEdits] = useState<SessionEdits | null>(null)

  const transport = useMemo(
    () =>
      new DefaultChatTransport<FreeSessionUIMessage>({
        api: `${AI_API_URL}/api/generate-free-session`,
        fetch: expoFetch as unknown as typeof globalThis.fetch,
        headers: () => {
          const h: Record<string, string> = {}
          if (pb.authStore.token) h.Authorization = `Bearer ${pb.authStore.token}`
          return h
        },
        body: () => (userContextRef.current ? { userContext: userContextRef.current } : {}),
      }),
    [],
  )

  const { messages, sendMessage, status, error, stop } = useChat<FreeSessionUIMessage>({ transport })

  const isStreaming = status === 'streaming' || status === 'submitted'
  const hasMessages = messages.length > 0

  // Último mensaje del asistente con una sesión → ahí va el preview editable.
  const latestSessionMsgId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.role === 'assistant' && getSessionFromParts(m.parts)) return m.id
    }
    return null
  }, [messages])

  // Ejercicios base de esa sesión (sin ediciones del usuario).
  const baseExercises = useMemo<AIExercise[]>(() => {
    const m = latestSessionMsgId ? messages.find((x) => x.id === latestSessionMsgId) : null
    return (m && getSessionFromParts(m.parts)?.exercises) || []
  }, [messages, latestSessionMsgId])

  // Derivado: las ediciones solo cuentan si apuntan a la sesión vigente.
  const sessionExercises =
    edits && edits.msgId === latestSessionMsgId ? edits.exercises : baseExercises

  const editExercises = useCallback(
    (fn: (prev: AIExercise[]) => AIExercise[]) => {
      if (!latestSessionMsgId) return
      setEdits((prev) => {
        const base = prev && prev.msgId === latestSessionMsgId ? prev.exercises : baseExercises
        return { msgId: latestSessionMsgId, exercises: fn(base) }
      })
    },
    [latestSessionMsgId, baseExercises],
  )

  const removeExercise = useCallback((idx: number) => editExercises((p) => removeAt(p, idx)), [editExercises])
  const reorderExercise = useCallback(
    (from: number, to: number) => editExercises((p) => moveItem(p, from, to)),
    [editExercises],
  )
  const addExercise = useCallback((ex: AIExercise) => editExercises((p) => [...p, ex]), [editExercises])

  const submitForm = useCallback(
    (message: string, ctx: UserContext) => {
      if (isStreaming) return
      userContextRef.current = ctx
      sendMessage({ text: message })
    },
    [isStreaming, sendMessage],
  )

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isStreaming) return
      sendMessage({ text: trimmed })
    },
    [isStreaming, sendMessage],
  )

  return {
    messages,
    status,
    error,
    stop,
    isStreaming,
    hasMessages,
    latestSessionMsgId,
    sessionExercises,
    removeExercise,
    reorderExercise,
    addExercise,
    submitForm,
    send,
  }
}
