import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, CardContent } from '../ui/card'
import { cn } from '../../lib/utils'
import { useBodyMeasurements } from '@calistenia/core/hooks/useBodyMeasurements'
import { useBodyProfile } from '@calistenia/core/hooks/useBodyProfile'
import { bodyFatSeries, bodyFatCategoryKey, bodyFatColorClass, leanMassKg } from '@calistenia/core/lib/body-composition'

interface BodyFatPanelProps {
  userId: string | null
}

/**
 * % de grasa corporal estimado (método US Navy) + tendencia, a partir de las
 * medidas guardadas (cintura+cuello, +cadera en mujeres) y sexo/altura del
 * perfil (#227). Estados vacíos guían a completar perfil o medir.
 */
export default function BodyFatPanel({ userId }: BodyFatPanelProps) {
  const { t } = useTranslation()
  const { measurements, isReady } = useBodyMeasurements(userId)
  const { profile, isReady: profileReady } = useBodyProfile(userId)

  const series = useMemo(() => bodyFatSeries(measurements, profile), [measurements, profile])

  if (!isReady || !profileReady) return null

  const latest = series.length > 0 ? series[series.length - 1] : null
  const prev = series.length > 1 ? series[series.length - 2] : null
  const delta = latest && prev ? Number((latest.pct - prev.pct).toFixed(1)) : null
  const category = latest && profile.sex ? bodyFatCategoryKey(latest.pct, profile.sex) : null
  const lean = latest ? leanMassKg(profile.weightKg ?? null, latest.pct) : null
  const missingProfile = !profile.sex || !profile.heightCm

  return (
    <div className="mb-8">
      <div className="text-[10px] text-muted-foreground tracking-[3px] mb-4 uppercase">{t('progress.bodyFat.title')}</div>
      <Card>
        <CardContent className="p-5">
          {missingProfile ? (
            <div className="text-center text-muted-foreground text-sm py-6">{t('progress.bodyFat.hintMissingProfile')}</div>
          ) : !latest ? (
            <div className="text-center text-muted-foreground text-sm py-6">
              {profile.sex === 'female' ? t('progress.bodyFat.hintMissingMeasurementFemale') : t('progress.bodyFat.hintMissingMeasurement')}
            </div>
          ) : (
            <>
              <div className="flex items-end gap-6 flex-wrap mb-4">
                <div>
                  <div className={cn('font-bebas text-5xl leading-none', category ? bodyFatColorClass(category) : 'text-foreground')}>
                    {latest.pct}%
                  </div>
                  {category && (
                    <div className="text-[10px] text-muted-foreground tracking-wide mt-1 uppercase">
                      {t(`progress.bodyFat.${category}`)}
                    </div>
                  )}
                </div>
                {delta !== null && (
                  <div className="text-center">
                    <div className={cn(
                      'font-bebas text-2xl leading-none',
                      delta > 0 ? 'text-amber-400' : delta < 0 ? 'text-emerald-500' : 'text-muted-foreground'
                    )}>
                      {delta > 0 ? '+' : ''}{delta}
                    </div>
                    <div className="text-[9px] text-muted-foreground tracking-wide mt-0.5 uppercase">{t('progress.bodyFat.sinceLast')}</div>
                  </div>
                )}
                {lean !== null && (
                  <div className="text-center">
                    <div className="font-bebas text-2xl leading-none text-sky-500">{lean} kg</div>
                    <div className="text-[9px] text-muted-foreground tracking-wide mt-0.5 uppercase">{t('progress.bodyFat.leanMass')}</div>
                  </div>
                )}
              </div>

              {series.length >= 2 && (
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={series} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: 'var(--chart-axis)' }}
                      tickFormatter={(v: string) => v.slice(5)}
                      stroke="var(--chart-grid)"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: 'var(--chart-axis)' }}
                      stroke="var(--chart-grid)"
                      domain={['dataMin - 1', 'dataMax + 1']}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--chart-tooltip-bg)',
                        border: '1px solid var(--chart-tooltip-border)',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: 'var(--chart-tooltip-text)',
                      }}
                      formatter={(value: number) => [`${value}%`, t('progress.bodyFat.estimateLabel')]}
                    />
                    <Line
                      type="monotone"
                      dataKey="pct"
                      stroke="#a3e635"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#a3e635' }}
                      activeDot={{ r: 5, fill: '#a3e635' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}

              <div className="text-[10px] text-muted-foreground pt-2 border-t border-border/60 mt-2">
                {t('progress.bodyFat.disclaimer')}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
