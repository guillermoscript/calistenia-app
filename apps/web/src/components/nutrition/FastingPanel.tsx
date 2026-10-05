import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock3, Plus, Pencil, Trash2, ArrowRight, ShieldCheck } from 'lucide-react'
import type { useFasting } from '@calistenia/core/hooks/useFasting'
import { getTimezone } from '@calistenia/core/lib/dateUtils'
import {
  FASTING_PRESETS, formatFastingDuration, fromLocalDateTimeInput,
  getFastingErrorKey, getFastingProgress, getFastingSummary, toLocalDateTimeInput,
} from '@calistenia/core/lib/fasting'
import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'
import { Input } from '../ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../ui/sheet'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { cn } from '../../lib/utils'

type FastingState = ReturnType<typeof useFasting>
type Session = NonNullable<FastingState['activeSession']>
type EditorMode = 'start' | 'finish' | 'past' | 'edit'
interface Editor { mode: EditorMode; session?: Session; startedAt: string; endedAt: string; originalStart: string; originalEnd: string | null; goalHours: string; notes: string }

function useNow() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const id = window.setInterval(tick, 1000)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    return () => { window.clearInterval(id); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick) }
  }, [])
  return now
}

export function FastingActiveCard({ session, onOpen }: { session: Session | null; onOpen: () => void }) {
  const { t } = useTranslation()
  const now = useNow()
  if (!session) return null
  const progress = getFastingProgress(session, now)
  return (
    <button onClick={onOpen} className="w-full flex items-center gap-3 p-4 mb-6 rounded-xl border border-lime/30 bg-lime/5 text-left hover:bg-lime/10 transition-colors">
      <Clock3 className="size-5 text-lime shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] tracking-widest uppercase text-lime">{t('fasting.active')}</div>
        <div className="font-mono tabular-nums text-lg">{formatFastingDuration(progress.elapsedMs)} <span className="text-xs text-muted-foreground">/ {session.goalHours} h</span></div>
      </div>
      <span className="hidden sm:inline text-xs text-muted-foreground">{t(progress.goalReached ? 'fasting.goalReached' : 'fasting.view')}</span>
      <ArrowRight className="size-4 text-lime shrink-0" />
    </button>
  )
}

