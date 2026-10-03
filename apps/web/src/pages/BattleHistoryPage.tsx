/** Historial de batallas (#398). El balance y las filas viven en `BattleHistoryList`. */
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft } from 'lucide-react'

import { Kicker } from '../components/ui/kicker'
import BattleHistoryList from '../components/battle/BattleHistoryList'

export default function BattleHistoryPage({ userId }: { userId: string }) {
  const { t } = useTranslation()
  return (
    <div className="mx-auto max-w-xl px-4 py-6 md:px-6 md:py-8">
      <BattleHistoryList
        userId={userId}
        header={
          <div className="flex items-center gap-3">
            <Link to="/community?tab=battles" aria-label={t('common.back')} className="-ml-2 rounded-full p-2 hover:bg-muted/40">
              <ChevronLeft className="size-5 text-muted-foreground" aria-hidden />
            </Link>
            <div>
              <Kicker>{t('battle.historyKicker')}</Kicker>
              <h1 className="font-bebas text-4xl md:text-5xl leading-none">{t('battle.historyTitle')}</h1>
            </div>
          </div>
        }
      />
    </div>
  )
}
