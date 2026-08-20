import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import SessionForm, { type UserContext } from './SessionForm'
import SessionPreview from './SessionPreview'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '../ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '../ai-elements/message'
import { Shimmer } from '../ai-elements/shimmer'
import { pb } from '@calistenia/core/lib/pocketbase'
import { AI_API_URL } from '@calistenia/core/lib/ai-api'
import { cn } from '../../lib/utils'
import {
  type AIExercise,
  type CreateSessionResult,
  type FreeSessionUIMessage,
  type SearchPart,
  type SessionPart,
  getMessageText,
  getSearchParts,
  getSessionParts,
  getSessionFromParts,
  hasAssistantContent,
  parseExercisesFromText,
} from '../../lib/ai-message-parts'
import {
  BotMessageSquareIcon, UserIcon, SendHorizonalIcon, SquareIcon,
  LoaderIcon, DumbbellIcon, CheckCircleIcon, SearchIcon,
} from 'lucide-react'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Strip ```json ... ``` blocks from AI text (backward compat for old responses) */
function stripJsonBlocks(text: string): string {
  return text.replace(/```json\s*[\s\S]*?```/g, '').trim()
}

// ── Constants ────────────────────────────────────────────────────────────────

// Los mapas guardan CLAVES de i18n, no texto: el valor se resuelve con `t()`
// al pintar, así un cambio de idioma no exige recargar el módulo. Mismo patrón
// que `PRIORITY_LABEL_KEYS` en ExerciseCard.
const SUGGESTION_KEYS = [
  'freeSession.aiSuggestMoreCore',
  'freeSession.aiSuggestEasier',
  'freeSession.aiSuggestShorter',
  'freeSession.aiSuggestWarmup',
]

const GOAL_LABEL_KEYS: Record<string, string> = {
  fuerza: 'freeSession.goalStrength', resistencia: 'freeSession.goalEndurance',
  movilidad: 'freeSession.goalMobility', yoga: 'freeSession.goalYoga',
  circuito: 'freeSession.goalCircuit', mixto: 'freeSession.goalMixed',
}

const LOCATION_LABEL_KEYS: Record<string, string> = {
  casa: 'freeSession.locationHome', parque: 'freeSession.locationPark',
  gimnasio: 'freeSession.locationGym',
}

const SEARCH_LABEL_KEYS: Record<string, string> = {
  push: 'freeSession.searchPush', pull: 'freeSession.searchPull',
  legs: 'freeSession.searchLegs', core: 'freeSession.searchCore',
  lumbar: 'freeSession.searchLumbar', full: 'freeSession.searchFull',
  skill: 'freeSession.searchSkill', movilidad: 'freeSession.searchMobility',
  yoga: 'freeSession.searchYoga',
}

// ── Sub-components ───────────────────────────────────────────────────────────

function CoachAvatar({ className }: { className?: string }) {
  return (
    <div className={cn(
      'flex size-7 shrink-0 items-center justify-center rounded-full bg-lime/15 text-lime',
      className
    )}>
      <BotMessageSquareIcon className="size-4" />
    </div>
  )
}

function UserAvatar({ className }: { className?: string }) {
  return (
    <div className={cn(
      'flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground',
      className
    )}>
      <UserIcon className="size-3.5" />
    </div>
  )
}

function SessionContext({ context }: { context: UserContext }) {
  const { t } = useTranslation()
  // Sin clave conocida cae al valor crudo, que es el que llegó del formulario.
  const parts = [
    GOAL_LABEL_KEYS[context.goal] ? t(GOAL_LABEL_KEYS[context.goal]) : context.goal,
    `${context.availableTime} min`,
    LOCATION_LABEL_KEYS[context.location] ? t(LOCATION_LABEL_KEYS[context.location]) : context.location,
  ]
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground px-1 pb-1">
      <CoachAvatar className="size-5 [&_svg]:size-3" />
      <span className="font-medium text-foreground/70">{t('freeSession.aiCoachName')}</span>
      <span className="text-muted-foreground/40">·</span>
      <span>{parts.join(' · ')}</span>
    </div>
  )
}

