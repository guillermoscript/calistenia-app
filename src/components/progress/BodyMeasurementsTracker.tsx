import { useState } from 'react'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { cn } from '../../lib/utils'
import { todayStr } from '../../lib/dateUtils'
import { useBodyMeasurements, type BodyMeasurement } from '../../hooks/useBodyMeasurements'

const FIELDS: { key: keyof BodyMeasurement; label: string; short: string }[] = [
  { key: 'chest', label: 'Pecho', short: 'Pecho' },
  { key: 'waist', label: 'Cintura', short: 'Cint.' },
  { key: 'hips', label: 'Cadera', short: 'Cad.' },
  { key: 'arm_left', label: 'Brazo izq', short: 'Br.I' },
  { key: 'arm_right', label: 'Brazo der', short: 'Br.D' },
  { key: 'thigh_left', label: 'Muslo izq', short: 'Mu.I' },
  { key: 'thigh_right', label: 'Muslo der', short: 'Mu.D' },
]

interface BodyMeasurementsTrackerProps {
  userId: string | null
}

export default function BodyMeasurementsTracker({ userId }: BodyMeasurementsTrackerProps) {
  const { measurements, isReady, saveMeasurement, deleteMeasurement } = useBodyMeasurements(userId)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [date, setDate] = useState(() => todayStr())
  const [values, setValues] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')

  const hasAnyValue = FIELDS.some(f => values[f.key] && parseFloat(values[f.key]) > 0)

  const handleSave = async () => {
    if (!hasAnyValue) return
    setSaving(true)
    try {
      const m: Omit<BodyMeasurement, 'id'> = {
        date,
        chest: values.chest ? parseFloat(values.chest) : undefined,
        waist: values.waist ? parseFloat(values.waist) : undefined,
        hips: values.hips ? parseFloat(values.hips) : undefined,
        arm_left: values.arm_left ? parseFloat(values.arm_left) : undefined,
        arm_right: values.arm_right ? parseFloat(values.arm_right) : undefined,
        thigh_left: values.thigh_left ? parseFloat(values.thigh_left) : undefined,
        thigh_right: values.thigh_right ? parseFloat(values.thigh_right) : undefined,
        note,
      }
      await saveMeasurement(m)
      setShowForm(false)
      setValues({})
      setNote('')
    } catch {
      // saveMeasurement handles its own error display
    } finally {
      setSaving(false)
    }
  }

  if (!isReady) return null

  const latest = measurements[0]
  const prev = measurements[1]

  return (
    <div className="mb-8">
      <div className="text-[10px] text-muted-foreground tracking-[3px] mb-4 uppercase">Medidas corporales</div>
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[11px] text-muted-foreground">
              {measurements.length > 0 ? `${measurements.length} registros` : 'Sin registros'}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowForm(s => !s)}
              className="text-[10px] tracking-widest hover:border-lime hover:text-lime"
            >
              {showForm ? 'CANCELAR' : '+ MEDIR'}
            </Button>
          </div>

          {showForm && (
            <div className="mb-4 p-4 bg-muted/20 rounded-lg border border-border/60 space-y-3">
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Fecha</label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-8 text-sm w-auto" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {FIELDS.map(f => (
                  <div key={f.key}>
                    <label className="text-[10px] text-muted-foreground mb-1 block">{f.label} (cm)</label>
                    <Input
                      type="number"
                      step="0.5"
                      value={values[f.key] || ''}
                      onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                      placeholder="cm"
                      className="h-8 text-sm"
                    />
                  </div>
                ))}
              </div>
              <Input
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Nota opcional"
                className="h-8 text-sm"
              />
              <Button
                onClick={handleSave}
                disabled={saving || !hasAnyValue}
                className="h-8 bg-lime text-lime-foreground hover:bg-lime/90 text-[10px] font-bold tracking-widest"
              >
                {saving ? '...' : 'GUARDAR'}
              </Button>
            </div>
          )}

          {/* Latest vs previous comparison */}
          {latest && (
            <div className="space-y-1.5">
              {FIELDS.map(f => {
                const cur = latest[f.key] as number | undefined
                const prv = prev?.[f.key] as number | undefined
                if (!cur) return null
                const diff = prv ? cur - prv : null
                return (
                  <div key={f.key} className="flex items-center gap-3 py-1">
                    <span className="text-[12px] text-muted-foreground w-20">{f.label}</span>
                    <span className="text-[13px] font-mono text-foreground">{cur} cm</span>
                    {diff !== null && (
                      <span className={cn(
                        'text-[10px] font-mono',
                        diff > 0 ? 'text-amber-400' : diff < 0 ? 'text-emerald-500' : 'text-muted-foreground'
                      )}>
                        {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                      </span>
                    )}
                  </div>
                )
              }).filter(Boolean)}
              <div className="text-[10px] text-muted-foreground pt-2 border-t border-border/60">
                Ultima medicion: {latest.date}
                {latest.note && <span className="italic ml-2">— {latest.note}</span>}
              </div>
            </div>
          )}

          {/* History */}
          {measurements.length > 1 && (
            <div className="mt-4 pt-4 border-t border-border/60">
              <div className="text-[9px] text-muted-foreground tracking-widest uppercase mb-2">Historial</div>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="text-left py-1 pr-2 font-mono">Fecha</th>
                      {FIELDS.map(f => <th key={f.key} className="text-right py-1 px-1 font-mono">{f.short}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {measurements.slice(0, 10).map(m => (
                      <tr key={m.id} className="border-t border-border/30 group">
                        <td className="py-1.5 pr-2 font-mono text-sky-400">{m.date}</td>
                        {FIELDS.map(f => (
                          <td key={f.key} className="text-right py-1.5 px-1 font-mono text-foreground">
                            {(m[f.key] as number) || '–'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
