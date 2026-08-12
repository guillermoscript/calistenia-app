/**
 * Aterrizaje web de una invitación a batalla (#356).
 *
 * El enlace que se comparte es `https://gym.guille.tech/battle-invite/<token>`, así que
 * puede abrirse en cualquier sitio: en Android/iOS con la app instalada lo captura el
 * app link y esta página no llega a verse. Existe para el resto de los casos —
 * escritorio, o el móvil de alguien que aún no tiene la app — donde sin ella el enlace
 * sería un 404 y la invitación moriría ahí.
 *
 * Las batallas se juegan en la app nativa (el MVP es solo móvil), así que aquí solo se
 * muestra a qué te han invitado y se empuja a abrirla o instalarla. Igual que en la app,
 * los datos son solo recuentos: nunca quién está dentro.
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Swords } from 'lucide-react'

import { previewBattleInvite } from '@calistenia/core/lib/battleApi'
import type { BattleInvitePreview } from '@calistenia/core/types/battle'

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=tech.guille.calistenia'

export default function BattleInviteLandingPage() {
  const { token } = useParams<{ token: string }>()
  const { t } = useTranslation()
  const [preview, setPreview] = useState<BattleInvitePreview | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    previewBattleInvite(token)
      .then(result => { if (!cancelled) setPreview(result) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [token])

  const unavailable = failed || (preview && !preview.ok)

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 text-center">
        <Swords className="size-8 text-lime" />
        <p className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
          {t('battle.kicker')}
        </p>

        {!preview && !failed && (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        )}

        {preview?.ok && preview.battle && (
          <>
            <h1 className="font-bebas text-4xl leading-none text-foreground">
              {t('battle.invitedTitle')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {preview.battle.rounds} {t('battle.rounds')} · {preview.battle.exercise_count}{' '}
              {t('battle.exercises')}
            </p>
            <p className="font-mono text-[11px] uppercase tracking-[2px] text-lime">
              {preview.battle.participant_count}{' '}
              {preview.battle.participant_count === 1
                ? t('battle.participantOne')
                : t('battle.participants')}
            </p>
            <p className="text-sm text-muted-foreground">{t('battle.openInApp')}</p>
            <a
              href={PLAY_STORE_URL}
              className="flex h-14 w-full items-center justify-center rounded-xl bg-lime font-bebas text-xl uppercase tracking-widest text-zinc-900 transition hover:bg-lime/90"
            >
              {t('battle.getTheApp')}
            </a>
          </>
        )}

        {unavailable && (
          <>
            <h1 className="font-bebas text-3xl leading-none text-muted-foreground">
              {preview?.reason === 'expired'
                ? t('battle.inviteExpired')
                : t('battle.inviteUnavailable')}
            </h1>
            <p className="text-sm text-muted-foreground">{t('battle.inviteUnavailableHint')}</p>
          </>
        )}
      </div>
    </div>
  )
}