/** Renders a search_exercises tool invocation inline */
function SearchToolUI({ part }: { part: SearchPart }) {
  const { t } = useTranslation()
  const args = part.input ?? {}
  const isDone = part.state === 'output-available' || part.state === 'output-error'
  const isLoading = !isDone

  const label = args.category
    ? (SEARCH_LABEL_KEYS[args.category] ? t(SEARCH_LABEL_KEYS[args.category]) : args.category)
    : args.muscles || t('common.exercises')

  const resultCount = part.state === 'output-available' ? (part.output?.found ?? null) : null

  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-0.5">
      {isLoading ? (
        <LoaderIcon className="size-3 animate-spin text-lime/60" />
      ) : (
        <SearchIcon className="size-3 text-lime/50" />
      )}
      <span>
        {isLoading ? t('common.searchingShort') : t('freeSession.aiSearched')} {label}
        {args.equipment && ` · ${args.equipment}`}
      </span>
      {resultCount !== null && (
        <span className="text-muted-foreground/50">
          → {t('freeSession.aiFoundCount', { count: resultCount })}
        </span>
      )}
    </div>
  )
}

/** Renders a create_session tool invocation as the session card */
function SessionToolUI({ part, exercises, onRemove, onReorder, onAdd }: {
  part: SessionPart
  /** Ejercicios a pintar (con las ediciones locales); si no se pasa, los del tool output. */
  exercises?: AIExercise[]
  onRemove: (idx: number) => void
  onReorder: (from: number, to: number) => void
  onAdd: (ex: AIExercise) => void
}) {
  const { t } = useTranslation()
  const isDone = part.state === 'output-available' || part.state === 'output-error'
  const isLoading = !isDone
  const result: CreateSessionResult | undefined =
    part.state === 'output-available' ? part.output : undefined

  if (isLoading) {
    return (
      <div className="flex items-center gap-2.5 py-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-lime/15 text-lime animate-pulse">
          <DumbbellIcon className="size-4" />
        </div>
        <Shimmer className="text-sm">{t('freeSession.aiBuilding')}</Shimmer>
      </div>
    )
  }

  if (!result?.exercises?.length) {
    return (
      <div className="flex items-center gap-2.5 text-sm text-muted-foreground py-2">
        <DumbbellIcon className="size-4 text-amber-400" />
        <span>{t('freeSession.aiGenerateFailed')}</span>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2.5">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-lime/15 text-lime mt-1">
        <DumbbellIcon className="size-4" />
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-lime">{t('freeSession.aiSessionReady')}</span>
          <CheckCircleIcon className="size-3.5 text-lime/70" />
          {result.invalid_ids && result.invalid_ids.length > 0 && (
            <span className="text-[10px] text-amber-400">
              {t('freeSession.aiNotFoundCount', { count: result.invalid_ids.length })}
            </span>
          )}
        </div>
        <SessionPreview
          exercises={exercises ?? result.exercises}
          onRemove={onRemove}
          onReorder={onReorder}
          onAdd={onAdd}
        />
      </div>
    </div>
  )
}

/** Custom chat input */
function ChatInput({ value, onChange, onSubmit, status, disabled }: {
  value: string
  onChange: (val: string) => void
  onSubmit: () => void
  status: 'ready' | 'submitted' | 'streaming' | 'error'
  disabled: boolean
}) {
  const { t } = useTranslation()
  const isGenerating = status === 'submitted' || status === 'streaming'
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!disabled) onSubmit()
    }
  }, [disabled, onSubmit])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [value])

  return (
    <div className="relative flex items-end gap-2 rounded-xl border border-border bg-card px-3 py-2 focus-within:border-lime/40 transition-colors">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('freeSession.aiChatPlaceholder')}
        rows={1}
        className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none min-h-[24px] max-h-[120px] py-0.5"
      />
      <button
        type="button"
        onClick={isGenerating ? undefined : onSubmit}
        disabled={disabled && !isGenerating}
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-lg transition-all',
          isGenerating
            ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
            : disabled
              ? 'text-muted-foreground/30'
              : 'bg-lime/15 text-lime hover:bg-lime/25'
        )}
      >
        {status === 'submitted' ? (
          <LoaderIcon className="size-4 animate-spin" />
        ) : isGenerating ? (
          <SquareIcon className="size-3.5" />
        ) : (
          <SendHorizonalIcon className="size-4" />
        )}
      </button>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function AISessionTab() {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [localExercises, setLocalExercises] = useState<AIExercise[] | null>(null)
  const userContextRef = useRef<UserContext | null>(null)

  const transport = useMemo(() => new DefaultChatTransport({
    api: `${AI_API_URL}/api/generate-free-session`,
    headers: () => {
      const headers: Record<string, string> = {}
      if (pb.authStore.token) {
        headers['Authorization'] = `Bearer ${pb.authStore.token}`
      }
      return headers
    },
    body: () => {
      if (userContextRef.current) {
        return { userContext: userContextRef.current }
      }
      return {}
    },
  }), [])

  const { messages, sendMessage, status, error } = useChat<FreeSessionUIMessage>({ transport })

  const isStreaming = status === 'streaming' || status === 'submitted'
  const hasMessages = messages.length > 0

  // Derive exercises from the latest create_session tool call OR fallback to JSON parsing
  const sessionExercises = useMemo(() => {
    // If user manually edited exercises, use those
    if (localExercises !== null) return localExercises

    // Check all assistant messages (latest first) for create_session tool results
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role !== 'assistant') continue
      const fromTool = getSessionFromParts(msg.parts)
      if (fromTool) return fromTool
    }

    // Fallback: parse JSON from text (backward compat with old prompt format)
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role !== 'assistant') continue
      const text = getMessageText(msg.parts)
      const fromText = parseExercisesFromText(text)
      if (fromText.length > 0) return fromText
    }

    return []
  }, [messages, localExercises])

  // Último mensaje del asistente con una sesión del tool: es el único cuya tarjeta
  // pinta las ediciones locales (las anteriores quedan como las devolvió la IA).
  const latestSessionMsgId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.role === 'assistant' && getSessionFromParts(m.parts)) return m.id
    }
    return null
  }, [messages])

  // Reset local edits when a new create_session result arrives
  useEffect(() => {
    setLocalExercises(null)
  }, [messages.length])

  const handleFormSubmit = useCallback((message: string, context: UserContext) => {
    if (isStreaming) return
    userContextRef.current = context
    sendMessage({ text: message })
  }, [isStreaming, sendMessage])

  const handleChatSubmit = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return
    sendMessage({ text: trimmed })
    setInput('')
  }, [input, isStreaming, sendMessage])

  const handleSuggestion = useCallback((suggestion: string) => {
    if (isStreaming) return
    sendMessage({ text: suggestion })
  }, [isStreaming, sendMessage])

  const handleAddExercise = useCallback((exercise: AIExercise) => {
    setLocalExercises(prev => [...(prev ?? sessionExercises), exercise])
  }, [sessionExercises])

  const handleRemoveExercise = useCallback((idx: number) => {
    setLocalExercises(prev => (prev ?? sessionExercises).filter((_, i) => i !== idx))
  }, [sessionExercises])

  const handleReorder = useCallback((fromIdx: number, toIdx: number) => {
    setLocalExercises(prev => {
      const next = [...(prev ?? sessionExercises)];
      [next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]]
      return next
    })
  }, [sessionExercises])

  const promptStatus = useMemo(() => {
    if (status === 'submitted') return 'submitted' as const
    if (status === 'streaming') return 'streaming' as const
    if (error) return 'error' as const
    return 'ready' as const
  }, [status, error])

  // ── Form view ──────────────────────────────────────────────────────────────
  if (!hasMessages) {
    return (
      <div className="max-w-md mx-auto">
        <div className="mb-4 flex items-start gap-3">
          <CoachAvatar className="mt-0.5" />
          <div>
            <div className="text-sm font-medium text-foreground">{t('freeSession.aiCoachName')}</div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('freeSession.aiCoachIntro')}
            </p>
          </div>
        </div>
        <SessionForm onSubmit={handleFormSubmit} isLoading={isStreaming} />
      </div>
    )
  }

  // ── Chat view ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100dvh-12rem)] max-h-[calc(100dvh-16rem)] md:max-h-[calc(100dvh-12rem)]">
      <Conversation className="flex-1 min-h-0">
        <ConversationContent className="gap-4 px-0 py-3">
          {/* Session context summary */}
          {userContextRef.current && (
            <SessionContext context={userContextRef.current} />
          )}

          {messages.map(message => {
            // ── User messages ──
            if (message.role === 'user') {
              return (
                <div key={message.id} className="flex items-start gap-2.5 justify-end">
                  <Message from="user" className="max-w-[85%]">
                    <MessageContent>
                      <p className="text-sm">{getMessageText(message.parts)}</p>
                    </MessageContent>
                  </Message>
                  <UserAvatar className="mt-1" />
                </div>
              )
            }

            // ── Assistant messages: render text + tool invocations ──
            const parts = message.parts
            const searchTools = getSearchParts(parts)
            const sessionTools = getSessionParts(parts)
            const displayText = stripJsonBlocks(getMessageText(parts))

            // Skip if nothing to show
            if (!displayText && searchTools.length === 0 && sessionTools.length === 0) return null

            return (
              <div key={message.id} className="space-y-3">
                {/* Search tool calls — compact inline indicators */}
                {searchTools.length > 0 && (
                  <div className="flex items-start gap-2.5">
                    <CoachAvatar className="mt-0.5 size-5 [&_svg]:size-3 opacity-60" />
                    <div className="flex flex-col gap-0.5">
                      {searchTools.map(part => (
                        <SearchToolUI key={part.toolCallId} part={part} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Text response */}
                {displayText && (
                  <div className="flex items-start gap-2.5">
                    <CoachAvatar className="mt-1" />
                    <Message from="assistant" className="max-w-[90%]">
                      <MessageContent>
                        <MessageResponse>{displayText}</MessageResponse>
                      </MessageContent>
                    </Message>
                  </div>
                )}

                {/* Session tool call — the main card */}
                {sessionTools.map(part => (
                  <SessionToolUI
                    key={part.toolCallId}
                    part={part}
                    exercises={message.id === latestSessionMsgId ? sessionExercises : undefined}
                    onRemove={handleRemoveExercise}
                    onReorder={handleReorder}
                    onAdd={handleAddExercise}
                  />
                ))}

                {/* Fallback: if no create_session but we parsed exercises from text */}
                {sessionTools.length === 0 && sessionExercises.length > 0 && !isStreaming &&
                  // Only show on the last assistant message
                  message.id === [...messages].reverse().find(m => m.role === 'assistant')?.id && (
                  <div className="flex items-start gap-2.5">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-lime/15 text-lime mt-1">
                      <DumbbellIcon className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-lime">{t('freeSession.aiSessionReady')}</span>
                        <CheckCircleIcon className="size-3.5 text-lime/70" />
                      </div>
                      <SessionPreview
                        exercises={sessionExercises}
                        onRemove={handleRemoveExercise}
                        onReorder={handleReorder}
                        onAdd={handleAddExercise}
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Loading shimmer when no assistant text yet */}
          {isStreaming && (() => {
            const lastMsg = messages[messages.length - 1]
            const hasContent = lastMsg?.role === 'assistant' && hasAssistantContent(lastMsg.parts)
            if (!hasContent) {
              return (
                <div className="flex items-start gap-2.5">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-lime/15 text-lime animate-pulse">
                    <BotMessageSquareIcon className="size-4" />
                  </div>
                  <Message from="assistant">
                    <MessageContent>
                      <Shimmer className="text-sm">{t('freeSession.aiSearching')}</Shimmer>
                    </MessageContent>
                  </Message>
                </div>
              )
            }
            return null
          })()}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2.5">
              <CoachAvatar className="mt-1 bg-red-500/15 text-red-400" />
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
                {t('freeSession.aiError')}
              </div>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Bottom bar */}
      <div className="shrink-0 pt-3 space-y-2.5 pb-1">
        {!isStreaming && hasMessages && (
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTION_KEYS.map(key => (
              <button
                key={key}
                onClick={() => handleSuggestion(t(key))}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-lime/30 hover:bg-lime/5 transition-colors"
              >
                {t(key)}
              </button>
            ))}
          </div>
        )}

        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleChatSubmit}
          status={promptStatus}
          disabled={!input.trim() && !isStreaming}
        />
      </div>
    </div>
  )
}
