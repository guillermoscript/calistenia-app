import { useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, CardContent } from '../ui/card'
import { cn } from '../../lib/utils'
import { isFreeSession } from '../../lib/progressUtils'
import type { ExerciseLog, SetData } from '../../types'

interface ExerciseChartProps {
  exerciseName: string
  logs: ExerciseLog[]
  /** When true, dots from free sessions are shown in violet */
  showSessionType?: boolean
  /** Show last session set pills below the header when collapsed */
  lastSets?: SetData[]
  /** Accent color for set pills and chart line (default: lime) */
  accentColor?: 'lime' | 'violet'
}

export default function ExerciseChart({ exerciseName, logs, showSessionType, lastSets, accentColor = 'lime' }: ExerciseChartProps) {
  const [open, setOpen] = useState(false)

  const chartData = useMemo(() => {
    return logs
      .map(log => {
        const maxReps = Math.max(
          ...log.sets.map(s => {
            const n = parseInt(s.reps, 10)
            return isNaN(n) ? 0 : n
          })
        )
        return {
          date: log.date,
          reps: maxReps,
          isFree: isFreeSession(log.workoutKey),
        }
      })
      .filter(d => d.reps > 0)
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [logs])

  const canShowChart = chartData.length >= 2

  if (chartData.length === 0 && !lastSets) return null

  return (
    <Card>
      <CardContent className="p-0">
        <button
          onClick={() => canShowChart && setOpen(o => !o)}
          className={cn('w-full px-4 py-3 flex items-center justify-between text-left transition-colors', canShowChart && 'hover:bg-muted/30')}
        >
          <div className="font-medium text-sm capitalize">{exerciseName.replace(/_/g, ' ')}</div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground font-mono">
              {chartData.length} {chartData.length === 1 ? 'sesión' : 'sesiones'}
            </span>
            {canShowChart && (
              <svg
                className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')}
                viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
              >
                <polyline points="4,6 8,10 12,6" />
              </svg>
            )}
          </div>
        </button>

        {lastSets && !open && (
          <div className="px-4 pb-3 flex gap-1.5 flex-wrap">
            {lastSets.map((s, i) => (
              <span key={i} className={cn(
                'px-2 py-0.5 rounded font-mono text-[11px] border',
                accentColor === 'violet'
                  ? 'bg-violet-400/5 border-violet-400/15 text-violet-400'
                  : 'bg-lime/5 border-lime/15 text-lime'
              )}>
                S{i + 1}: {s.reps}
              </span>
            ))}
          </div>
        )}

        {canShowChart && open && (
          <div className="px-4 pb-4">
            {showSessionType && chartData.some(d => d.isFree) && (
              <div className="flex gap-3 mb-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full bg-lime" />Programa</span>
                <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full bg-violet-400" />Libre</span>
              </div>
            )}
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#a1a1aa' }}
                  tickFormatter={(v: string) => v.slice(5)}
                  stroke="#3f3f46"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#a1a1aa' }}
                  stroke="#3f3f46"
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    border: '1px solid #3f3f46',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#fff',
                  }}
                  labelFormatter={(v: string) => `Fecha: ${v}`}
                  formatter={(value: number) => [`${value} reps`, 'Max Reps']}
                />
                <Line
                  type="monotone"
                  dataKey="reps"
                  stroke={accentColor === 'violet' ? '#a78bfa' : '#a3e635'}
                  strokeWidth={2}
                  dot={showSessionType
                    ? (props: any) => {
                        const { cx, cy, payload } = props
                        const color = payload.isFree ? '#a78bfa' : '#a3e635'
                        return <circle key={`${payload.date}`} cx={cx} cy={cy} r={3} fill={color} stroke="none" />
                      }
                    : { r: 3, fill: accentColor === 'violet' ? '#a78bfa' : '#a3e635' }
                  }
                  activeDot={{ r: 5, fill: accentColor === 'violet' ? '#a78bfa' : '#a3e635' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
