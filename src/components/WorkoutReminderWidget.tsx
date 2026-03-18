import { useState } from 'react'
import { Card, CardContent } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { cn } from '../lib/utils'
import { useWorkoutReminders } from '../hooks/useWorkoutReminders'

interface WorkoutReminderWidgetProps {
  userId?: string | null
}

const DAY_LABELS = [
  { id: 1, label: 'L' },
  { id: 2, label: 'M' },
  { id: 3, label: 'X' },
  { id: 4, label: 'J' },
  { id: 5, label: 'V' },
  { id: 6, label: 'S' },
  { id: 7, label: 'D' },
]

export default function WorkoutReminderWidget({ userId }: WorkoutReminderWidgetProps) {
  const { reminders, saveReminder, toggleReminder, deleteReminder } = useWorkoutReminders(userId ?? null)
  const [showForm, setShowForm] = useState(false)
  const [hour, setHour] = useState('08')
  const [minute, setMinute] = useState('00')
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5])

  const handleSave = () => {
    const h = parseInt(hour)
    const m = parseInt(minute)
    if (isNaN(h) || isNaN(m) || days.length === 0) return

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    saveReminder(h, m, days)
    setShowForm(false)
  }

  const toggleDay = (id: number) => {
    setDays(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id].sort())
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] text-muted-foreground tracking-[3px] uppercase">Recordatorios de entrenamiento</div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowForm(s => !s)}
            className="text-[10px] tracking-widest hover:border-lime hover:text-lime"
          >
            {showForm ? 'CANCELAR' : '+ NUEVO'}
          </Button>
        </div>

        {showForm && (
          <div className="mb-4 p-3 bg-muted/20 rounded-lg border border-border/60 space-y-3">
            <div className="flex gap-2 items-center">
              <Input
                type="number"
                min="0"
                max="23"
                value={hour}
                onChange={e => setHour(e.target.value)}
                className="w-16 h-8 text-sm text-center"
              />
              <span className="text-muted-foreground">:</span>
              <Input
                type="number"
                min="0"
                max="59"
                step="5"
                value={minute}
                onChange={e => setMinute(e.target.value)}
                className="w-16 h-8 text-sm text-center"
              />
            </div>
            <div className="flex gap-1.5">
              {DAY_LABELS.map(d => (
                <button
                  key={d.id}
                  onClick={() => toggleDay(d.id)}
                  className={cn(
                    'size-8 rounded-md text-[11px] font-mono border transition-colors',
                    days.includes(d.id)
                      ? 'border-lime/50 text-lime bg-lime/10'
                      : 'border-border text-muted-foreground hover:border-lime/30'
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <Button
              onClick={handleSave}
              size="sm"
              className="h-8 bg-lime text-lime-foreground hover:bg-lime/90 text-[10px] font-bold tracking-widest"
            >
              GUARDAR
            </Button>
          </div>
        )}

        {reminders.length > 0 ? (
          <div className="space-y-2">
            {reminders.map(r => (
              <div key={r.id} className="flex items-center gap-3 py-2 px-3 bg-muted/20 rounded-lg border border-border/40">
                <button
                  onClick={() => toggleReminder(r.id)}
                  className={cn(
                    'size-5 rounded-full border-2 flex items-center justify-center text-[10px] transition-colors',
                    r.enabled ? 'border-lime bg-lime/20 text-lime' : 'border-muted-foreground/30'
                  )}
                >
                  {r.enabled && '✓'}
                </button>
                <span className={cn('font-mono text-sm', r.enabled ? 'text-foreground' : 'text-muted-foreground line-through')}>
                  {String(r.hour).padStart(2, '0')}:{String(r.minute).padStart(2, '0')}
                </span>
                <div className="flex gap-0.5 flex-1">
                  {DAY_LABELS.map(d => (
                    <span key={d.id} className={cn(
                      'text-[9px] font-mono',
                      r.daysOfWeek.includes(d.id) ? 'text-lime' : 'text-muted-foreground/30'
                    )}>
                      {d.label}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => deleteReminder(r.id)}
                  className="text-muted-foreground hover:text-red-400 text-xs transition-colors"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        ) : !showForm && (
          <div className="text-[11px] text-muted-foreground">
            Sin recordatorios configurados
          </div>
        )}
      </CardContent>
    </Card>
  )
}
