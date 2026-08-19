/**
 * Resultado de la batalla (#357).
 *
 * Sustituye a la pantalla mínima del MVP. Tres cosas la definen:
 *
 * - **El resultado es estable.** Se lee de `final_standings`, la clasificación que el
 *   servidor congela una sola vez al cerrar la batalla (#398), así que abrirla desde el
 *   historial seis meses después enseña exactamente lo mismo que se vio al terminar. No
 *   hay refetch ni suscripción que fugar, porque no hay nada que pueda cambiar.
 * - **Los empates comparten puesto.** El servidor siempre ordena hasta el final con
 *   `tie_break_key`, que es arbitrario; `battleResultView` colapsa esos empates para que
 *   dos marcas idénticas no salgan como un ganador y un perdedor.
 * - **No se avergüenza a nadie.** Terminar es el logro; ganar es un extra. Quien se salió
 *   sale marcado como que se salió, no ranqueado con ceros, y a quien se queda solo se le
 *   celebra el circuito en vez de decirle que ha ganado a nadie.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, ScrollView, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { RotateCcw } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Kicker } from '@/components/ui/kicker'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { useAuthUser } from '@/lib/use-auth-user'
import { useBattleContext } from '@/contexts/BattleContext'
import BattleScoreCell from '@/components/battle/BattleScoreCell'
import BattleResultShareButton from '@/components/battle/BattleResultShareButton'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'
import { battleResultView, battleWorkColumns, type BattleResultRow } from '@calistenia/core/lib/battle'
import { findBattlePreset } from '@calistenia/core/data/battle-presets'

export default function BattleResults() {
  const { t } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()
  const { snapshot, standings, phase, isCreator, busy, actions } = useBattleContext()
  const [rematching, setRematching] = useState(false)

  const userId = user?.id ?? null
  const result = useMemo(
    () => battleResultView(snapshot?.battle ?? null, standings, userId),
    [snapshot?.battle, standings, userId],
  )

  // Un solo `battle_completed` por batalla, no uno por cliente: lo emite el dispositivo
  // del creador cuando ve el estado terminal, igual que hace el flujo de carreras.
  const completedRef = useRef(false)
  useEffect(() => {
    if (phase !== 'finished' || !isCreator || completedRef.current || !snapshot) return
    completedRef.current = true
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.battleCompleted, {
      surface: 'battle', source: 'battle_results', battle_id: snapshot.battle.id,
      participant_count: snapshot.participants.length, result: 'completed',
    })
  }, [phase, isCreator, snapshot])

  // `battle_results_viewed` es lo contrario: uno por espectador, porque la pregunta que
  // responde es si alguien llega a mirar el resultado que se ha ganado. Se ata al id de
  // la batalla para que volver desde el historial a OTRA batalla vuelva a contar.
  const viewedRef = useRef<string | null>(null)
  const battleId = snapshot?.battle.id ?? null
  useEffect(() => {
    if (!battleId || result.state === 'open' || viewedRef.current === battleId) return
    viewedRef.current = battleId
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.battleResultsViewed, {
      surface: 'battle', source: 'battle_results', battle_id: battleId,
      participant_count: result.rows.length, result: result.outcome,
    })
  }, [battleId, result.state, result.outcome, result.rows.length])

  // Las columnas del marcador salen del circuito, no de los números (#426): una batalla
  // con plancha enseña los segundos que aguantó cada uno.
  const columns = battleWorkColumns(snapshot?.battle.config)
  const preset = findBattlePreset(snapshot?.battle.config?.workout_template_id ?? '')
  const circuitName = preset?.name.es ?? t('battle.title')

  const headline = headlineFor(t, result.state, result.outcome)

  const handleRematch = useCallback(() => {
    if (rematching) return
    setRematching(true)
    void actions.rematch()
      .then((next) => {
        void haptics.medium()
        // Volver a invitar a los de siempre ES la invitación de esta pantalla: el
        // servidor emite un token nominal por cabeza y lo manda por push.
        const invited = Math.max(0, result.rows.length - 1)
        if (invited > 0) {
          trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.inviteSent, {
            surface: 'battle', source: 'battle_results', battle_id: next.battle.id,
            share_type: 'rematch_invite', participant_count: invited,
            result: 'sent', share_confirmed: false,
          })
        }
        trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.battleRematchCreated, {
          surface: 'battle', source: 'battle_results', battle_id: next.battle.id,
          participant_count: result.rows.length, result: 'created',
        })
        router.replace(`/battle/${next.battle.id}`)
      })
      .catch(() => {
        Alert.alert(t('battle.rematch'), t('battle.rematchError'))
      })
      .finally(() => setRematching(false))
  }, [rematching, actions, result.rows.length, router, t])

  const busyRematch = rematching || busy

  return (
    <View className="flex-1 gap-5 pt-4">
      <View className="items-center">
        <Kicker>
          {t('battle.kicker')}
        </Kicker>
        <Text className="mt-2 text-center font-bebas text-4xl leading-none text-foreground">
          {headline}
        </Text>
        <Text className="mt-1 text-center text-sm text-muted-foreground" numberOfLines={1}>
          {circuitName}
        </Text>
        {result.state === 'expired' ? (
          <Text className="mt-2 text-center text-sm text-muted-foreground">
            {t('battle.expiredHint')}
          </Text>
        ) : null}
        {result.outcome === 'solo' ? (
          <Text className="mt-2 text-center text-sm text-muted-foreground">
            {t('battle.soloHint')}
          </Text>
        ) : null}
      </View>

      <ScrollView className="flex-1" contentContainerClassName="pb-2">
        {result.state === 'no_result' ? (
          <Text className="px-1 py-6 text-center text-sm text-muted-foreground">
            {t('battle.noStoredResult')}
          </Text>
        ) : (
          <>
            <Text className="mb-2 font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
              {t('battle.finalStandings')}
            </Text>
            {result.rows.map((row) => (
              <BattleResultRowView
                key={row.participant_id}
                row={row}
                mine={row.participant_id === result.me?.participant_id}
                showReps={columns.reps}
                showSeconds={columns.seconds}
              />
            ))}
          </>
        )}
      </ScrollView>

      <View className="gap-3">
        {result.state === 'finished' && result.rows.length > 0 ? (
          <BattleResultShareButton
            battleId={snapshot?.battle.id ?? ''}
            circuitName={circuitName}
            rows={result.rows}
            me={result.me}
            contenders={result.contenders}
            showReps={columns.reps}
            showSeconds={columns.seconds}
            headline={headline}
            userName={(user?.display_name as string | undefined) ?? undefined}
            referralCode={(user?.referral_code as string | undefined) ?? null}
          />
        ) : null}

        <Button
          variant="limeSolid"
          size="lg"
          className="w-full flex-row items-center justify-center gap-2"
          disabled={busyRematch}
          onPress={handleRematch}
        >
          <RotateCcw size={16} color="#0a0a0a" />
          <Text className="font-bebas text-lg uppercase tracking-widest">
            {rematching ? t('battle.rematchCreating') : t('battle.rematch')}
          </Text>
        </Button>

        <Button
          variant="ghost"
          size="lg"
          className="w-full"
          onPress={() => router.replace('/(tabs)')}
        >
          <Text className="font-bebas text-lg uppercase tracking-widest text-muted-foreground">
            {t('common.close')}
          </Text>
        </Button>
      </View>
    </View>
  )
}

/**
 * El titular. Se elige por estado y por cómo le fue a quien mira, no por el puesto: el
 * mismo 2.º puesto es "buen intento" en una batalla de tres y otra cosa en una de dos.
 */