export default function FastingPanel({ fasting }: { fasting: FastingState }) {
  const { t, i18n } = useTranslation()
  const now = useNow()
  const { sessions, activeSession, settings, isLoading, isSaving, error } = fasting
  const [goalHours, setGoalHours] = useState(String(settings.goalHours))
  const [weeklyGoal, setWeeklyGoal] = useState(String(settings.weeklyGoal))
  const [editor, setEditor] = useState<Editor | null>(null)
  const [deleting, setDeleting] = useState<Session | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const mutationLock = useRef(false)
  const [visibleCount, setVisibleCount] = useState(10)
  const saving = busy || isSaving
  const unavailable = Boolean(error) && sessions.length === 0
  useEffect(() => { setGoalHours(String(settings.goalHours)); setWeeklyGoal(String(settings.weeklyGoal)) }, [settings.goalHours, settings.weeklyGoal])
  const summary = useMemo(() => getFastingSummary(sessions, now), [sessions, now])
  const history = useMemo(() => [...sessions].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)), [sessions])
  const dateLabel = (iso: string) => new Date(iso).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short', timeZone: getTimezone() })
  const run = async (action: () => Promise<unknown>) => {
    if (mutationLock.current || isSaving) return
    mutationLock.current = true
    setBusy(true)
    setLocalError(null)
    try { await action() } catch (err) { setLocalError(getFastingErrorKey(err)) } finally { mutationLock.current = false; setBusy(false) }
  }
  const openEditor = (mode: EditorMode, session?: Session) => {
    setLocalError(null)
    const draftGoal = Number(goalHours) >= 1 && Number(goalHours) <= 48 ? Number(goalHours) : settings.goalHours
    const originalStart = session?.startedAt ?? new Date(mode === 'past' ? now - draftGoal * 3600000 : now).toISOString()
    const originalEnd = mode === 'finish' || mode === 'past' ? new Date(now).toISOString() : session?.endedAt ?? null
    setEditor({
      mode, session,
      originalStart, originalEnd,
      startedAt: toLocalDateTimeInput(originalStart),
      endedAt: originalEnd ? toLocalDateTimeInput(originalEnd) : '',
      goalHours: String(session?.goalHours ?? draftGoal), notes: session?.notes ?? '',
    })
  }
  const saveEditor = () => {
    if (!editor) return
    void run(async () => {
      // A notes-only edit must not round away seconds from the original record.
      const startedAt = editor.startedAt === toLocalDateTimeInput(editor.originalStart) ? editor.originalStart : fromLocalDateTimeInput(editor.startedAt)
      const endedAt = editor.endedAt && editor.originalEnd && editor.endedAt === toLocalDateTimeInput(editor.originalEnd) ? editor.originalEnd : editor.endedAt ? fromLocalDateTimeInput(editor.endedAt) : null
      const input = { startedAt, endedAt, goalHours: Number(editor.goalHours), notes: editor.notes }
      if (editor.mode === 'start') await fasting.startFast({ startedAt: input.startedAt, goalHours: input.goalHours, notes: input.notes })
      else if (editor.mode === 'finish' && editor.session) await fasting.finishFast(editor.session.id, { endedAt: input.endedAt!, notes: input.notes })
      else await fasting.saveFast({ ...input, id: editor.session?.id })
      setEditor(null)
    })
  }
  const errorKey = localError ?? (error ? getFastingErrorKey(error) : null)
  const errorNotice = errorKey && (
    <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-center justify-between gap-3">
      <span className="text-xs text-destructive">{t(errorKey)}</span>
      {Boolean(error) && <Button size="sm" variant="outline" disabled={saving || isLoading} onClick={() => void run(fasting.refresh)}>{t('fasting.retry')}</Button>}
    </div>
  )
  const progress = activeSession ? getFastingProgress(activeSession, now) : null
  const durationValid = Number(goalHours) >= 1 && Number(goalHours) <= 48
  const weeklyValid = Number.isInteger(Number(weeklyGoal)) && Number(weeklyGoal) >= 1 && Number(weeklyGoal) <= 7
  const editorNeedsEnd = editor?.mode === 'finish' || editor?.mode === 'past' || Boolean(editor?.session?.endedAt)

  return (
    <div className="space-y-6" data-testid="fasting-panel">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div><h2 className="font-bebas text-3xl tracking-wide">{t('fasting.title')}</h2><p className="text-xs text-muted-foreground">{t('fasting.subtitle')}</p></div>
        <Button variant="outline" size="sm" onClick={() => openEditor('past')} disabled={saving || isLoading || unavailable}><Plus />{t('fasting.addPast')}</Button>
      </div>
      {errorNotice}
      {isLoading && sessions.length === 0 ? <div className="h-64 animate-pulse bg-muted rounded-xl" role="status" aria-label={t('fasting.loading')} /> : unavailable ? null : (
        <>
          {activeSession && progress ? (
            <Card className="border-lime/30 bg-lime/5 overflow-hidden">
              <CardContent className="p-5 md:p-7 space-y-5">
                <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-[10px] text-lime tracking-widest uppercase"><Clock3 className="size-4" />{t('fasting.active')}</span><span className="font-mono text-xs text-muted-foreground">{t('fasting.target', { hours: activeSession.goalHours })}</span></div>
                <div className="text-center py-2"><div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-2">{t('fasting.elapsed')}</div><div className="font-mono tabular-nums text-4xl sm:text-6xl tracking-tight text-lime" data-testid="fasting-timer">{formatFastingDuration(progress.elapsedMs)}</div><div className="text-xs text-muted-foreground mt-3">{progress.goalReached ? t('fasting.goalReachedManual') : t('fasting.remaining', { time: formatFastingDuration(progress.remainingMs) })}</div></div>
                <div role="progressbar" aria-label={t('fasting.progress')} aria-valuenow={Math.round(progress.progress * 100)} aria-valuemin={0} aria-valuemax={100} className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-lime transition-[width] duration-1000" style={{ width: `${progress.progress * 100}%` }} /></div>
                <div className="grid sm:grid-cols-2 gap-3 text-xs"><div><span className="block text-[9px] tracking-widest uppercase text-muted-foreground mb-1">{t('fasting.startedAt')}</span>{dateLabel(activeSession.startedAt)}</div><div><span className="block text-[9px] tracking-widest uppercase text-muted-foreground mb-1">{t('fasting.targetAt')}</span>{dateLabel(progress.targetAt)}</div></div>
                {activeSession.notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{activeSession.notes}</p>}
                <div className="flex gap-3"><Button variant="outline" className="flex-1" disabled={saving} onClick={() => openEditor('edit', activeSession)}><Pencil />{t('fasting.edit')}</Button><Button variant="limeSolid" className="flex-1 font-bebas text-lg tracking-wide" disabled={saving} onClick={() => openEditor('finish', activeSession)}>{t('fasting.finish')}</Button></div>
              </CardContent>
            </Card>
          ) : <Card><CardContent className="p-5 md:p-7 text-center"><Clock3 className="size-8 text-lime mx-auto mb-3" /><h3 className="font-bebas text-2xl">{t('fasting.ready')}</h3><p className="text-xs text-muted-foreground mt-1 mb-5">{t('fasting.readyDesc')}</p><div className="flex justify-center gap-3 flex-wrap"><Button variant="limeSolid" className="font-bebas text-lg tracking-wide px-6" disabled={saving || !durationValid} onClick={() => void run(() => fasting.startFast({ goalHours: Number(goalHours) }))}>{t('fasting.startNowWithGoal', { hours: Number(goalHours) })}</Button><Button variant="outline" disabled={saving || !durationValid} onClick={() => openEditor('start')}>{t('fasting.startedEarlier')}</Button></div></CardContent></Card>}

          <Card><CardContent className="p-5"><h3 className="font-bebas text-xl tracking-wide mb-4">{t('fasting.goals')}</h3><form onSubmit={e => { e.preventDefault(); void run(() => fasting.saveSettings({ goalHours: Number(goalHours), weeklyGoal: Number(weeklyGoal) })) }} className="space-y-4">
            <div className="flex flex-wrap gap-2">{FASTING_PRESETS.map(hours => <Button key={hours} size="sm" variant={Number(goalHours) === hours ? 'lime' : 'outline'} aria-pressed={Number(goalHours) === hours} type="button" onClick={() => setGoalHours(String(hours))} disabled={saving}>{hours} h</Button>)}</div>
            <div className="grid sm:grid-cols-2 gap-4"><label className="text-xs text-muted-foreground space-y-1.5"><span className="block">{t('fasting.customHours')}</span><Input type="number" min={1} max={48} step={0.5} value={goalHours} onChange={e => setGoalHours(e.target.value)} required disabled={saving} /></label><label className="text-xs text-muted-foreground space-y-1.5"><span className="block">{t('fasting.weeklyGoal')}</span><Input type="number" min={1} max={7} step={1} value={weeklyGoal} onChange={e => setWeeklyGoal(e.target.value)} required disabled={saving} /></label></div>
            <div className="flex items-center justify-between gap-4"><p className="text-[11px] text-muted-foreground">{t('fasting.goalAppliesNext')}</p><Button type="submit" variant="outline" disabled={saving || !durationValid || !weeklyValid}>{t('fasting.saveGoals')}</Button></div>
          </form></CardContent></Card>

          <div><h3 className="font-bebas text-xl tracking-wide mb-3">{t('fasting.progress')}</h3><div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[
            [t('fasting.thisWeek'), `${summary.weekCompleted} / ${settings.weeklyGoal}`],
            [t('fasting.thisMonth'), String(summary.monthCompleted)],
            [t('fasting.completed'), String(summary.completedCount)],
            [t('fasting.goalsReached'), String(summary.goalsReached)],
          ].map(([label, value]) => <div key={label} className="p-4 rounded-lg border border-border bg-card"><div className="font-bebas text-3xl text-lime">{value}</div><div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div></div>)}</div><div className="flex gap-4 flex-wrap text-xs text-muted-foreground mt-3"><span>{t('fasting.weekHours', { hours: summary.weekHours.toFixed(1) })}</span><span>{t('fasting.monthHours', { hours: summary.monthHours.toFixed(1) })}</span></div></div>

          <div><div className="flex items-center justify-between mb-3"><h3 className="font-bebas text-xl tracking-wide">{t('fasting.history')}</h3><span className="font-mono text-xs text-muted-foreground">{sessions.length}</span></div>{history.length === 0 ? <div className="p-6 text-center rounded-xl border border-dashed border-border"><p className="text-sm">{t('fasting.empty')}</p><p className="text-xs text-muted-foreground mt-1">{t('fasting.emptyDesc')}</p></div> : <div className="space-y-2">{history.slice(0, visibleCount).map(session => {
            const rowProgress = getFastingProgress(session, session.endedAt ? Date.parse(session.endedAt) : now)
            return <div key={session.id} className="p-4 bg-card border border-border rounded-xl"><div className="flex items-start gap-3"><div className="flex-1 min-w-0"><div className="flex items-center gap-2 flex-wrap"><span className="font-mono text-lg tabular-nums">{formatFastingDuration(rowProgress.elapsedMs)}</span><span className={cn('text-[9px] uppercase tracking-wider rounded px-2 py-1', !session.endedAt || rowProgress.goalReached ? 'text-lime bg-lime/10' : 'text-muted-foreground bg-muted')}>{t(!session.endedAt ? 'fasting.active' : rowProgress.goalReached ? 'fasting.goalReached' : 'fasting.finished')}</span></div><div className="text-[11px] text-muted-foreground mt-1">{t('fasting.target', { hours: session.goalHours })}</div><div className="text-[11px] text-muted-foreground mt-1 break-words">{dateLabel(session.startedAt)} → {session.endedAt ? dateLabel(session.endedAt) : t('fasting.inProgress')}</div>{session.notes && <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap break-words">{session.notes}</p>}</div><div className="flex shrink-0 gap-1"><Button size="icon-sm" variant="ghost" aria-label={t('fasting.editSession')} disabled={saving} onClick={() => openEditor('edit', session)}><Pencil /></Button><Button size="icon-sm" variant="ghost" aria-label={t('fasting.deleteSession')} disabled={saving} onClick={() => { setLocalError(null); setDeleting(session) }} className="text-muted-foreground hover:text-destructive"><Trash2 /></Button></div></div></div>
          })}{history.length > visibleCount && <Button variant="outline" className="w-full" onClick={() => setVisibleCount(n => n + 10)}>{t('fasting.showMore')}</Button>}</div>}</div>
        </>
      )}
      <div className="flex gap-3 p-4 rounded-xl bg-muted/30 border border-border text-xs text-muted-foreground leading-relaxed"><ShieldCheck className="size-4 shrink-0 mt-0.5" /><p>{t('fasting.safety')}</p></div>

      <Sheet open={Boolean(editor)} onOpenChange={open => { if (!open && !saving) { setEditor(null); setLocalError(null) } }}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90dvh] overflow-y-auto">
          <div className="max-w-lg mx-auto"><SheetHeader className="mb-5"><SheetTitle className="font-bebas text-2xl tracking-wide">{t(`fasting.editor.${editor?.mode ?? 'start'}`)}</SheetTitle><SheetDescription>{t(editor?.mode === 'finish' ? 'fasting.finishDesc' : 'fasting.editorDesc')}</SheetDescription></SheetHeader>
            {editor && <form className="space-y-4 pb-4" onSubmit={e => { e.preventDefault(); saveEditor() }}>
              {localError && <p role="alert" className="text-xs text-destructive">{t(localError)}</p>}
              <fieldset disabled={saving} className="space-y-4">
                <label className="block text-xs text-muted-foreground space-y-1.5"><span className="block">{t('fasting.startedAt')}</span><Input type="datetime-local" value={editor.startedAt} max={toLocalDateTimeInput(new Date(now).toISOString())} required disabled={editor.mode === 'finish'} onChange={e => setEditor({ ...editor, startedAt: e.target.value })} /></label>
                {editor.mode !== 'start' && <label className="block text-xs text-muted-foreground space-y-1.5"><span className="block">{t('fasting.endedAt')}{!editorNeedsEnd && ` (${t('fasting.optional')})`}</span><Input type="datetime-local" value={editor.endedAt} max={toLocalDateTimeInput(new Date(now).toISOString())} required={editorNeedsEnd} onChange={e => setEditor({ ...editor, endedAt: e.target.value })} /></label>}
                <label className="block text-xs text-muted-foreground space-y-1.5"><span className="block">{t('fasting.customHours')}</span><Input type="number" min={1} max={48} step={0.5} value={editor.goalHours} required disabled={editor.mode === 'finish'} onChange={e => setEditor({ ...editor, goalHours: e.target.value })} /></label>
                <label className="block text-xs text-muted-foreground space-y-1.5"><span className="block">{t('fasting.notes')}</span><textarea className="w-full min-h-24 rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" maxLength={1000} value={editor.notes} placeholder={t('fasting.notesPlaceholder')} onChange={e => setEditor({ ...editor, notes: e.target.value })} /></label>
              </fieldset>
              <div className="flex gap-3 pt-2"><Button variant="outline" type="button" className="flex-1" disabled={saving} onClick={() => { setEditor(null); setLocalError(null) }}>{t('fasting.cancel')}</Button><Button variant="limeSolid" type="submit" className="flex-1 font-bebas text-lg tracking-wide" disabled={saving}>{t(saving ? 'fasting.saving' : editor.mode === 'finish' ? 'fasting.confirmFinish' : 'fasting.save')}</Button></div>
            </form>}
          </div>
        </SheetContent>
      </Sheet>
      <Dialog open={Boolean(deleting)} onOpenChange={open => { if (!open && !saving) { setDeleting(null); setLocalError(null) } }}><DialogContent className="max-w-sm rounded-xl"><DialogHeader><DialogTitle className="font-bebas text-2xl">{t('fasting.deleteSession')}</DialogTitle><DialogDescription>{t('fasting.deleteConfirm')}</DialogDescription></DialogHeader>{localError && <p role="alert" className="text-xs text-destructive">{t(localError)}</p>}<div className="flex gap-3"><Button variant="outline" className="flex-1" disabled={saving} onClick={() => { setDeleting(null); setLocalError(null) }}>{t('fasting.cancel')}</Button><Button variant="destructive" className="flex-1" disabled={saving} onClick={() => deleting && void run(async () => { await fasting.deleteFast(deleting.id); setDeleting(null) })}>{t(saving ? 'fasting.saving' : 'fasting.delete')}</Button></div></DialogContent></Dialog>
    </div>
  )
}
