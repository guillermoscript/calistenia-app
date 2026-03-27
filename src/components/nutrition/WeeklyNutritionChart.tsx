import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '../ui/card'
import { todayStr } from '../../lib/dateUtils'

interface DayData {
  date: string
  dayLabel: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

interface WeeklyNutritionChartProps {
  history: DayData[]
  calorieGoal: number
}

function CustomTooltip({ active, payload, label }: any) {
  const { t } = useTranslation()
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as DayData
  if (!d.calories) return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 text-[11px]">
      <div className="font-medium text-muted-foreground">{label}</div>
      <div className="text-muted-foreground/60 mt-1">{t('nutrition.weeklyChart.noRecords')}</div>
    </div>
  )
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 text-[11px] space-y-1 min-w-[130px]">
      <div className="font-medium text-foreground mb-1.5">{label}</div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">{t('nutrition.calories')}</span>
        <span className="text-foreground font-medium">{d.calories} kcal</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-sky-500">{t('nutrition.protein')}</span>
        <span className="text-sky-500">{d.protein}g</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-amber-400">{t('nutrition.carbs')}</span>
        <span className="text-amber-400">{d.carbs}g</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-pink-500">{t('nutrition.fat')}</span>
        <span className="text-pink-500">{d.fat}g</span>
      </div>
    </div>
  )
}

export default function WeeklyNutritionChart({ history, calorieGoal }: WeeklyNutritionChartProps) {
  const { t } = useTranslation()
  const daysWithData = history.filter(d => d.calories > 0).length
  const daysOnTarget = history.filter(d => d.calories >= calorieGoal * 0.85).length
  const today = todayStr()

  return (
    <div>
      <div className="flex items-end justify-between mb-4">
        <div>
          <div className="text-[10px] text-muted-foreground tracking-[0.3em] uppercase">{t('nutrition.weeklyChart.weekLabel')}</div>
          <div className="font-bebas text-2xl mt-0.5">{t('nutrition.weeklyChart.title')}</div>
        </div>
        <div className="text-right">
          <div className="font-bebas text-3xl text-lime-400">{daysOnTarget}<span className="text-muted-foreground text-lg">/7</span></div>
          <div className="text-[10px] text-muted-foreground tracking-wide">{t('nutrition.weeklyChart.daysOnGoal')}</div>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={history} barSize={28} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="dayLabel"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide domain={[0, Math.max(calorieGoal * 1.2, 500)]} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted)/0.4)' }} />
              <ReferenceLine
                y={calorieGoal}
                stroke="hsl(var(--lime, 163 100% 52%))"
                strokeDasharray="4 3"
                strokeWidth={1.5}
                strokeOpacity={0.6}
              />
              <Bar dataKey="calories" radius={[4, 4, 0, 0]}>
                {history.map((entry) => (
                  <Cell
                    key={entry.date}
                    fill={
                      entry.date === today
                        ? 'hsl(163 100% 52% / 0.9)'
                        : entry.calories === 0
                          ? 'hsl(var(--muted))'
                          : entry.calories >= calorieGoal * 0.85
                            ? 'hsl(163 100% 52% / 0.5)'
                            : 'hsl(var(--muted-foreground) / 0.3)'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-2 justify-center">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-lime-400/50" />
              <span className="text-[10px] text-muted-foreground">{t('nutrition.weeklyChart.onGoal')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-muted-foreground/30" />
              <span className="text-[10px] text-muted-foreground">{t('nutrition.weeklyChart.belowGoal')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-lime-400" />
              <span className="text-[10px] text-muted-foreground">{t('common.today')}</span>
            </div>
          </div>

          {daysWithData === 0 && (
            <div className="text-center text-xs text-muted-foreground/60 mt-2">
              {t('nutrition.weeklyChart.logToSeeHistory')}
            </div>
          )}
        </CardContent>
      </Card>

      <table className="sr-only">
        <caption>{t('nutrition.weeklyChart.caption')}</caption>
        <thead>
          <tr>
            <th>Día</th><th>{t('nutrition.calories')}</th><th>{t('nutrition.protein')}</th><th>{t('nutrition.carbs')}</th><th>{t('nutrition.fat')}</th>
          </tr>
        </thead>
        <tbody>
          {history.map(d => (
            <tr key={d.date}>
              <td>{d.dayLabel}</td>
              <td>{d.calories} kcal</td>
              <td>{d.protein}g</td>
              <td>{d.carbs}g</td>
              <td>{d.fat}g</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