function headlineFor(
  t: (key: string) => string,
  state: ReturnType<typeof battleResultView>['state'],
  outcome: ReturnType<typeof battleResultView>['outcome'],
): string {
  if (state === 'cancelled') return t('battle.cancelledTitle')
  if (state === 'expired') return t('battle.expiredTitle')
  if (state === 'no_result') return t('battle.finishedTitle')
  switch (outcome) {
    case 'won': return t('battle.wonTitle')
    case 'tied': return t('battle.tiedTitle')
    case 'solo': return t('battle.soloTitle')
    case 'left': return t('battle.youLeftTitle')
    case 'placed': return t('battle.finishedTitle')
    default: return t('battle.finishedTitle')
  }
}

interface BattleResultRowViewProps {
  row: BattleResultRow
  mine: boolean
  showReps: boolean
  showSeconds: boolean
}

/**
 * Una fila del resultado. Memoizada por lo mismo que la de la clasificación en vivo: el
 * resultado no cambia, pero la pantalla sí se repinta mientras se prepara la tarjeta que
 * se comparte, y no hace falta arrastrar la lista entera en cada repintado.
 */
const BattleResultRowView = memo(function BattleResultRowView({
  row, mine, showReps, showSeconds,
}: BattleResultRowViewProps) {
  const { t } = useTranslation()
  const left = row.status === 'left'

  return (
    <View
      className={cn(
        'flex-row items-center gap-3 border-b border-border py-3',
        mine && 'bg-lime/5',
      )}
    >
      <View className="w-9 flex-row items-baseline">
        <Text
          className={cn(
            'font-bebas text-2xl',
            row.display_rank === 1 && !left ? 'text-lime' : 'text-muted-foreground',
          )}
        >
          {row.display_rank}
        </Text>
        {/* El "=" es lo que distingue un empate de dos filas seguidas por casualidad. */}
        {row.tied ? <Text className="ml-0.5 font-mono text-[10px] text-muted-foreground">=</Text> : null}
      </View>

      <View className="flex-1 shrink">
        <Text
          className={cn(
            'font-sans-medium',
            row.deleted_user ? 'italic text-muted-foreground' : 'text-foreground',
            left && 'text-muted-foreground',
          )}
          numberOfLines={1}
        >
          {row.deleted_user ? t('battle.deletedUser') : (row.display_name || t('battle.someone'))}
        </Text>
        {left ? (
          <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
            {t('battle.leftTag')}
          </Text>
        ) : null}
      </View>

      <BattleScoreCell
        rounds={row.score.completed_rounds}
        reps={row.score.completed_reps}
        seconds={row.score.completed_time_seconds}
        showReps={showReps}
        showSeconds={showSeconds}
        className="shrink-0"
      />
    </View>
  )
})
