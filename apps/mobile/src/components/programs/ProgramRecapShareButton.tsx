/**
 * Compartir el resumen del programa (#941): pinta `ProgramRecapShareCard` fuera
 * de pantalla, la captura y la comparte. Mismo patrón que `ProgressShareButton`.
 */
import React, { useCallback } from 'react'
import { ActivityIndicator } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Share2 } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { MOBILE_SHARE_CARD_CONTEXTS, shareCardImage } from '@/lib/share'
import { Sentry } from '@/lib/instrument'
import { useShareCardCapture } from '@/hooks/useShareCardCapture'
import ShareCardCapture from '@/components/share/ShareCardCapture'
import ProgramRecapShareCard, { type ProgramRecapShareCardProps } from '@/components/programs/ProgramRecapShareCard'

const CARD_W = 360
const CARD_H = 640
const LIME = 'hsl(74 90% 57%)'

type Props = Omit<ProgramRecapShareCardProps, 'width' | 'height' | 'labels'> & { shareText: string }

export default function ProgramRecapShareButton({ shareText, ...card }: Props) {
  const { t } = useTranslation()

  const onCapture = useCallback(async (uri: string) => {
    await shareCardImage(uri, { title: card.title, message: shareText }, { ...MOBILE_SHARE_CARD_CONTEXTS.programRecap })
  }, [card.title, shareText])

  const onError = useCallback((e: unknown) => { Sentry.captureException(e) }, [])

  const { captureRef, sharing, share } = useShareCardCapture({ onCapture, onError })

  return (
    <>
      <ShareCardCapture ref={captureRef} width={CARD_W} height={CARD_H}>
        <ProgramRecapShareCard
          {...card}
          width={CARD_W}
          height={CARD_H}
          labels={{
            kicker: t('programRecap.kicker'),
            compareTitle: t('programRecap.compareTitle'),
            units: { reps: t('programRecap.unit.reps'), s: t('programRecap.unit.s'), kg: t('programRecap.unit.kg') },
          }}
        />
      </ShareCardCapture>
      <Button
        variant="outline"
        className="min-h-12 flex-row gap-2 border-lime/30 active:bg-lime/10"
        onPress={() => void share()}
        disabled={sharing}
      >
        {sharing ? <ActivityIndicator size="small" color={LIME} /> : <Share2 size={16} color={LIME} />}
        <Text className="font-mono text-[11px] uppercase tracking-[2px] text-lime">{t('programRecap.share')}</Text>
      </Button>
    </>
  )
}
