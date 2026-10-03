/** Sala de espera de una batalla: invitar, marcar preparado y arrancar. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Share2, Crown, Check } from 'lucide-react'

import { battleExerciseLabel, battleTitle } from '@calistenia/core/data/battle-presets'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'
import { WEB_BASE_URL } from '@calistenia/core/lib/app-urls'
import { shareContent } from '../../lib/share'
import { Button } from '../ui/button'
import { Kicker } from '../ui/kicker'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { useBattleContext } from './BattleContext'

type Pending = 'start' | 'cancel' | 'leave' | null

export default function BattleLobby() {
  const { t, i18n } = useTranslation()
  const { snapshot, isCreator, busy, can, actions } = useBattleContext()
  const [sharing, setSharing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pending, setPending] = useState<Pending>(null)

  if (!snapshot) return null
  const { battle, participants, me } = snapshot
  const circuitTitle = battleTitle(battle.config, i18n.language) || t('battle.title')
  const readyCount = participants.filter(p => p.status === 'ready').length

  const handleShare = async () => {
    setSharing(true)
    setCopied(false)
    try {
      // Un token nuevo por compartición: es de un solo uso. Jamás viaja a analytics.
      const invite = await actions.invite()
      const hasNativeShare = typeof navigator !== 'undefined' && !!navigator.share
      const ok = await shareContent({
        title: circuitTitle,
        text: t('battle.inviteMessage'),
        url: `${WEB_BASE_URL}/battle-invite/${invite.token}`,
      })
      if (!ok) return
      if (!hasNativeShare) setCopied(true)
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.battleShared, {
        surface: 'battle', source: 'battle_lobby', battle_id: battle.id,
        share_type: 'invite_link', participant_count: participants.length, result: 'shared',
        share_confirmed: false,
      })
    } catch { /* el contexto ya expone el error */ } finally {
      setSharing(false)
    }
  }

  const confirm = async () => {
    const action = pending
    setPending(null)
    try {
      if (action === 'start') {
        await actions.start()
        trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.battleStarted, {
          surface: 'battle', source: 'battle_lobby', battle_id: battle.id,
          participant_count: participants.length, result: 'started',
        })
      } else if (action === 'cancel') await actions.cancel()
      else if (action === 'leave') await actions.leave()
    } catch { /* mostrado por el contexto */ }
  }

  const dialog = {
    start: { title: circuitTitle, description: `${t('battle.start')}?`, label: t('battle.start'), destructive: false },
    cancel: { title: t('battle.cancel'), description: t('battle.cancelConfirm'), label: t('battle.cancel'), destructive: true },
    leave: {
      title: t('battle.leave'),
      description: isCreator ? t('battle.leaveCreatorConfirm') : t('battle.leaveConfirm'),
      label: t('battle.leave'), destructive: true,
    },
  } as const

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col items-center text-center pt-2">
        <h1 className="font-bebas text-4xl md:text-5xl leading-none">{circuitTitle}</h1>
        <p className="mt-1.5 font-mono text-xs text-lime">
          {battle.config.rounds} {t('battle.rounds')} · {battle.config.exercises.length} {t('battle.exercises')}
        </p>
        <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-400/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[2px] text-amber-400">
          <span className="size-2 rounded-full bg-amber-400" />
          {battle.status === 'ready' ? t('battle.allReady') : t('battle.waitingForParticipants')}
        </span>
      </header>

      <section className="flex flex-col gap-1">
        <Kicker>{t('battle.circuit')}</Kicker>
        <ul>
          {battle.config.exercises.map(exercise => (
            <li key={exercise.exercise_id} className="flex items-center justify-between border-b border-border py-2.5">
              <span className="text-sm font-medium">{battleExerciseLabel(battle.config, exercise.exercise_id, i18n.language)}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {exercise.target.value}{exercise.target.kind === 'seconds' ? 's' : ` ${t('battle.reps')}`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <Kicker>{t('battle.participants')} ({participants.length}) · {readyCount} {t('battle.ready')}</Kicker>
        <ul className="flex flex-col gap-2">
          {participants.map(p => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-muted font-bebas text-base">
                {(p.display_name || '?').slice(0, 1).toUpperCase()}
              </span>
              <span className="flex-1 min-w-0 truncate text-sm font-medium">
                {p.display_name || t('battle.someone')}
                {battle.creator === p.user ? <Crown className="ml-1.5 inline size-3.5 text-amber-400" aria-hidden /> : null}
              </span>
              {p.user === me?.user && (
                <span className="rounded bg-lime/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[1px] text-lime">{t('battle.you')}</span>
              )}
              {p.status === 'ready' && (
                <span className="rounded bg-emerald-400/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[1px] text-emerald-400">{t('battle.ready')}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-col gap-2.5">
        {can.ready && (
          <Button className="h-12 font-bebas text-xl tracking-widest uppercase" disabled={busy} onClick={() => void actions.setReady(true).catch(() => {})}>
            {t('battle.imReady')}
          </Button>
        )}
        {can.unready && (
          <Button variant="outline" className="h-11 gap-2 font-bebas text-lg tracking-widest uppercase" disabled={busy} onClick={() => void actions.setReady(false).catch(() => {})}>
            <Check className="size-4 text-emerald-400" aria-hidden /> {t('battle.cancelReady')}
          </Button>
        )}
        {can.invite && (
          <Button variant="outline" className="h-11 gap-2 font-bebas text-base tracking-widest uppercase" disabled={sharing || busy} onClick={() => void handleShare()}>
            <Share2 className="size-4" aria-hidden /> {t('battle.invite')}
          </Button>
        )}
        {copied && <p role="status" className="text-center text-xs text-lime">{t('battle.linkCopied')}</p>}
        {isCreator && (
          <>
            <Button className="h-12 gap-2 font-bebas text-xl tracking-widest uppercase" disabled={!can.start || busy} onClick={() => setPending('start')}>
              <Crown className="size-4" aria-hidden /> {t('battle.start')}
            </Button>
            {!can.start && (
              <p className="text-center font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground">{t('battle.needTwoReady')}</p>
            )}
          </>
        )}
      </div>

      <div className="flex justify-center gap-6">
        {can.leave && <button type="button" onClick={() => setPending('leave')} className="py-2 text-xs text-muted-foreground hover:text-foreground">{t('battle.leave')}</button>}
        {can.cancel && <button type="button" onClick={() => setPending('cancel')} className="py-2 text-xs text-red-400 hover:text-red-300">{t('battle.cancel')}</button>}
      </div>

      {pending && (
        <ConfirmDialog
          open
          onOpenChange={open => { if (!open) setPending(null) }}
          title={dialog[pending].title}
          description={dialog[pending].description}
          confirmLabel={dialog[pending].label}
          variant={dialog[pending].destructive ? 'destructive' : 'default'}
          onConfirm={confirm}
        />
      )}
    </div>
  )
}
