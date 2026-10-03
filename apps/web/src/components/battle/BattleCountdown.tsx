/** Cuenta atrás sincronizada con `starts_at` del servidor, no con el reloj del dispositivo. */
import { useTranslation } from 'react-i18next'
import { Kicker } from '../ui/kicker'
import { useBattleContext } from './BattleContext'

export default function BattleCountdown() {
  const { t } = useTranslation()
  const { secondsToStart, snapshot } = useBattleContext()
  const active = snapshot?.participants.filter(p => p.status === 'active').length ?? 0

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6" role="timer" aria-live="polite">
      <Kicker>{t('battle.getReady')}</Kicker>
      <div className="font-bebas text-[160px] leading-none text-lime">{secondsToStart}</div>
      <Kicker size="sm">{active} {active === 1 ? t('battle.participantOne') : t('battle.participants')}</Kicker>
    </div>
  )
}
