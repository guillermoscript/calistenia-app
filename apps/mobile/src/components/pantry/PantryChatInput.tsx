import { useState } from 'react'
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native'
import { Send } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'

export function PantryChatInput({ onSend, busy }: {
  onSend: (text: string) => void
  busy: boolean
}) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const canSend = text.trim().length > 0 && !busy

  const send = () => {
    if (!canSend) return
    onSend(text.trim())
    setText('')
  }

  return (
    <View className="flex-row items-center gap-2 border-t border-border bg-background px-3 py-2">
      <TextInput
        value={text}
        onChangeText={v => setText(v.slice(0, 500))}
        placeholder={t('pantry.chatPlaceholder')}
        placeholderTextColor="hsl(0 0% 45%)"
        returnKeyType="send"
        onSubmitEditing={send}
        editable={!busy}
        className="h-11 flex-1 rounded-full border border-input bg-card px-4 text-sm text-foreground"
      />
      <Pressable
        onPress={send}
        disabled={!canSend}
        className={`size-11 items-center justify-center rounded-full ${canSend ? 'bg-lime' : 'bg-muted/40'}`}
      >
        {busy
          ? <ActivityIndicator size="small" color="#000" />
          : <Send size={18} color={canSend ? '#000' : 'hsl(0 0% 55%)'} />}
      </Pressable>
    </View>
  )
}
