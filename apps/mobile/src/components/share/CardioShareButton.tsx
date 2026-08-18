/**
 * CardioShareButton — renders CardioShareCard off-screen via ShareCardCapture,
 * prefetches all map tile images so the snapshot isn't blank, then captures +
 * shares the PNG.
 *
 * Usage:
 *   <CardioShareButton session={session} userName={name} referralCode={code} />
 */
import React, { useCallback } from 'react'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { MOBILE_SHARE_CARD_CONTEXTS, shareCardImage, shareCardioSession } from '@/lib/share'
import { formatDuration } from '@calistenia/core/lib/geo'
import type { CardioSession } from '@calistenia/core/types'
import { useShareCardCapture } from '@/hooks/useShareCardCapture'

import ShareCardCapture from '@/components/share/ShareCardCapture'
import CardioShareCard, { cardioTileUrls } from '@/components/share/CardioShareCard'

const CARD_W = 360
const CARD_H = 640

interface CardioShareButtonProps {
  session: CardioSession
  userName?: string
  referralCode?: string | null
  /** Optional label override for the button. */
  label?: string
}

export default function CardioShareButton({
  session,
  userName,
  referralCode,
  label,
}: CardioShareButtonProps) {
  const onCapture = useCallback(
    async (uri: string) => {
      // Build share message.
      const at = session.activity_type
      const activityLabel = at.charAt(0).toUpperCase() + at.slice(1)
      const { message, url } = shareCardioSession({
        userName,
        activityLabel,
        distanceKm: session.distance_km,
        durationLabel: formatDuration(session.duration_seconds),
        sessionId: session.id ?? null,
        referralCode: referralCode ?? null,
      })

      // Share image + track the classified native outcome once.
      await shareCardImage(uri, { message: `${message}\n${url}` }, {
        ...MOBILE_SHARE_CARD_CONTEXTS.cardio,
        activity: session.activity_type,
      })
    },
    [session, userName, referralCode],
  )

  const onError = useCallback((e: unknown) => {
    console.warn('[CardioShareButton] share error', e)
  }, [])

  const { captureRef, share } = useShareCardCapture({
    onCapture,
    prefetchUrls: cardioTileUrls(session, CARD_W, CARD_H),
    onError,
  })

  return (
    <>
      {/* Off-screen capture container — renders behind the real UI */}
      <ShareCardCapture ref={captureRef} width={CARD_W} height={CARD_H}>
        <CardioShareCard
          session={session}
          userName={userName}
          referralCode={referralCode}
          width={CARD_W}
          height={CARD_H}
        />
      </ShareCardCapture>

      {/* Visible button — explicit dark: classes beat the outline variant's
          `dark:bg-input/30`, which would otherwise render this near-black. */}
      <Button
        variant="outline"
        size="sm"
        className="border-sky-500/30 bg-sky-500/5 dark:border-sky-500/30 dark:bg-sky-500/5 active:bg-sky-500/10 dark:active:bg-sky-500/10"
        onPress={() => void share()}
      >
        <Text className="font-mono text-[10px] tracking-widest text-sky-400 uppercase">
          {label ?? 'COMPARTIR'}
        </Text>
      </Button>
    </>
  )
}
