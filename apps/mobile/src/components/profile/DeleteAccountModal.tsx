/**
 * Baja de cuenta desde la app (issue #300).
 *
 * Google Play exige que la baja se pueda iniciar dentro de la app, no solo por
 * correo. La confirmación es escribir el email entero, no un "¿seguro?": el
 * borrado es inmediato e irreversible.
 *
 * Modal NATIVO (patrón CommentsSheet/OptionSheet, no gorhom): en Android/MIUI
 * edge-to-edge la ventana nativa queda por encima de la barra de navegación sin
 * cálculos de insets. `onRequestClose` mantiene el back de hardware como salida
 * mientras no haya un borrado en curso.
 */
import { useState } from 'react'
import { Modal, Pressable, StyleSheet, View, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { matchesAccountEmail } from '@calistenia/core/lib/account'
import { useDeleteAccount } from '@calistenia/core/hooks/useDeleteAccount'

export function DeleteAccountModal({ visible, email, onClose, onDeleted }: {
  visible: boolean
  email: string | null | undefined
  onClose: () => void
  /** Se llama tras una baja correcta; la pantalla decide a dónde navegar. */
  onDeleted: () => void
}) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { deleteAccount, deleting } = useDeleteAccount()
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)

  const confirmed = matchesAccountEmail(typed, email)

  const close = () => {
    if (deleting) return // no cerrar a media baja
    setTyped('')
    setError(null)
    onClose()
  }

  const handleDelete = async () => {
    if (!confirmed || deleting) return
    setError(null)
    try {
      await deleteAccount()
      onDeleted()
    } catch {
      setError(t('account.deleteError'))
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={close}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable onPress={close} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
        <View
          className="border-t border-destructive/30 bg-card"
          style={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: insets.bottom + 14 }}
        >
          <View className="items-center pb-2 pt-3"><View className="h-1 w-9 rounded-full bg-destructive/40" /></View>

          <View className="gap-3 px-4 pb-4">
            <View className="flex-row items-center gap-2">
              <AlertTriangle size={18} color="hsl(0 72% 55%)" />
              <Text className="font-mono text-[10px] uppercase tracking-[3px] text-destructive">
                {t('account.dangerZone')}
              </Text>
            </View>
            <Text className="font-bebas text-3xl leading-none text-foreground">{t('account.deleteTitle')}</Text>
            <Text className="text-sm text-muted-foreground">{t('account.deleteIntro')}</Text>

            <View className="gap-1.5 border-t border-border pt-3">
              <Text className="text-[13px] text-muted-foreground">• {t('account.deleteBullet1')}</Text>
              <Text className="text-[13px] text-muted-foreground">• {t('account.deleteBullet2')}</Text>
              <Text className="text-[13px] text-muted-foreground">• {t('account.deleteBullet3')}</Text>
            </View>

            <View className="gap-1.5 pt-1">
              <Text className="text-[11px] text-muted-foreground">
                {t('account.deleteConfirmLabel', { email: email ?? '' })}
              </Text>
              <Input
                value={typed}
                onChangeText={setTyped}
                placeholder={email ?? ''}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                editable={!deleting}
              />
            </View>

            {error ? <Text className="text-[13px] text-destructive">{error}</Text> : null}

            <View className="flex-row gap-2 pt-1">
              <Button variant="outline" className="h-12 flex-1" onPress={close} disabled={deleting}>
                <Text className="font-mono text-xs tracking-[2px] text-muted-foreground">
                  {t('common.cancel').toUpperCase()}
                </Text>
              </Button>
              <Button
                variant="destructive"
                className="h-12 flex-1"
                onPress={handleDelete}
                disabled={!confirmed || deleting}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text className="font-mono text-xs tracking-[2px] text-white">
                    {t('account.deleteConfirmCta').toUpperCase()}
                  </Text>
                )}
              </Button>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  )
}
