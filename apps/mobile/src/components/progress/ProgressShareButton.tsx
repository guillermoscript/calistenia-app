/**
 * ProgressShareButton — renders ProgressPhotoShareCard off-screen via
 * ShareCardCapture, prefetches both photos so the snapshot isn't blank, then
 * captures + shares the PNG. Compact lime button styled for the comparator
 * header.
 */
import React, { useCallback } from 'react'
import { ActivityIndicator } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Share2 } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { MOBILE_SHARE_CARD_CONTEXTS, shareCardImage } from '@/lib/share'
import { useAuthUser } from '@/lib/use-auth-user'
import { Sentry } from '@/lib/instrument'
import type { BodyPhoto } from '@calistenia/core/hooks/useBodyPhotos'
import { useShareCardCapture } from '@/hooks/useShareCardCapture'

import ShareCardCapture from '@/components/share/ShareCardCapture'
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

  const labels = {
    before: t('progress.bodyPhotos.before'),
    after: t('progress.bodyPhotos.after'),
    transformation: t('progress.bodyPhotos.transformation'),
    days: t('progress.bodyPhotos.days'),
    weeks: t('progress.bodyPhotos.weeks'),
    sameDay: t('progress.bodyPhotos.sameDay'),
  }

  const onCapture = useCallback(
    async (uri: string) => {
      await shareCardImage(uri, { title: t('progress.bodyPhotos.share') }, {
        ...MOBILE_SHARE_CARD_CONTEXTS.progressPhoto,
      })
    },
    [t],
  )

  const onError = useCallback((e: unknown) => {
    Sentry.captureException(e)
  }, [])

  const { captureRef, sharing: busy, share } = useShareCardCapture({
    onCapture,
    prefetchUrls: [before.url, after.url],
    onError,
  })

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
        onPress={() => void share()}
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
