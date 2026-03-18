import { useCallback } from 'react'
import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'
import type { ProgressMap, ExerciseLog, SetData } from '../../types'
import type { WeightEntry } from '../../hooks/useWeight'

interface ExportDataProps {
  progress: ProgressMap
  weights: WeightEntry[]
}

function progressToCSV(progress: ProgressMap): string {
  const rows: string[] = ['date,type,exercise,reps,weight_kg,note']

  Object.entries(progress).forEach(([key, val]) => {
    if (key.startsWith('done_')) {
      const date = key.split('_')[1]
      const workoutKey = key.split('_').slice(2).join('_')
      const note = (val as { note?: string }).note || ''
      rows.push(`${date},session,${workoutKey},,,${note.replace(/,/g, ';')}`)
    } else {
      const log = val as ExerciseLog
      if (log.exerciseId && log.sets) {
        log.sets.forEach((s: SetData, i: number) => {
          rows.push(`${log.date},set,${log.exerciseId},${s.reps},${s.weight || ''},${(s.note || '').replace(/,/g, ';')}`)
        })
      }
    }
  })

  return rows.join('\n')
}

function weightsToCSV(weights: WeightEntry[]): string {
  const rows = ['date,weight_kg,note']
  weights.forEach(w => {
    rows.push(`${w.date},${w.weight_kg},${(w.note || '').replace(/,/g, ';')}`)
  })
  return rows.join('\n')
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function ExportData({ progress, weights }: ExportDataProps) {
  const handleExportSessions = useCallback(() => {
    const csv = progressToCSV(progress)
    const date = new Date().toISOString().split('T')[0]
    downloadCSV(csv, `calistenia_sessions_${date}.csv`)
  }, [progress])

  const handleExportWeight = useCallback(() => {
    const csv = weightsToCSV(weights)
    const date = new Date().toISOString().split('T')[0]
    downloadCSV(csv, `calistenia_weight_${date}.csv`)
  }, [weights])

  return (
    <div className="mb-8">
      <div className="text-[10px] text-muted-foreground tracking-[3px] mb-4 uppercase">Exportar datos</div>
      <Card>
        <CardContent className="p-5">
          <div className="flex gap-3 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportSessions}
              className="text-[10px] tracking-widest hover:border-lime hover:text-lime"
            >
              SESIONES CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportWeight}
              className="text-[10px] tracking-widest hover:border-lime hover:text-lime"
            >
              PESO CSV
            </Button>
          </div>
          <div className="text-[10px] text-muted-foreground mt-2">
            Descarga tus datos de entrenamiento y peso en formato CSV
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
