import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RecordStat } from '@calistenia/core/lib/training-stats'
import { relativeDate } from '@calistenia/core/lib/dateUtils'
import { Card, CardContent } from '../../ui/card'
import { Kicker } from '../../ui/kicker'
import { Badge } from '../../ui/badge'

interface RecordsListProps {
  records: RecordStat[]
}

const PAGE_SIZE = 20

/** Récords por ejercicio, sobre todo el histórico; badge lima cuando es nuevo dentro del periodo. */
export default function RecordsList({ records }: RecordsListProps) {
  const { t } = useTranslation()
  const [showAll, setShowAll] = useState(false)

  if (records.length === 0) return null

  const visible = showAll ? records : records.slice(0, PAGE_SIZE)

  return (
    <div>
      <Kicker className="mb-4">{t('stats.records')}</Kicker>
      <Card>
        <CardContent className="p-0">
          <div className="text-[11px] text-muted-foreground px-4 pt-4 pb-2">{t('stats.recordsHint')}</div>
          <div className="divide-y divide-border">
            {visible.map(r => (
              <div key={r.key} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-medium text-sm truncate">{r.name}</div>
                    {r.isNew && (
                      <Badge className="border-transparent bg-lime/15 text-lime text-[10px] px-1.5 py-0 shrink-0">
                        {t('stats.new')}
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    {r.best.kind === 'reps'
                      ? t('stats.bestReps', { reps: r.best.reps })
                      : t('stats.bestWeight', { weight: r.best.weight, reps: r.best.reps, e1rm: r.best.e1rm })}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground shrink-0">{relativeDate(r.best.date)}</div>
              </div>
            ))}
          </div>
          {!showAll && records.length > PAGE_SIZE && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full text-center text-xs text-lime hover:underline py-3 border-t border-border/60"
            >
              {t('stats.showAll')}
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
