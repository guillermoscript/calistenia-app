/**
 * Tu circuito ha terminado pero la batalla sigue viva (#404).
 *
 * Antes esto no existía: la pantalla seguía enseñando el ejercicio, el contador de reps y
 * un botón apagado. Un control deshabilitado no es un estado, es la misma pantalla rota.
 * Aquí el reloj se congela en tu final, el marcador sigue vivo —que es justo lo
 * interesante mientras esperas— y hay una salida, porque la batalla no te necesita
 * mirando para seguir su curso.
 *
 * El orden de la pantalla se rehízo en #432: enseñaba los datos correctos con la
 * jerarquía invertida. Lo más grande era "HAS TERMINADO", que es lo único que el usuario
 * ya sabe —acaba de pulsar el botón que abre esta pantalla—; el puesto, que es la
 * noticia, era una celda más entre cinco números idénticos y sin denominador; y el
 * marcador vivo iba el último, detrás del texto de espera, un botón y una nota al pie.
 * Ahora manda el puesto (con denominador, en lime cuando vas primero), el marcador sube
 * justo debajo y tu marca congelada cierra la pantalla. La salida ya no imita un botón
 * primario fallido: es un enlace, y dice a dónde va en lugar de nombrar el mecanismo.
 */
import { View, Pressable, ScrollView } from 'react-native'
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { useBattleContext } from '@/contexts/BattleContext'
import BattleStandingsList from '@/components/battle/BattleStandingsList'
import {
  battleDisplayRanks,
  battleSpanMs,
  battleWorkColumns,
  formatBattleElapsed,
} from '@calistenia/core/lib/battle'

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <View className={className}>
      <Text className="font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">
        {label}
      </Text>
      <Text className="font-bebas text-2xl leading-none text-foreground">{value}</Text>
    </View>
  )
}

export default function BattleFinishedWaiting() {
  const { t } = useTranslation()
  const router = useRouter()
  const reduced = useReducedMotion()
  const { snapshot, standings } = useBattleContext()

  const me = snapshot?.me ?? null
  const config = snapshot?.battle.config
  if (!snapshot || !config || !me) return null

  const walkedAway = me.status === 'left'
  const mine = standings.find((entry) => entry.user === me.user) ?? null
  // El reloj se para donde paraste tú, no donde va la batalla.
  const elapsed = battleSpanMs(snapshot.battle.starts_at, walkedAway ? me.left_at : me.finished_at)
  const stillGoing = standings.filter((entry) => entry.status === 'active').length

  // Ser primero de dos y primero de ocho no son la misma noticia, así que el puesto va
  // con denominador reutilizando la misma fórmula que el historial (#432). Quien se sale
  // no tiene puesto que enseñar, y la cabecera vuelve a nombrar el estado.
  const myStanding = walkedAway ? null : mine
  // Puesto con los empates resueltos, el mismo que enseñarán resultados e historial (#453).
  const myRank = myStanding
    ? battleDisplayRanks(standings).get(myStanding.participant_id) ?? myStanding.rank
    : null
  const title = myRank !== null
    ? t('battle.rankOf', { rank: myRank, total: standings.length })
    : walkedAway ? t('battle.youLeftTitle') : t('battle.youFinishedTitle')
  const kicker = myStanding ? t('battle.position') : t('battle.stillLive')
  const leading = myRank === 1

  // El resumen enseña las unidades del circuito, no siempre reps: tras una batalla de
  // plancha, "REPS 0" contaba el esfuerzo como si no hubiera existido (#426).
  //
  // El puesto ya no está aquí —es el titular—, así que como mucho quedan cuatro celdas y
  // la fila vuelve a tener una rejilla estable: tres o menos reparten a partes iguales,
  // cuatro caen en dos filas de dos con la misma anchura de columna (#432).
  const columns = battleWorkColumns(config)
  const stats = myStanding
    ? [
      { label: t('battle.roundsDone'), value: String(myStanding.score.completed_rounds) },
      ...(columns.reps
        ? [{ label: t('battle.reps'), value: String(myStanding.score.completed_reps) }]
        : []),
      // "SEGUNDOS 150s" repetía la unidad y se leía igual que el cronómetro de al lado,
      // que no puntúa. Las etiquetas dicen ahora cuál es trabajo y cuál es reloj.
      ...(columns.seconds
        ? [{ label: t('battle.workDone'), value: `${myStanding.score.completed_time_seconds}s` }]
        : []),
      { label: t('battle.duration'), value: formatBattleElapsed(elapsed) },
    ]
    : []

  // Una batalla abierta por deep link puede no tener a dónde volver.
  const leave = () => {
    if (router.canGoBack()) router.back()
    else router.replace('/(tabs)')
  }

  return (
    // El scroll es de la pantalla, no del marcador: con dos participantes un marcador
    // estirado dejaba un vacío enorme entre la última fila y el resto (#432).
    <ScrollView className="flex-1" contentContainerClassName="pb-6" showsVerticalScrollIndicator={false}>
      <Animated.View
        entering={reduced ? undefined : FadeInDown.duration(420)}
        className="border-b border-border pb-4 pt-2"
      >
        <Text className="font-mono text-[9px] uppercase tracking-[3px] text-lime">{kicker}</Text>
        <Text
          className={cn(
            'font-bebas text-5xl leading-none',
            leading ? 'text-lime' : 'text-foreground',
          )}
        >
          {title}
        </Text>
        <Text className="mt-2 font-sans text-sm text-muted-foreground">
          {stillGoing > 0 ? t('battle.waitingForOthers') : t('battle.waitingClosing')}
        </Text>
      </Animated.View>

      <Text className="mb-2 mt-5 font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
        {t('battle.liveStandings')}
      </Text>
      <BattleStandingsList standings={standings} config={config} meUserId={me.user} scroll={false} />

      {myStanding ? (
        <View className="mt-5">
          <Text className="mb-3 font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
            {t('battle.yourScore')}
          </Text>
          <View className="flex-row flex-wrap gap-x-3 gap-y-4">
            {stats.map((stat) => (
              <Stat
                key={stat.label}
                label={stat.label}
                value={stat.value}
                className={stats.length > 3 ? 'w-[47%]' : 'flex-1'}
              />
            ))}
          </View>
        </View>
      ) : null}

      {/* "Salir" es la palabra que en el lobby significa abandonar la batalla, así que
          aquí el verbo nombra el destino y no el mecanismo. Enlace y no botón: lo que
          hay que hacer en esta pantalla es esperar, no salir. */}
      <Pressable
        onPress={leave}
        className="mt-6 h-14 items-center justify-center border-t border-border active:bg-lime/10"
      >
        <Text className="font-bebas text-xl uppercase tracking-widest text-lime">
          {t('battle.leaveScreen')}
        </Text>
      </Pressable>
      <Text className="text-center font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">
        {t('battle.leaveScreenHint')}
      </Text>
    </ScrollView>
  )
}
