/**
 * Version gate — la válvula de escape para cuando la compatibilidad hacia atrás
 * no da más de sí.
 *
 * Dos modos, según lo que diga el servidor (`GET /api/app-config`):
 *
 *   'required' → pantalla BLOQUEANTE a pantalla completa. Se usa cuando el
 *                build instalado es peligroso (un agujero que no se puede
 *                cerrar solo en servidor) o directamente incompatible con el
 *                esquema. No se puede descartar: si se pudiera, no sería un
 *                gate.
 *   'optional' → chip descartable abajo. Se descarta POR BUILD, no para
 *                siempre: si sale otra versión vuelve a aparecer.
 *
 * Fuera de esos dos casos no pinta nada. Y como `evaluateUpdate` falla abierto
 * (sin config, sin red o sin identificar el build → 'ok'), lo normal es que
 * este componente sea invisible.
 */
import { useCallback, useState } from 'react'
import { Linking, Modal, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { ArrowUpCircle, X } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { syncStorage } from '@/lib/storage'
import { useAppConfig } from '@calistenia/core/hooks/useAppConfig'

/** Build cuyo aviso suave ya descartó el usuario. */
const DISMISSED_KEY = 'calistenia_update_notice_dismissed_build'

export default function UpdateGate() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { status, latestVersion, storeUrl, messageKey, config } = useAppConfig()
  const [dismissed, setDismissed] = useState(
    () => syncStorage.getItem(DISMISSED_KEY) ?? '',
  )

  const openStore = useCallback(() => {
    if (!storeUrl) return
    Linking.openURL(storeUrl).catch(() => { /* sin navegador o URL rota */ })
  }, [storeUrl])

  // El motivo lo manda el servidor como CLAVE i18n, no como texto: el servidor
  // no sabe en qué idioma tiene la app este usuario. Si la clave no existe en
  // los locales, i18next devolvería la clave cruda ("update.reasonX") y la
  // pintaríamos tal cual — por eso se comprueba antes con `i18n.exists`.
  const reason = messageKey && t(messageKey) !== messageKey ? t(messageKey) : ''

  if (status === 'required') {
    return (
      <Modal visible transparent={false} animationType="fade" statusBarTranslucent>
        <View className="flex-1 items-center justify-center gap-6 bg-background px-8">
          <ArrowUpCircle size={64} color="#a3e635" strokeWidth={1.5} />

          <View className="items-center gap-3">
            <Text className="text-center font-bebas text-4xl uppercase tracking-wide">
              {t('update.requiredTitle')}
            </Text>
            <Text className="text-center text-base text-muted-foreground">
              {reason || t('update.requiredBody')}
            </Text>
            {!!latestVersion && (
              <Text className="font-mono text-xs text-muted-foreground">
                {t('update.latestVersion', { version: latestVersion })}
              </Text>
            )}
          </View>

          {/* Sin store_url no hay botón que valga: se enseña el aviso a secas
              en vez de un CTA que no lleva a ninguna parte. */}
          {!!storeUrl && (
            <Button variant="limeSolid" size="lg" className="w-full" onPress={openStore}>
              <Text>{t('update.cta')}</Text>
            </Button>
          )}
        </View>
      </Modal>
    )
  }

  const currentLatest = String(config?.latest_build ?? 0)
  if (status !== 'optional' || dismissed === currentLatest) return null

  return (
    <View
      className="absolute inset-x-0 bottom-0 z-40 items-center px-4"
      style={{ paddingBottom: insets.bottom + 12 }}
    >
      <View className="w-full flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
        <ArrowUpCircle size={20} color="#a3e635" strokeWidth={2} />
        <View className="flex-1 shrink">
          <Text className="text-sm font-semibold" numberOfLines={1}>
            {t('update.optionalTitle')}
          </Text>
          {!!latestVersion && (
            <Text className="font-mono text-[11px] text-muted-foreground" numberOfLines={1}>
              {t('update.latestVersion', { version: latestVersion })}
            </Text>
          )}
        </View>
        {!!storeUrl && (
          <Button variant="limeSolid" size="sm" className="shrink-0" onPress={openStore}>
            <Text>{t('update.ctaShort')}</Text>
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          accessibilityLabel={t('common.close')}
          onPress={() => {
            syncStorage.setItem(DISMISSED_KEY, currentLatest)
            setDismissed(currentLatest)
          }}
        >
          <X size={16} color="#a1a1aa" strokeWidth={2} />
        </Button>
      </View>
    </View>
  )
}
