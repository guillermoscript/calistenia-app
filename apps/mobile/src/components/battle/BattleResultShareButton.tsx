/**
 * BattleResultShareButton — pinta la tarjeta de resultado fuera de pantalla, la captura
 * y la comparte (#357).
 *
 * Mismo patrón que el resto de botones de compartir: `useShareCardCapture` mantiene la
 * tarjeta montada fuera de la pantalla para que la vista exista de verdad al capturarla,
 * y un `requestAnimationFrame` antes del disparo evita el PNG en blanco (#488).
 */
import { useCallback } from 'react'
import { useWindowDimensions } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Share2 } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { shareBattleResult, shareBattleResultCard } from '@/lib/share'
import ShareCardCapture from '@/components/share/ShareCardCapture'
import BattleResultShareCard from '@/components/battle/BattleResultShareCard'
import type { BattleResultRow } from '@calistenia/core/lib/battle'
import { useShareCardCapture } from '@/hooks/useShareCardCapture'

export interface BattleResultShareButtonProps {
  battleId: string
  circuitName: string
  rows: BattleResultRow[]
  me: BattleResultRow | null
  contenders: number
  showReps: boolean
  showSeconds: boolean
  headline: string
  userName?: string
  referralCode: string | null
}

export default function BattleResultShareButton({
  battleId,
  circuitName,
  rows,
  me,
  contenders,
  showReps,
  showSeconds,
  headline,
  userName,
  referralCode,
}: BattleResultShareButtonProps) {
  const { t } = useTranslation()
  const { width: screenW, height: screenH } = useWindowDimensions()

  const onCapture = useCallback(
    async (uri: string) => {
      const { message } = shareBattleResult({
        userName,
        circuitName,
        rank: me?.display_rank ?? 0,
        contenders,
        tied: me?.tied ?? false,
        referralCode,
      })

      await shareBattleResultCard(uri, { message, title: t('battle.shareResult') }, {
        battleId,
        participantCount: rows.length,
      })
    },
    [userName, circuitName, me, contenders, referralCode, battleId, rows.length, t],
  )

  const { captureRef, sharing, share } = useShareCardCapture({ onCapture })

  return (
    <>
      <ShareCardCapture ref={captureRef} width={screenW} height={screenH}>
        <BattleResultShareCard
          circuitName={circuitName}
          rows={rows}
          meParticipantId={me?.participant_id ?? null}
          showReps={showReps}
          showSeconds={showSeconds}
          deletedUserLabel={t('battle.deletedUser')}
          headline={headline}
          kicker={t('battle.kicker')}
          width={screenW}
          height={screenH}
        />
      </ShareCardCapture>

      <Button
        variant="outline"
        size="lg"
        className="w-full flex-row items-center justify-center gap-2"
        disabled={sharing}
        onPress={() => void share()}
      >
        <Share2 size={16} color="#a1a1aa" />
        <Text className="font-bebas text-lg tracking-[2px] text-foreground">
          {sharing ? t('battle.sharePreparing') : t('battle.shareResult')}
        </Text>
      </Button>
    </>
  )
}
