import { useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { cn } from '../../lib/utils'
import { todayStr } from '../../lib/dateUtils'
import { useWeight } from '../../hooks/useWeight'

interface WeightTrackerProps {
  userId: string | null
}

export default function WeightTracker({ userId }: WeightTrackerProps) {
  const { weights, isReady, logWeight, deleteWeight } = useWeight(userId)
  const [weightInput, setWeightInput] = useState('')
  const [dateInput, setDateInput] = useState(() => todayStr())
  const [saving, setSaving] = useState(false)

  const chartData = useMemo(() => {
    return [...weights]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(w => ({
        date: w.date,
        kg: w.weight_kg,
      }))
  }, [weights])

  const stats = useMemo(() => {
    if (weights.length === 0) return null
    const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date))
    const current = sorted[sorted.length - 1].weight_kg
    const first = sorted[0].weight_kg
    const min = Math.min(...sorted.map(w => w.weight_kg))
    const max = Math.max(...sorted.map(w => w.weight_kg))
    const trend = current - first
    return { current, min, max, trend }
  }, [weights])

  const handleSave = async () => {
    const kg = parseFloat(weightInput)
    if (isNaN(kg) || kg <= 0 || kg > 500) return
    setSaving(true)
    try {
      await logWeight(kg, dateInput)
      setWeightInput('')
      setDateInput(todayStr())
    } catch {
      // logWeight handles its own error display
    } finally {
      setSaving(false)
    }
  }

  if (!isReady) return null

  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-[10px] text-muted-foreground tracking-[3px] mb-4 uppercase">Peso Corporal</div>

        {/* Quick-add form */}
        <div className="flex gap-2 items-end mb-4 flex-wrap">
          <div className="flex-1 min-w-[100px]">
            <label className="text-[10px] text-muted-foreground mb-1 block">Peso (kg)</label>
            <Input
              type="number"
              step="0.1"
              min="0"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
              placeholder="75.5"
              className="h-9 text-sm"
            />
          </div>
          <div className="min-w-[140px]">
            <label className="text-[10px] text-muted-foreground mb-1 block">Fecha</label>
            <Input
              type="date"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <Button
            onClick={handleSave}
            disabled={saving || !weightInput}
            className="h-9 px-4 bg-lime text-zinc-900 hover:bg-lime/90 font-bebas text-sm tracking-wide"
          >
            {saving ? '...' : 'GUARDAR'}
          </Button>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Actual', value: `${stats.current}`, accent: 'text-lime' },
              { label: 'Min', value: `${stats.min}`, accent: 'text-sky-500' },
              { label: 'Max', value: `${stats.max}`, accent: 'text-amber-400' },
              { label: 'Tendencia', value: `${stats.trend > 0 ? '+' : ''}${stats.trend.toFixed(1)}`, accent: stats.trend > 0 ? 'text-red-400' : 'text-emerald-500' },
            ].map(s => (
              <div key={s.label} className="text-center">
                <div className={cn('font-bebas text-2xl leading-none', s.accent)}>{s.value}</div>
                <div className="text-[9px] text-muted-foreground tracking-wide mt-0.5 uppercase">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Chart */}
        {chartData.length >= 2 && (
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
                domain={['dataMin - 1', 'dataMax + 1']}
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
                formatter={(value: number) => [`${value} kg`, 'Peso']}
              />
              <Line
                type="monotone"
                dataKey="kg"
                stroke="#a3e635"
                strokeWidth={2}
                dot={{ r: 3, fill: '#a3e635' }}
                activeDot={{ r: 5, fill: '#a3e635' }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        {weights.length === 0 && (
          <div className="text-center text-muted-foreground text-sm py-6">
            Registra tu peso para ver la tendencia
          </div>
        )}
      </CardContent>
    </Card>
  )
}
