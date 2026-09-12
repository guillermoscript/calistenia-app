/**
 * «Copiar a…» del editor móvil (#621): elegir a qué día —o a qué fase— se
 * vuelca lo que ya está montado.
 *
 * Es un sheet propio y no el `OptionSheet` de `ui/` por dos razones. La lista
 * puede tener veinte destinos (siete días por fase) y `OptionSheet` no
 * scrollea, así que se saldría de la pantalla; y ese componente dispara la
 * acción 250 ms **después** de avisar de que se cierra, lo que sirve para
 * elegir «Cámara / Galería» pero no para un flujo con confirmación dentro.
 *
 * La confirmación de sobrescribir vive dentro de este mismo sheet, como en
 * web: encadenar dos `Modal` nativos deja la pantalla en negro un instante en
 * Android mientras la primera ventana se va.
 */
import { useEffect, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { haptics } from '@/lib/haptics'

export interface CopyTargetOption {
  /** Lo que se devuelve al elegir: la clave del día o el índice de la fase. */
  id: string
  label: string
  /** Título del grupo bajo el que se lista (la fase, para los días). */
  group?: string
  /** Ejercicios que ya hay en el destino; 0 se pinta como «vacío». */
  exerciseCount: number
}

interface CopyToSheetProps {
  visible: boolean
  kicker: string
  title: string
  description: string
  targets: CopyTargetOption[]
  onClose: () => void
  onSelect: (id: string) => void
}

export function CopyToSheet({ visible, kicker, title, description, targets, onClose, onSelect }: CopyToSheetProps) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const [pending, setPending] = useState<CopyTargetOption | null>(null)

  // Reabrir no debe reaparecer con la confirmación de la vez anterior a medias.
  useEffect(() => {
    if (!visible) setPending(null)
  }, [visible])

  const choose = (target: CopyTargetOption) => {
    haptics.light()
    // Pisar un destino vacío no destruye nada: no hay nada que confirmar.
    if (target.exerciseCount === 0) {
      onSelect(target.id)
      onClose()
      return
    }
    setPending(target)
  }

  const confirm = () => {
    if (!pending) return
    haptics.success()
    onSelect(pending.id)
    onClose()
  }

  const countLabel = (count: number) =>
    count === 0 ? t('programEditor.copy.empty') : t('programEditor.copy.exerciseCount', { count })

  // Los grupos salen en el orden en que vienen, que es el de `copyDayTargets`:
  // fase por fase y, dentro, en el orden de la semana.
  const groups: { name?: string; options: CopyTargetOption[] }[] = []
  for (const target of targets) {
    const last = groups[groups.length - 1]
    if (last && last.name === target.group) last.options.push(target)
    else groups.push({ name: target.group, options: [target] })
  }

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      {/* anclaje al fondo por style inline: mt-auto de NativeWind no aplicó en device */}
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
        <View
          className="border-t border-border bg-card"
          style={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: insets.bottom + 14, maxHeight: '80%' }}
        >
          <View className="items-center pb-2 pt-3"><View className="h-1 w-9 rounded-full bg-lime/40" /></View>

          {pending ? (
            <>
              <View className="gap-1.5 px-4 pb-3">
                <Text className="font-bebas text-2xl text-foreground">
                  {t('programEditor.copy.overwriteTitle', { target: pending.label })}
                </Text>
                <Text className="text-[13px] leading-5 text-muted-foreground">
                  {t('programEditor.copy.overwriteBody', { target: pending.label })}
                </Text>
              </View>
              <Pressable
                onPress={confirm}
                className="items-center border-t border-border px-4 py-3.5 active:bg-lime/10"
                accessibilityRole="button"
              >
                <Text className="font-sans-medium text-lime">{t('programEditor.copy.overwriteConfirm')}</Text>
              </Pressable>
              <Pressable
                onPress={() => setPending(null)}
                className="items-center border-t border-border px-4 py-3.5 active:bg-muted/20"
                accessibilityRole="button"
              >
                <Text className="font-mono text-xs uppercase tracking-[2px] text-muted-foreground">
                  {t('common.cancel')}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <View className="gap-1 px-4 pb-3">
                <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">{kicker}</Text>
                <Text className="font-bebas text-2xl text-foreground">{title}</Text>
                <Text className="text-[12px] leading-4 text-muted-foreground">{description}</Text>
                <Text className="text-[12px] leading-4 text-muted-foreground/60">
                  {t('programEditor.copy.mediaNote')}
                </Text>
              </View>

              {targets.length === 0 ? (
                <View className="items-center border-t border-border px-4 py-6">
                  <Text className="text-[13px] text-muted-foreground">{t('programEditor.copy.noTargets')}</Text>
                </View>
              ) : (
                <ScrollView>
                  {groups.map((group, gi) => (
                    <View key={group.name ?? gi}>
                      {group.name ? (
                        <Text className="border-t border-border bg-muted/20 px-4 py-1.5 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
                          {group.name}
                        </Text>
                      ) : null}
                      {group.options.map(option => (
                        <Pressable
                          key={option.id}
                          onPress={() => choose(option)}
                          className="flex-row items-center gap-3 border-t border-border px-4 py-3.5 active:bg-lime/10"
                          accessibilityRole="button"
                        >
                          <Text className="flex-1 font-sans-medium text-foreground">{option.label}</Text>
                          <Text className="font-mono text-[10px] text-muted-foreground">
                            {countLabel(option.exerciseCount)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ))}
                </ScrollView>
              )}

              <Pressable
                onPress={onClose}
                className="items-center border-t border-border px-4 py-3.5 active:bg-muted/20"
                accessibilityRole="button"
              >
                <Text className="font-mono text-xs uppercase tracking-[2px] text-muted-foreground">
                  {t('common.cancel')}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  )
}
