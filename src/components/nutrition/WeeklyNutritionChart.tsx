import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import { Card, CardContent } from '../ui/card'

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
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as DayData
  if (!d.calories) return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 text-[11px]">
      <div className="font-medium text-muted-foreground">{label}</div>
      <div className="text-muted-foreground/60 mt-1">Sin registro</div>
    </div>
  )
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 text-[11px] space-y-1 min-w-[130px]">
      <div className="font-medium text-foreground mb-1.5">{label}</div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Calorías</span>
        <span className="text-foreground font-medium">{d.calories} kcal</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-sky-500">Proteína</span>
        <span className="text-sky-500">{d.protein}g</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-amber-400">Carbos</span>
        <span className="text-amber-400">{d.carbs}g</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-pink-500">Grasa</span>
        <span className="text-pink-500">{d.fat}g</span>
      </div>
    </div>
  )
}

export default function WeeklyNutritionChart({ history, calorieGoal }: WeeklyNutritionChartProps) {
  const daysWithData = history.filter(d => d.calories > 0).length
  const daysOnTarget = history.filter(d => d.calories >= calorieGoal * 0.85).length
  const today = new Date().toISOString().split('T')[0]

  return (
    <div>
      <div className="flex items-end justify-between mb-4">
        <div>
          <div className="text-[10px] text-muted-foreground tracking-[0.3em] uppercase">Semana</div>
          <div className="font-bebas text-2xl mt-0.5">HISTORIAL SEMANAL</div>
        </div>
        <div className="text-right">
          <div className="font-bebas text-3xl text-lime-400">{daysOnTarget}<span className="text-muted-foreground text-lg">/7</span></div>
          <div className="text-[10px] text-muted-foreground tracking-wide">días en meta</div>
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
              <span className="text-[10px] text-muted-foreground">En meta</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-muted-foreground/30" />
              <span className="text-[10px] text-muted-foreground">Bajo meta</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-lime-400" />
              <span className="text-[10px] text-muted-foreground">Hoy</span>
            </div>
          </div>

          {daysWithData === 0 && (
            <div className="text-center text-xs text-muted-foreground/60 mt-2">
              Registra comidas para ver tu historial
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
