import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkoutState, useWorkoutActions } from '../../contexts/WorkoutContext'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Progress } from '../ui/progress'
import { cn } from '../../lib/utils'

/**
 * Marcas que alimentan las skills del perfil (`settings.pr_*`). Sustituye a
 * «Objetivos a 6 meses» + «REGISTRAR PR» del inicio (#856); el inicio las
 * pierde en #855.
 */
const RECORDS = [
  { key: 'pr_pullups',   labelKey: 'dashboard.goal.pullups',   unit: 'reps', goal: 20 },
  { key: 'pr_pushups',   labelKey: 'dashboard.goal.pushups',   unit: 'reps', goal: 50 },
  { key: 'pr_lsit',      labelKey: 'dashboard.goal.lsit',      unit: 's',    goal: 30 },
  { key: 'pr_pistol',    labelKey: 'dashboard.goal.pistol',    unit: 'reps', goal: 1 },
  { key: 'pr_handstand', labelKey: 'dashboard.goal.handstand', unit: 's',    goal: 60 },
] as const

type RecordDef = (typeof RECORDS)[number]

function RecordRow({ record, current, onSave }: { record: RecordDef; current: number; onSave: (n: number) => void }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const pct = Math.min(100, (current / record.goal) * 100)
  const label = t(record.labelKey)

  const submit = () => {
    const n = parseFloat(value)
    if (!Number.isNaN(n) && n >= 0) onSave(n)
    setEditing(false)
    setValue('')
  }

  return (
    <li className="flex flex-col gap-2 py-3 border-b border-border/60 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className={cn('text-sm', pct >= 100 && 'text-lime')}>{label}</span>
        <span className="font-mono text-xs text-muted-foreground">
          <span className="text-foreground">{current}</span> / {record.goal}{record.unit === 's' ? ' s' : ''}
        </span>
      </div>
      <Progress value={pct} className="h-1" aria-label={label} />
      {editing ? (
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); submit() }}>
          <Input
            autoFocus type="number" min="0" inputMode="decimal"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setEditing(false) }}
            placeholder={String(current || record.goal)}
            className="h-10 flex-1"
            aria-label={t('profile.records.newValue', { label })}
          />
          <Button type="submit" className="h-10">{t('common.save')}</Button>
          <Button type="button" variant="ghost" className="h-10" onClick={() => setEditing(false)}>{t('common.cancel')}</Button>
        </form>
      ) : (
        <Button variant="outline" size="sm" className="self-start h-9" onClick={() => setEditing(true)}>
          {t('profile.records.update')}
        </Button>
      )}
    </li>
  )
}

export function SkillRecords() {
  const { t } = useTranslation()
  const { settings } = useWorkoutState()
  const { updateSettings } = useWorkoutActions()
  const values = settings as unknown as Record<string, number | undefined>

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">{t('profile.records.desc')}</p>
      <ul>
        {RECORDS.map(record => (
          <RecordRow
            key={record.key}
            record={record}
            current={values[record.key] || 0}
            onSave={n => updateSettings({ [record.key]: n })}
          />
        ))}
      </ul>
    </div>
  )
}
