/** Coach IA de sesión libre. La lógica de chat vive en `useFreeSessionChat`;
 *  este componente solo renderiza usando los primitivos ai-elements. */
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  Loader,
  Message,
  MessageContent,
  MessageResponse,
  PromptInput,
  PromptInputBody,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
  Suggestion,
  Suggestions,
} from '@/components/ai-elements'
import { Text } from '@/components/ui/text'
import { COLORS } from '@/lib/theme'
import {
  getMessageText,
  getSearchParts,
  hasAssistantContent,
  type FreeSessionUIMessage,
  type SearchPart,
} from '@/lib/ai-message-parts'
import { useFreeSessionChat } from '@/lib/use-free-session-chat'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, View } from 'react-native'
import { Search } from 'lucide-react-native'
import { AISessionForm } from './AISessionForm'
import { AISessionPreview } from './AISessionPreview'

// Claves de i18n, no texto: el valor se resuelve con `t()` al pintar. Mismas
// claves que la versión web de esta pantalla.
const SUGGESTION_KEYS = [
  'freeSession.aiSuggestMoreCore',
  'freeSession.aiSuggestEasier',
  'freeSession.aiSuggestShorter',
  'freeSession.aiSuggestWarmup',
]

const SEARCH_LABEL_KEYS: Record<string, string> = {
  push: 'freeSession.searchPush', pull: 'freeSession.searchPull',
  legs: 'freeSession.searchLegs', core: 'freeSession.searchCore',
  lumbar: 'freeSession.searchLumbar', full: 'freeSession.searchFull',
  skill: 'freeSession.searchSkill', movilidad: 'freeSession.searchMobility',
  yoga: 'freeSession.searchYoga',
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SearchLine({ part }: { part: SearchPart }) {
  const { t } = useTranslation()
  const args = part.input ?? {}
  const loading = part.state !== 'output-available'
  const label = args.category
    ? (SEARCH_LABEL_KEYS[args.category] ? t(SEARCH_LABEL_KEYS[args.category]) : args.category)
    : args.muscles || t('common.exercises')
  const found = part.state === 'output-available' ? part.output?.found : null
  return (
    <View className="flex-row items-center gap-2 py-0.5">
      {loading
        ? <ActivityIndicator size="small" color={COLORS.lime} />
        : <Search size={12} color={COLORS.lime} />}
      <Text className="font-mono text-[10px] text-muted-foreground">
        {loading ? t('common.searchingShort') : t('freeSession.aiSearched')} {label}
        {found != null ? ` → ${found}` : ''}
      </Text>
    </View>
  )
}

function StreamingLoader({ messages }: { messages: FreeSessionUIMessage[] }) {
  const last = messages[messages.length - 1]
  if (last?.role === 'assistant' && hasAssistantContent(last.parts)) return null
  return (
    <Message from="assistant">
      <MessageContent>
        <Loader />
      </MessageContent>
    </Message>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function AISessionTab() {
  const { t } = useTranslation()
  const [input, setInput] = useState('')

  const {
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
  } = useFreeSessionChat()

  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return
    send(input)
    setInput('')
  }, [input, isStreaming, send])

  // ── Form view ──────────────────────────────────────────────────────────────
  if (!hasMessages) {
    return (
      <View className="flex-1">
        <View className="flex-row items-start gap-3 px-4 pb-3">
          <View className="h-7 w-7 items-center justify-center rounded-full bg-lime/15">
            <Text className="text-[11px]">AI</Text>
          </View>
          <View className="flex-1">
            <Text className="font-sans-medium text-foreground">{t('freeSession.aiCoachName')}</Text>
            <Text className="mt-0.5 text-sm text-muted-foreground">
              {t('freeSession.aiCoachIntro')}
            </Text>
          </View>
        </View>
        <AISessionForm onSubmit={submitForm} isLoading={isStreaming} />
      </View>
    )
  }

  // ── Chat view ──────────────────────────────────────────────────────────────
  return (
    <View className="flex-1">
      <Conversation>
        <ConversationContent>
          {messages.map((message) => {
            if (message.role === 'user') {
              return (
                <Message key={message.id} from="user">
                  <MessageContent>
                    <MessageResponse>{getMessageText(message.parts)}</MessageResponse>
                  </MessageContent>
                </Message>
              )
            }

            const searchParts = getSearchParts(message.parts)
            const text = getMessageText(message.parts)
            const showPreview = message.id === latestSessionMsgId

            return (
              <View key={message.id} className="gap-2">
                {searchParts.length > 0 && (
                  <Message from="assistant">
                    <MessageContent>
                      {searchParts.map((p, i) => (
                        <SearchLine key={p.toolCallId || i} part={p} />
                      ))}
                    </MessageContent>
                  </Message>
                )}

                {!!text && (
                  <Message from="assistant">
                    <MessageContent>
                      <MessageResponse>{text}</MessageResponse>
                    </MessageContent>
                  </Message>
                )}

                {showPreview && sessionExercises.length > 0 && (
                  <AISessionPreview
                    exercises={sessionExercises}
                    onRemove={removeExercise}
                    onReorder={reorderExercise}
                    onAdd={addExercise}
                  />
                )}
              </View>
            )
          })}

          {isStreaming && <StreamingLoader messages={messages} />}

          {error && (
            <View className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
              <Text className="text-sm text-destructive">
                {t('freeSession.aiError')}
              </Text>
            </View>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Bottom bar */}
      <View className="gap-2 border-t border-border px-4 pb-2 pt-2">
        {!isStreaming && (
          <Suggestions contentClassName="px-0">
            {SUGGESTION_KEYS.map((key) => (
              <Suggestion key={key} suggestion={t(key)} onPress={send} />
            ))}
          </Suggestions>
        )}

        <PromptInput>
          <PromptInputBody>
            <PromptInputTextarea
              value={input}
              onChangeText={setInput}
              placeholder={t('freeSession.aiChatPlaceholder')}
              onSubmit={handleSend}
              editable={!isStreaming}
            />
          </PromptInputBody>
          <PromptInputToolbar>
            <PromptInputTools />
            <PromptInputSubmit
              status={status as 'submitted' | 'streaming' | 'ready' | 'error'}
              onPress={handleSend}
              onStop={stop}
              disabled={!isStreaming && !input.trim()}
            />
          </PromptInputToolbar>
        </PromptInput>
      </View>
    </View>
  )
}
