/**
 * ProgressShareButton — renders ProgressPhotoShareCard off-screen via
 * ShareCardCapture, prefetches both photos so the snapshot isn't blank, then
 * captures + shares the PNG. Compact lime button styled for the comparator
 * header.
 */
import React, { useRef, useCallback, useState } from 'react'
import { ActivityIndicator } from 'react-native'
import { Image } from 'expo-image'
import { useTranslation } from 'react-i18next'
import { Share2 } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { shareImage } from '@/lib/share'
import { useAuthUser } from '@/lib/use-auth-user'
import { Sentry } from '@/lib/instrument'
import { op } from '@calistenia/core/lib/analytics'
import type { BodyPhoto } from '@calistenia/core/hooks/useBodyPhotos'

import ShareCardCapture, {
  type ShareCardCaptureHandle,
} from '@/components/share/ShareCardCapture'
import ProgressPhotoShareCard from '@/components/progress/ProgressPhotoShareCard'

const CARD_W = 360
const CARD_H = 640
const LIME = 'hsl(74 90% 57%)'

interface Props {
  before: BodyPhoto
  after: BodyPhoto
}

export default function ProgressShareButton({ before, after }: Props) {
  const { t } = useTranslation()
  const user = useAuthUser()
  const captureRef = useRef<ShareCardCaptureHandle>(null)
  const [busy, setBusy] = useState(false)

  const labels = {
    before: t('progress.bodyPhotos.before'),
    after: t('progress.bodyPhotos.after'),
    transformation: t('progress.bodyPhotos.transformation'),
    days: t('progress.bodyPhotos.days'),
    weeks: t('progress.bodyPhotos.weeks'),
    sameDay: t('progress.bodyPhotos.sameDay'),
  }

  const handleShare = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      // Prefetch both photos into expo-image cache before capture.
      const PREFETCH_TIMEOUT = 2500
      await Promise.race([
        Promise.all([Image.prefetch(before.url), Image.prefetch(after.url)]),
        new Promise<void>((resolve) => setTimeout(resolve, PREFETCH_TIMEOUT)),
      ])

      const uri = await captureRef.current?.capture()
      if (!uri) return

      await shareImage(uri, { title: t('progress.bodyPhotos.share') })
      op.track('share_card_shared', { card_type: 'progress_photo' })
    } catch (e) {
      Sentry.captureException(e)
    } finally {
      setBusy(false)
    }
  }, [busy, before.url, after.url, t])

  return (
    <>
      {/* Off-screen capture container */}
      <ShareCardCapture ref={captureRef} width={CARD_W} height={CARD_H}>
        <ProgressPhotoShareCard
          before={before}
          after={after}
          userName={user?.name as string | undefined}
          labels={labels}
          width={CARD_W}
          height={CARD_H}
        />
      </ShareCardCapture>

      <Button
        variant="outline"
        size="sm"
        className="border-lime/30 bg-lime/5 active:bg-lime/10 dark:border-lime/30 dark:bg-lime/5"
        onPress={() => void handleShare()}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator size="small" color={LIME} />
        ) : (
          <Share2 size={14} color={LIME} />
        )}
        <Text className="font-mono text-[10px] uppercase tracking-widest text-lime">
          {t('progress.bodyPhotos.share')}
        </Text>
      </Button>
    </>
  )
}
