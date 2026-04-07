import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import SessionForm from './SessionForm'
import SessionPreview, { parseExercisesFromMarkdown } from './SessionPreview'
import { Conversation, ConversationContent, ConversationScrollButton } from '../ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '../ai-elements/message'
import { Shimmer } from '../ai-elements/shimmer'
import { Suggestions, Suggestion } from '../ai-elements/suggestion'
import { Button } from '../ui/button'
import { pb } from '../../lib/pocketbase'

interface AIExercise {
  id: string
  sets: number
  reps: string
  rest: number
}

const transport = new DefaultChatTransport({
  api: '/api/generate-free-session',
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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

  const handleChatSend = useCallback(() => {
    const text = input.trim()
    if (!text || isStreaming) return
    sendMessage({ text })
    setInput('')
  }, [input, isStreaming, sendMessage])

  const handleSuggestion = useCallback((suggestion: string) => {
    if (isStreaming) return
    sendMessage({ text: suggestion })
  }, [isStreaming, sendMessage])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleChatSend()
    }
  }, [handleChatSend])

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
    <div className="flex flex-col gap-4">
      {/* Chat messages */}
      <Conversation className="min-h-[200px] max-h-[50vh] rounded-xl border border-border bg-card">
        <ConversationContent className="">
          {messages.map(message => (
            <Message key={message.id} from={message.role} className="">
              <MessageContent className="">
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

          {isStreaming && messages[messages.length - 1]?.role === 'user' && (
            <Message from="assistant" className="">
              <MessageContent className="">
                <Shimmer className="">Generando sesión...</Shimmer>
              </MessageContent>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton className="" />
      </Conversation>

      {/* Session preview */}
      {aiExercises.length > 0 && (
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
        <Suggestions className="">
          {SUGGESTIONS.map(s => (
            <Suggestion key={s} suggestion={s} onClick={handleSuggestion} className="">{s}</Suggestion>
          ))}
        </Suggestions>
      )}

      {/* Chat input */}
      <div className="flex gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Pide cambios... (más core, quita dominadas, etc.)"
          rows={1}
          className="flex-1 field-sizing-content max-h-24 min-h-[44px] rounded-lg border border-border bg-card px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:border-lime/50 resize-none"
        />
        <Button
          onClick={handleChatSend}
          disabled={!input.trim() || isStreaming}
          size="icon"
          className="shrink-0 bg-[hsl(var(--lime))] text-[hsl(var(--lime-foreground))] hover:bg-[hsl(var(--lime))]/90 h-[44px] w-[44px]"
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </Button>
      </div>
    </div>
  )
}
