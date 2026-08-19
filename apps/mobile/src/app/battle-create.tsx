/**
 * Crear una batalla: elegir formato → crear el borrador → abrir la sala.
 *
 * El borrador es la ÚNICA escritura que el cliente hace directamente sobre `battles`
 * (la createRule lo fija a `draft` con `revision = 0`); publicar y todo lo demás pasa
 * por la API del servidor.
 */
import { useEffect, useState } from 'react'
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { X, Swords } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Kicker } from '@/components/ui/kicker'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { useAuthUser } from '@/lib/use-auth-user'
import { BATTLE_PRESETS } from '@calistenia/core/data/battle-presets'
import {
  createBattleDraft,
  findMyActiveBattle,
  publishBattle,
  newIdempotencyKey,
} from '@calistenia/core/lib/battleApi'
import type { Battle } from '@calistenia/core/types/battle'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'

export default function BattleCreateScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()

  const [selected, setSelected] = useState(BATTLE_PRESETS[0].id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Una batalla en curso sobrevive a que se mate la app —el estado vive en el servidor—
  // pero sin esto no habría forma de volver a ella: esta pantalla era el único acceso y
  // solo sabía crear una nueva.
  const [active, setActive] = useState<Battle | null>(null)
  useEffect(() => {
    let alive = true
    findMyActiveBattle()
      .then(battle => { if (alive) setActive(battle) })
      .catch(err => {
        // Sin conexión esto falla y la pantalla sigue sirviendo para crear. Pero no se
        // calla del todo: un fallo de la consulta es indistinguible de "no hay batalla"
        // y así es como una query mal formada se quedó sin tarjeta y sin rastro.
        if (__DEV__) console.warn('[battle] no se pudo buscar la batalla activa:', err)
      })
    return () => { alive = false }
  }, [])

  const handleCreate = async () => {
    const preset = BATTLE_PRESETS.find((p) => p.id === selected)
    if (!preset || !user?.id) return

    setBusy(true)
    setError(null)
    try {
      const battleId = await createBattleDraft(user.id, preset.config)
      // Publicar en el mismo gesto: un borrador sin sala no le sirve a nadie, y así el
      // creador ya tiene su plaza y puede compartir el enlace de inmediato.
      await publishBattle(battleId, newIdempotencyKey())
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.battleCreated, {
        surface: 'battle', source: 'battle_create', battle_id: battleId,
        participant_count: 1, result: 'created', template: preset.id,
      })
      void haptics.success()
      router.replace(`/battle/${battleId}`)
    } catch (e) {
      setError((e as Error).message)
      void haptics.error()
      setBusy(false)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <ScrollView contentContainerClassName="px-4 pb-10">
        <View className="flex-row justify-end pt-2">
          <Pressable
            onPress={() => router.back()}
            className="rounded-full bg-muted/60 p-2 active:opacity-70"
            accessibilityLabel={t('common.back')}
          >
            <X size={18} color="#888899" />
          </Pressable>
        </View>

        <View className="items-center pb-6 pt-2">
          <Swords size={28} color="#a3e635" />
          <Text className="mt-2 font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
            {t('battle.kicker')}
          </Text>
          <Text className="font-bebas text-4xl leading-none text-foreground">{t('battle.newBattle')}</Text>
          <Text className="mt-2 text-center text-sm text-muted-foreground">{t('battle.createHint')}</Text>
        </View>

        {active && (
          <Pressable
            onPress={() => router.replace(`/battle/${active.id}`)}
            className="mb-6 rounded-xl border border-lime/40 bg-lime/5 px-4 py-3.5 active:bg-lime/10"
          >
            <Kicker tone="lime">
              {t('battle.resumeKicker')}
            </Kicker>
            <Text className="mt-1 font-bebas text-2xl leading-none text-foreground">
              {t('battle.resumeAction')}
            </Text>
          </Pressable>
        )}

        <Text className="mb-2 font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
          {t('battle.chooseFormat')}
        </Text>

        <View className="gap-2">
          {BATTLE_PRESETS.map((preset) => {
            const active = preset.id === selected
            return (
              <Pressable
                key={preset.id}
                onPress={() => setSelected(preset.id)}
                className={cn(
                  'rounded-xl border px-4 py-3.5',
                  active ? 'border-lime/40 bg-lime/5' : 'border-border bg-card active:bg-muted/40',
                )}
              >
                <View className="flex-row items-center justify-between">
                  <Text className={cn('font-bebas text-2xl leading-none', active ? 'text-lime' : 'text-foreground')}>
                    {preset.name.es}
                  </Text>
                  <Text className="font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground">
                    ~{preset.estimatedMinutes} min
                  </Text>
                </View>
                <Text className="mt-1 text-xs text-muted-foreground">{preset.description.es}</Text>
              </Pressable>
            )
          })}
        </View>

        {error && (
          <View className="mt-4 rounded-xl border border-red-400/40 bg-red-400/10 px-4 py-3">
            <Text className="text-xs text-red-400">{error}</Text>
          </View>
        )}

        <Pressable
          onPress={() => void handleCreate()}
          disabled={busy || !user?.id}
          className={cn(
            'mt-6 h-14 items-center justify-center rounded-xl bg-lime active:bg-lime/90',
            (busy || !user?.id) && 'opacity-50',
          )}
        >
          {busy
            ? <ActivityIndicator color="#18181b" />
            : (
              <Text className="font-bebas text-xl uppercase tracking-widest text-zinc-900">
                {t('battle.createAndInvite')}
              </Text>
            )}
        </Pressable>

        <Text className="mt-3 text-center font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground">
          {t('battle.needTwoReady')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}
