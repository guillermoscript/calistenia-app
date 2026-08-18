/**
 * BattleResultShareCard — la imagen que se comparte de una batalla terminada (#357).
 *
 * Lo que puede salir aquí está acotado por privacidad, no por diseño: el resultado de
 * una batalla solo lo pueden leer sus participantes (`battles.viewRule`), así que esta
 * tarjeta es la ÚNICA forma en que sale del grupo. Lleva el nombre público y la marca de
 * cada uno y nada más — ni avatares remotos, ni ids, ni por supuesto el token de
 * invitación, que es de un solo uso y se reenviaría con la imagen.
 *
 * Usa `StyleSheet` y una paleta oscura fija en vez de NativeWind, igual que el resto de
 * tarjetas: se captura a píxeles con `react-native-view-shot` y tiene que salir igual en
 * un móvil en modo claro que en uno en oscuro.
 */
import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

import type { BattleResultRow } from '@calistenia/core/lib/battle'

/** Mismos valores que el resto de tarjetas compartibles. */
const C = {
  bg: '#09090b',
  cardBg: '#18181b',
  border: '#27272a',
  fg: '#fafafa',
  fgDim: '#a1a1aa',
  fgMuted: '#52525b',
  lime: '#a3e635',
  limeFaint: 'rgba(163,230,53,0.09)',
}

/** Cuánta gente cabe antes de resumir. Más filas y no se lee ninguna. */
const MAX_ROWS = 6

export interface BattleResultShareCardProps {
  circuitName: string
  rows: BattleResultRow[]
  /** Fila del que comparte, para destacarla. */
  meParticipantId: string | null
  showReps: boolean
  showSeconds: boolean
  /** Etiqueta ya traducida para una cuenta borrada. */
  deletedUserLabel: string
  headline: string
  kicker: string
  width?: number
  height?: number
}

function scoreLine(row: BattleResultRow, showReps: boolean, showSeconds: boolean): string {
  const parts = [`${row.score.completed_rounds}R`]
  if (showReps) parts.push(`${row.score.completed_reps} reps`)
  if (showSeconds) parts.push(`${row.score.completed_time_seconds}s`)
  return parts.join('  ')
}

function BattleResultShareCard({
  circuitName,
  rows,
  meParticipantId,
  showReps,
  showSeconds,
  deletedUserLabel,
  headline,
  kicker,
  width = 360,
  height = 640,
}: BattleResultShareCardProps) {
  const shown = rows.slice(0, MAX_ROWS)
  const hidden = rows.length - shown.length

  return (
    <View style={[styles.card, { width, height }]} collapsable={false}>
      <View style={styles.topLine} />

      <View style={styles.header}>
        <Text style={styles.kicker}>{kicker}</Text>
        <Text style={styles.headline} numberOfLines={2}>{headline}</Text>
        <Text style={styles.circuit} numberOfLines={1}>{circuitName}</Text>
      </View>

      <View style={styles.list}>
        {shown.map((row) => {
          const mine = row.participant_id === meParticipantId
          return (
            <View key={row.participant_id} style={[styles.row, mine && styles.rowMine]}>
              <Text style={[styles.rank, row.display_rank === 1 && styles.rankTop]}>
                {row.display_rank}
              </Text>
              <Text style={[styles.name, mine && styles.nameMine]} numberOfLines={1}>
                {row.deleted_user ? deletedUserLabel : row.display_name}
              </Text>
              <Text style={styles.score}>{scoreLine(row, showReps, showSeconds)}</Text>
            </View>
          )
        })}
        {hidden > 0 ? <Text style={styles.more}>+{hidden}</Text> : null}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>gym.guille.tech</Text>
      </View>
    </View>
  )
}

export default BattleResultShareCard

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.bg,
    paddingHorizontal: 28,
    paddingTop: 56,
    paddingBottom: 32,
    justifyContent: 'space-between',
  },
  topLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: C.lime,
  },
  header: { gap: 8 },
  kicker: {
    color: C.fgMuted,
    fontSize: 10,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  headline: {
    color: C.fg,
    fontSize: 40,
    lineHeight: 42,
  },
  circuit: {
    color: C.fgDim,
    fontSize: 14,
  },
  list: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  rowMine: {
    backgroundColor: C.limeFaint,
  },
  rank: {
    color: C.fgMuted,
    fontSize: 20,
    width: 26,
  },
  rankTop: { color: C.lime },
  // En RN un hijo largo NO encoge por defecto y empuja al hermano fuera de la tarjeta:
  // el nombre necesita `flex: 1` y la marca `flexShrink: 0` para que se recorte el
  // nombre y no desaparezcan los números.
  name: {
    color: C.fg,
    fontSize: 15,
    flex: 1,
  },
  nameMine: { color: C.lime },
  score: {
    color: C.fgDim,
    fontSize: 12,
    flexShrink: 0,
  },
  more: {
    color: C.fgMuted,
    fontSize: 12,
    paddingTop: 8,
    paddingHorizontal: 12,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 16,
  },
  footerText: {
    color: C.fgMuted,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
})
