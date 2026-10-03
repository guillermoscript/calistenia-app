/** Sala de batalla: enruta por fase (lobby / cuenta atrás / en vivo / resultado). */
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

import { BattleProvider, useBattleContext } from '../components/battle/BattleContext'
import BattleLobby from '../components/battle/BattleLobby'
import BattleCountdown from '../components/battle/BattleCountdown'
import BattleLive from '../components/battle/BattleLive'
import BattleResults from '../components/battle/BattleResults'

function BattlePhaseRouter({ userId }: { userId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { phase, error, clearError, actions } = useBattleContext()

  // Un fallo de red al abrir dejaba la pantalla en «Cargando…» para siempre: tocar el aviso reintenta.
  const retry = () => { clearError(); actions.refresh() }

  if (phase === 'countdown') return <BattleCountdown />
  if (phase === 'live') return <BattleLive />

  return (
    <>
      <div className="flex justify-end pb-2">
        <button type="button" onClick={() => navigate('/community?tab=battles')} aria-label={t('common.back')} className="rounded-full bg-muted/60 p-2 hover:opacity-70">
          <X className="size-4 text-muted-foreground" aria-hidden />
        </button>
      </div>

      {error && (
        <button type="button" onClick={retry} className="mb-3 block w-full rounded-xl border border-red-400/40 bg-red-400/10 px-4 py-3 text-left hover:opacity-80">
          <span className="block text-xs text-red-400">{error.status === 0 ? t('battle.networkError') : error.message}</span>
          <span className="mt-1 block font-mono text-[9px] uppercase tracking-[2px] text-red-400/70">{t('battle.retry')}</span>
        </button>
      )}

      {phase === 'loading' && <p className="py-16 text-center text-muted-foreground">{t('common.loading')}</p>}
      {(phase === 'not_found' || phase === 'forbidden') && (
        <div className="flex flex-col items-center gap-3 py-16">
          <p className="font-bebas text-2xl text-muted-foreground">{t('battle.notFound')}</p>
          <Link to="/community?tab=battles" className="text-xs text-muted-foreground underline">{t('battle.historyTitle')}</Link>
        </div>
      )}
      {(phase === 'draft' || phase === 'lobby') && <BattleLobby />}
      {(phase === 'finished' || phase === 'cancelled' || phase === 'expired') && <BattleResults userId={userId} />}
    </>
  )
}

export default function BattlePage({ userId }: { userId: string }) {
  const { id } = useParams<{ id: string }>()
  if (!id) return null
  return (
    <div className="mx-auto max-w-xl px-4 py-6 pb-12 md:px-6 md:py-8">
      <BattleProvider key={id} battleId={id} userId={userId}>
        <BattlePhaseRouter userId={userId} />
      </BattleProvider>
    </div>
  )
}
