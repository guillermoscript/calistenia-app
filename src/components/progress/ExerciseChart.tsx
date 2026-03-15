import { useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, CardContent } from '../ui/card'
import { cn } from '../../lib/utils'
import type { ExerciseLog } from '../../types'

interface ExerciseChartProps {
  exerciseId: string
  exerciseName: string
  logs: ExerciseLog[]
}

export default function ExerciseChart({ exerciseId, exerciseName, logs }: ExerciseChartProps) {
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
        }
      })
      .filter(d => d.reps > 0)
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [logs])

  if (chartData.length < 2) return null

  return (
    <Card>
      <CardContent className="p-0">
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-muted/30 transition-colors"
        >
          <div className="font-medium text-sm capitalize">{exerciseName.replace(/_/g, ' ')}</div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground font-mono">{chartData.length} sesiones</span>
            <svg
              className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')}
              viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
            >
              <polyline points="4,6 8,10 12,6" />
            </svg>
          </div>
        </button>

        {open && (
          <div className="px-4 pb-4">
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
                  stroke="#a3e635"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#a3e635' }}
                  activeDot={{ r: 5, fill: '#a3e635' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
