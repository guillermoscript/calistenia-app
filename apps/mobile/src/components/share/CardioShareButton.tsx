/**
 * CardioShareButton — renders CardioShareCard off-screen via ShareCardCapture,
 * prefetches all map tile images so the snapshot isn't blank, then captures +
 * shares the PNG.
 *
 * Usage:
 *   <CardioShareButton session={session} userName={name} referralCode={code} />
 */
import React, { useRef, useCallback } from 'react'
import { Image } from 'expo-image'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { shareImage, shareCardioSession } from '@/lib/share'
import { op } from '@calistenia/core/lib/analytics'
import { formatDuration } from '@calistenia/core/lib/geo'
import type { CardioSession } from '@calistenia/core/types'

import ShareCardCapture, {
  type ShareCardCaptureHandle,
} from '@/components/share/ShareCardCapture'
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
  const captureRef = useRef<ShareCardCaptureHandle>(null)

  const handleShare = useCallback(async () => {
    try {
      // 1. Prefetch all tiles so they're in expo-image cache before capture.
      const urls = cardioTileUrls(session, CARD_W, CARD_H)
      if (urls.length > 0) {
        const PREFETCH_TIMEOUT = 2500
        await Promise.race([
          Promise.all(urls.map((url) => Image.prefetch(url))),
          new Promise<void>((resolve) => setTimeout(resolve, PREFETCH_TIMEOUT)),
        ])
      }

      // 2. Capture to PNG.
      const uri = await captureRef.current?.capture()
      if (!uri) return

      // 3. Build share message.
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

      // 4. Share image.
      await shareImage(uri, { message: `${message}\n${url}` })

      // 5. Track.
      op.track('share_card_shared', {
        card_type: 'cardio',
        activity: session.activity_type,
      })
    } catch (e) {
      console.warn('[CardioShareButton] share error', e)
    }
  }, [session, userName, referralCode])

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
        onPress={() => void handleShare()}
      >
        <Text className="font-mono text-[10px] tracking-widest text-sky-400 uppercase">
          {label ?? 'COMPARTIR'}
        </Text>
      </Button>
    </>
  )
}
