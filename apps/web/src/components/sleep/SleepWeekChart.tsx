import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '../ui/card'
import { todayStr, toLocalDateStr } from '../../lib/dateUtils'

// ── Types ────────────────────────────────────────────────────────────────────

export interface SleepEntry {
  date: string
  bedtime: string
  wake_time: string
  duration_minutes: number
  quality: number
  awakenings: number
  awake_minutes?: number
}

interface SleepWeekChartProps {
  entries: SleepEntry[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const DAY_NAME_KEYS = ['day.shortSun', 'day.shortMon', 'day.shortTue', 'day.shortWed', 'day.shortThu', 'day.shortFri', 'day.shortSat']

function getDayLabel(dateStr: string, t: (key: string) => string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return t(DAY_NAME_KEYS[d.getDay()])
}

function qualityColor(q: number): string {
  if (q <= 2) return 'hsl(0 84% 60%)'       // red
  if (q === 3) return 'hsl(45 93% 58%)'      // yellow
  return 'hsl(142 71% 45%)'                   // green
}

function qualityColorFaded(q: number): string {
  if (q <= 2) return 'hsl(0 84% 60% / 0.7)'
  if (q === 3) return 'hsl(45 93% 58% / 0.7)'
  return 'hsl(142 71% 45% / 0.7)'
}

interface ChartDataPoint {
  dayLabel: string
  date: string
  sleepHours: number
  awakeHours: number
  quality: number
  bedtime: string
  wake_time: string
  awakenings: number
}

function buildChartData(entries: SleepEntry[], t: (key: string) => string): ChartDataPoint[] {
  // Build a map for the last 7 days
  const today = new Date()
  const data: ChartDataPoint[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const dateStr = toLocalDateStr(d)
    const entry = entries.find(e => e.date === dateStr)
    data.push({
      dayLabel: getDayLabel(dateStr, t),
      date: dateStr,
      sleepHours: entry ? +(entry.duration_minutes / 60).toFixed(1) : 0,
      awakeHours: entry?.awake_minutes ? +((entry.awake_minutes) / 60).toFixed(1) : 0,
      quality: entry?.quality ?? 0,
      bedtime: entry?.bedtime ?? '',
      wake_time: entry?.wake_time ?? '',
      awakenings: entry?.awakenings ?? 0,
    })
  }
  return data
}

// ── Tooltip ──────────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  const { t } = useTranslation()
  const QUALITY_LABELS = ['', t('sleep.qualityVeryBad'), t('sleep.qualityBad'), t('sleep.qualityFair'), t('sleep.qualityGood'), t('sleep.qualityExcellent')]

  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as ChartDataPoint
  if (!d.sleepHours) return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 text-[11px]">
      <div className="font-medium text-muted-foreground">{label}</div>
      <div className="text-muted-foreground/60 mt-1">{t('sleep.noRecord')}</div>
    </div>
  )
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 text-[11px] space-y-1 min-w-[130px]">
      <div className="font-medium text-foreground mb-1.5">{label}</div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">{t('sleep.duration')}</span>
        <span className="text-foreground font-medium">{d.sleepHours}h</span>
      </div>
      {d.awakeHours > 0 && (
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">{t('sleep.awakeFor')}</span>
          <span className="text-foreground">{Math.round(d.awakeHours * 60)}min</span>
        </div>
      )}
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">{t('sleep.quality')}</span>
        <span style={{ color: qualityColor(d.quality) }}>{QUALITY_LABELS[d.quality]}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">{t('sleep.schedule')}</span>
        <span className="text-foreground">{d.bedtime} — {d.wake_time}</span>
      </div>
      {d.awakenings > 0 && (
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">{t('sleep.awakenings')}</span>
          <span className="text-foreground">{d.awakenings}</span>
        </div>
      )}
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SleepWeekChart({ entries }: SleepWeekChartProps) {
  const { t } = useTranslation()
  const data = buildChartData(entries, t)
  const today = todayStr()
  const daysWithData = data.filter(d => d.sleepHours > 0).length
  const avgHours = daysWithData > 0
    ? (data.reduce((sum, d) => sum + d.sleepHours, 0) / daysWithData).toFixed(1)
    : null

  return (
    <div>
      <div className="flex items-end justify-between mb-4">
        <div>
          <div className="text-[10px] text-muted-foreground tracking-[0.3em] uppercase">{t('common.week')}</div>
          <div className="font-bebas text-2xl mt-0.5">{t('sleep.weeklySleep')}</div>
        </div>
        {avgHours && (
          <div className="text-right">
            <div className="font-bebas text-3xl text-indigo-400">{avgHours}<span className="text-muted-foreground text-lg">h</span></div>
            <div className="text-[10px] text-muted-foreground tracking-wide">{t('sleep.average')}</div>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-4">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={data} barSize={28} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="dayLabel"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                hide
                domain={[0, 12]}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted)/0.4)' }} />
              <ReferenceLine
                y={8}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="4 3"
                strokeWidth={1}
                strokeOpacity={0.3}
                label={{ value: '8h', position: 'right', fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              />
              <Bar dataKey="sleepHours" stackId="sleep" radius={[4, 4, 0, 0]}>
                {data.map((entry) => (
                  <Cell
                    key={entry.date}
                    fill={
                      entry.sleepHours === 0
                        ? 'hsl(var(--muted))'
                        : entry.date === today
                          ? qualityColor(entry.quality)
                          : qualityColorFaded(entry.quality)
                    }
                  />
                ))}
              </Bar>
              <Bar dataKey="awakeHours" stackId="sleep" radius={[4, 4, 0, 0]}>
                {data.map((entry) => (
                  <Cell
                    key={entry.date}
                    fill={entry.awakeHours > 0 ? 'hsl(var(--muted-foreground) / 0.25)' : 'transparent'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-2 justify-center">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: qualityColor(5) }} />
              <span className="text-[10px] text-muted-foreground">{t('sleep.legendGood')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: qualityColor(3) }} />
              <span className="text-[10px] text-muted-foreground">{t('sleep.legendFair')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: qualityColor(1) }} />
              <span className="text-[10px] text-muted-foreground">{t('sleep.legendBad')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-muted-foreground/25" />
              <span className="text-[10px] text-muted-foreground">{t('sleep.awakeFor')}</span>
            </div>
          </div>

          {daysWithData === 0 && (
            <div className="text-center text-xs text-muted-foreground/60 mt-2">
              {t('sleep.recordToSeeHistory')}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
