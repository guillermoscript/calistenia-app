/**
 * Tu circuito ha terminado pero la batalla sigue viva (#404).
 *
 * Antes esto no existía: la pantalla seguía enseñando el ejercicio, el contador de reps y
 * un botón apagado. Un control deshabilitado no es un estado, es la misma pantalla rota.
 * Aquí el reloj se congela en tu final, el marcador sigue vivo —que es justo lo
 * interesante mientras esperas— y hay una salida, porque la batalla no te necesita
 * mirando para seguir su curso.
 */
import { View, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { useBattleContext } from '@/contexts/BattleContext'
import BattleStandingsList from '@/components/battle/BattleStandingsList'
import { battleSpanMs, battleWorkColumns, formatBattleElapsed } from '@calistenia/core/lib/battle'

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <View className={cn('flex-1', className)}>
      <Text className="font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">
        {label}
      </Text>
      <Text className="font-bebas text-3xl leading-none text-foreground">{value}</Text>
    </View>
  )
}

export default function BattleFinishedWaiting() {
  const { t } = useTranslation()
  const router = useRouter()
  const { snapshot, standings } = useBattleContext()

  const me = snapshot?.me ?? null
  const config = snapshot?.battle.config
  if (!snapshot || !config || !me) return null

  const walkedAway = me.status === 'left'
  const mine = standings.find((entry) => entry.user === me.user) ?? null
  // El reloj se para donde paraste tú, no donde va la batalla.
  const elapsed = battleSpanMs(snapshot.battle.starts_at, walkedAway ? me.left_at : me.finished_at)
  const stillGoing = standings.filter((entry) => entry.status === 'active').length

  // El resumen enseña las unidades del circuito, no siempre reps: tras una batalla de
  // plancha, "REPS 0" contaba el esfuerzo como si no hubiera existido (#426).
  const columns = battleWorkColumns(config)
  const stats = mine
    ? [
      { label: t('battle.position'), value: `#${mine.rank}` },
      { label: t('battle.roundsDone'), value: String(mine.score.completed_rounds) },
      ...(columns.reps
        ? [{ label: t('battle.reps'), value: String(mine.score.completed_reps) }]
        : []),
      ...(columns.seconds
        ? [{ label: t('battle.timeDone'), value: `${mine.score.completed_time_seconds}s` }]
        : []),
      { label: t('battle.elapsed'), value: formatBattleElapsed(elapsed) },
    ]
    : []

  // Una batalla abierta por deep link puede no tener a dónde volver.
  const leave = () => {
    if (router.canGoBack()) router.back()
    else router.replace('/(tabs)')
  }

  return (
    <View className="flex-1">
      <View className="border-b border-border pb-4 pt-2">
        <Text className="font-mono text-[9px] uppercase tracking-[3px] text-lime">
          {t('battle.stillLive')}
        </Text>
        <Text className="font-bebas text-5xl leading-none text-foreground">
          {walkedAway ? t('battle.youLeftTitle') : t('battle.youFinishedTitle')}
        </Text>
      </View>

      {!walkedAway && mine ? (
        // Cinco stats no caben en una fila de móvil, así que con circuito mixto se les
        // pone un ancho mínimo y bajan a dos filas (#426). Uno todo-reps sigue en cuatro
        // columnas, exactamente como hasta ahora.
        <View className="flex-row flex-wrap gap-3 border-b border-border py-4">
          {stats.map((stat) => (
            <Stat
              key={stat.label}
              label={stat.label}
              value={stat.value}
              className={stats.length > 4 ? 'min-w-[28%]' : undefined}
            />
          ))}
        </View>
      ) : null}

      <Text className="py-4 font-sans text-sm text-muted-foreground">
        {stillGoing > 0 ? t('battle.waitingForOthers') : t('battle.waitingClosing')}
      </Text>

      <Pressable
        onPress={leave}
        className="h-14 items-center justify-center rounded-xl border border-border active:bg-muted/40"
      >
        <Text className="font-bebas text-xl uppercase tracking-widest text-foreground">
          {t('battle.leaveScreen')}
        </Text>
      </Pressable>
      <Text className="mt-2 text-center font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">
        {t('battle.leaveScreenHint')}
      </Text>

      <Text className="mb-2 mt-6 font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
        {t('battle.liveStandings')}
      </Text>
      <BattleStandingsList standings={standings} config={config} meUserId={me.user} />
    </View>
  )
}
