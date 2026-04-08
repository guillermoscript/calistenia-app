import { useState, useCallback, useMemo, useEffect } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import SessionForm from './SessionForm'
import SessionPreview, { parseExercisesFromMarkdown } from './SessionPreview'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '../ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '../ai-elements/message'
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
} from '../ai-elements/prompt-input'
import { Shimmer } from '../ai-elements/shimmer'
import { Suggestions, Suggestion } from '../ai-elements/suggestion'
import { pb } from '../../lib/pocketbase'
import { AI_API_URL } from '../../lib/ai-api'

interface AIExercise {
  id: string
  sets: number
  reps: string
  rest: number
}

const transport = new DefaultChatTransport({
  api: `${AI_API_URL}/api/generate-free-session`,
  headers: () => {
    const headers: Record<string, string> = {}
    if (pb.authStore.token) {
      headers['Authorization'] = `Bearer ${pb.authStore.token}`
    }
    return headers
  },
})

const SUGGESTIONS = [
  'Más core',
  'Más fácil',
  'Menos tiempo',
  'Agregar calentamiento',
]

export default function AISessionTab() {
  const [input, setInput] = useState('')
  const { messages, sendMessage, status, error } = useChat({ transport })
  const [aiExercises, setAiExercises] = useState<AIExercise[]>([])

  const isStreaming = status === 'streaming' || status === 'submitted'
  const hasMessages = messages.length > 0

  // Parse exercises from the latest assistant message
  useEffect(() => {
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
    if (!lastAssistant) return
    const text = lastAssistant.parts
      ?.filter((p: any) => p.type === 'text')
      .map((p: any) => p.text)
      .join('') || ''
    const parsed = parseExercisesFromMarkdown(text)
    if (parsed.length > 0) {
      setAiExercises(parsed)
    }
  }, [messages])

  const handleFormSubmit = useCallback((message: string) => {
    if (isStreaming) return
    sendMessage({ text: message })
  }, [isStreaming, sendMessage])

  const handleChatSubmit = useCallback(({ text }: { text: string }) => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return
    sendMessage({ text: trimmed })
    setInput('')
  }, [isStreaming, sendMessage])

  const handleSuggestion = useCallback((suggestion: string) => {
    if (isStreaming) return
    sendMessage({ text: suggestion })
  }, [isStreaming, sendMessage])

  const handleRemoveExercise = useCallback((idx: number) => {
    setAiExercises(prev => prev.filter((_, i) => i !== idx))
  }, [])

  const handleReorder = useCallback((fromIdx: number, toIdx: number) => {
    setAiExercises(prev => {
      const next = [...prev];
      [next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]]
      return next
    })
  }, [])

  // Derive prompt status for PromptInputSubmit
  const promptStatus = useMemo(() => {
    if (status === 'submitted') return 'submitted' as const
    if (status === 'streaming') return 'streaming' as const
    if (error) return 'error' as const
    return 'ready' as const
  }, [status, error])

  // Form view (no messages yet)
  if (!hasMessages) {
    return (
      <div className="max-w-md mx-auto">
        <div className="mb-4">
          <div className="text-[10px] text-muted-foreground tracking-[2px] uppercase mb-1">Asistente IA</div>
          <p className="text-sm text-muted-foreground">
            Completa tus datos y genera una sesión personalizada con inteligencia artificial.
          </p>
        </div>
        <SessionForm onSubmit={handleFormSubmit} isLoading={isStreaming} />
      </div>
    )
  }

  // Chat view (after first generation)
  return (
    <div className="flex flex-col gap-3">
      {/* Conversation area */}
      <Conversation className="min-h-[200px] max-h-[50vh] rounded-xl border border-border bg-card">
        <ConversationContent>
          {messages.map(message => (
            <Message key={message.id} from={message.role}>
              <MessageContent>
                {message.role === 'user' ? (
                  <p className="text-sm whitespace-pre-wrap">
                    {message.parts
                      ?.filter((p: any) => p.type === 'text')
                      .map((p: any) => p.text)
                      .join('') || ''}
                  </p>
                ) : (
                  <MessageResponse>
                    {message.parts
                      ?.filter((p: any) => p.type === 'text')
                      .map((p: any) => p.text)
                      .join('') || ''}
                  </MessageResponse>
                )}
              </MessageContent>
            </Message>
          ))}

          {/* Loading shimmer while AI is thinking */}
          {isStreaming && (
            (() => {
              const lastMsg = messages[messages.length - 1]
              const hasAssistantText = lastMsg?.role === 'assistant' &&
                lastMsg.parts?.some((p: any) => p.type === 'text' && p.text.length > 0)
              if (!hasAssistantText) {
                return (
                  <Message from="assistant">
                    <MessageContent>
                      <Shimmer className="text-sm">Buscando ejercicios y generando tu sesión...</Shimmer>
                    </MessageContent>
                  </Message>
                )
              }
              return null
            })()
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Session preview */}
      {aiExercises.length > 0 && !isStreaming && (
        <SessionPreview
          exercises={aiExercises}
          onRemove={handleRemoveExercise}
          onReorder={handleReorder}
        />
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          Error generando sesión. Intenta de nuevo.
        </div>
      )}

      {/* Suggestion pills */}
      {!isStreaming && hasMessages && (
        <Suggestions>
          {SUGGESTIONS.map(s => (
            <Suggestion key={s} suggestion={s} onClick={handleSuggestion}>{s}</Suggestion>
          ))}
        </Suggestions>
      )}

      {/* PromptInput */}
      <PromptInput
        onSubmit={handleChatSubmit}
        className="w-full"
      >
        <PromptInputTextarea
          value={input}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.currentTarget.value)}
          placeholder="Pide cambios... (más core, quita dominadas, etc.)"
          className="min-h-[44px] pr-12"
        />
        <PromptInputSubmit
          status={promptStatus}
          disabled={!input.trim() && !isStreaming}
          className="absolute bottom-1 right-1"
        />
      </PromptInput>
    </div>
  )
}
