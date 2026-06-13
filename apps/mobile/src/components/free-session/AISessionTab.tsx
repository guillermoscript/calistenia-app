/** Coach IA de sesión libre. La lógica de chat (transport `expo/fetch` →
 *  `useChat` v6, parsing de parts y ediciones del preview) vive en
 *  `useFreeSessionChat`; este componente solo renderiza. */
import { useCallback, useRef, useState } from 'react'
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native'
import { Bot, User, SendHorizonal, Square, Search, Dumbbell } from 'lucide-react-native'
import { Text } from '@/components/ui/text'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { COLORS } from '@/lib/theme'
import { useFreeSessionChat } from '@/lib/use-free-session-chat'
import {
  getMessageText,
  getSearchParts,
  hasAssistantContent,
  type FreeSessionUIMessage,
  type SearchPart,
} from '@/lib/ai-message-parts'
import { AISessionForm } from './AISessionForm'
import { AISessionPreview } from './AISessionPreview'

const SUGGESTIONS = ['Más core', 'Más fácil', 'Menos tiempo', 'Agregar calentamiento']

const SEARCH_LABELS: Record<string, string> = {
  push: 'empuje', pull: 'tirón', legs: 'piernas', core: 'core',
  lumbar: 'lumbar', full: 'cuerpo completo', skill: 'skills',
  movilidad: 'movilidad', yoga: 'yoga',
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Avatar({ role }: { role: 'assistant' | 'user' }) {
  const Icon = role === 'assistant' ? Bot : User
  return (
    <View
      className={cn(
        'h-7 w-7 items-center justify-center rounded-full',
        role === 'assistant' ? 'bg-lime/15' : 'bg-secondary',
      )}
    >
      <Icon size={15} color={role === 'assistant' ? COLORS.lime : COLORS.mutedIcon} />
    </View>
  )
}

function SearchLine({ part }: { part: SearchPart }) {
  const args = part.input ?? {}
  const loading = part.state !== 'output-available'
  const label = args.category ? SEARCH_LABELS[args.category] || args.category : args.muscles || 'ejercicios'
  const found = part.state === 'output-available' ? part.output?.found : null
  return (
    <View className="flex-row items-center gap-2 py-0.5">
      {loading ? <ActivityIndicator size="small" color={COLORS.lime} /> : <Search size={12} color={COLORS.lime} />}
      <Text className="font-mono text-[10px] text-muted-foreground">
        {loading ? 'Buscando' : 'Buscó'} {label}
        {found != null ? ` → ${found}` : ''}
      </Text>
    </View>
  )
}

/** Placeholder mientras el asistente aún no emitió texto ni tool-parts. */
function StreamingShimmer({ messages }: { messages: FreeSessionUIMessage[] }) {
  const last = messages[messages.length - 1]
  if (last?.role === 'assistant' && hasAssistantContent(last.parts)) return null
  return (
    <View className="flex-row items-center gap-2">
      <Avatar role="assistant" />
      <View className="flex-row items-center gap-2 rounded-2xl bg-card px-3 py-2">
        <Dumbbell size={14} color={COLORS.lime} />
        <Text className="text-sm text-muted-foreground">Buscando ejercicios…</Text>
      </View>
    </View>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function AISessionTab() {
  const [input, setInput] = useState('')
  const scrollRef = useRef<ScrollView>(null)

  const {
    messages,
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
          <Avatar role="assistant" />
          <View className="flex-1">
            <Text className="font-sans-medium text-foreground">Coach IA</Text>
            <Text className="mt-0.5 text-sm text-muted-foreground">
              Configura tu sesión y te armo una rutina personalizada.
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
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerClassName="px-4 pb-4 gap-4"
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((message) => {
          if (message.role === 'user') {
            return (
              <View key={message.id} className="flex-row items-start justify-end gap-2">
                <View className="max-w-[85%] rounded-2xl rounded-tr-sm bg-secondary px-3 py-2">
                  <Text className="text-sm text-foreground">{getMessageText(message.parts)}</Text>
                </View>
                <Avatar role="user" />
              </View>
            )
          }

          const searchParts = getSearchParts(message.parts)
          const text = getMessageText(message.parts)
          const showPreview = message.id === latestSessionMsgId

          return (
            <View key={message.id} className="gap-2">
              {searchParts.length > 0 && (
                <View className="flex-row items-start gap-2">
                  <Avatar role="assistant" />
                  <View className="flex-1">
                    {searchParts.map((p, i) => (
                      <SearchLine key={p.toolCallId || i} part={p} />
                    ))}
                  </View>
                </View>
              )}

              {!!text && (
                <View className="flex-row items-start gap-2">
                  <Avatar role="assistant" />
                  <View className="max-w-[88%] rounded-2xl rounded-tl-sm bg-card px-3 py-2">
                    <Text className="text-sm text-foreground">{text}</Text>
                  </View>
                </View>
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

        {isStreaming && <StreamingShimmer messages={messages} />}

        {error && (
          <View className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
            <Text className="text-sm text-destructive">Error generando la sesión. Intenta de nuevo.</Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom bar */}
      <View className="gap-2 border-t border-border px-4 pb-2 pt-2">
        {!isStreaming && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1.5" keyboardShouldPersistTaps="handled">
            {SUGGESTIONS.map((s) => (
              <Pressable
                key={s}
                onPress={() => send(s)}
                className="rounded-full border border-border bg-card px-3 py-1.5 active:opacity-70"
              >
                <Text className="font-mono text-[11px] text-muted-foreground">{s}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <View className="flex-row items-center gap-2">
          <Input
            value={input}
            onChangeText={setInput}
            placeholder="Pide cambios… (más core, etc.)"
            placeholderTextColor={COLORS.placeholder}
            className="h-11 flex-1 rounded-xl"
            onSubmitEditing={handleSend}
            returnKeyType="send"
            editable={!isStreaming}
          />
          <Pressable
            onPress={isStreaming ? stop : handleSend}
            disabled={!isStreaming && !input.trim()}
            className={cn(
              'h-11 w-11 items-center justify-center rounded-xl',
              isStreaming ? 'bg-destructive/15' : input.trim() ? 'bg-lime/15' : 'bg-muted/40',
            )}
          >
            {isStreaming ? (
              <Square size={16} color={COLORS.destructive} fill={COLORS.destructive} />
            ) : (
              <SendHorizonal size={18} color={input.trim() ? COLORS.lime : COLORS.mutedIcon} />
            )}
          </Pressable>
        </View>
      </View>
    </View>
  )
}
