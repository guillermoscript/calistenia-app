/** Registro de ayunos: los tiempos se calculan desde fechas persistidas. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, AppState, Modal, Platform, Pressable, ScrollView, View } from 'react-native'
import { KeyboardAvoidingView, KeyboardProvider } from 'react-native-keyboard-controller'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ChevronRight, Clock3, Pencil, Trash2, X } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { Text } from '@/components/ui/text'
import { Kicker } from '@/components/ui/kicker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { subscribeFastingClock } from '@/lib/fasting-clock'
import type { UseFastingReturn } from '@calistenia/core/hooks/useFasting'
import { getTimezone } from '@calistenia/core/lib/dateUtils'
import { FASTING_PRESETS, formatFastingDuration, fromLocalDateTimeInput, getFastingErrorKey, getFastingProgress, getFastingSummary, toLocalDateTimeInput, type FastingSession } from '@calistenia/core/lib/fasting'

type Props = { fasting: UseFastingReturn }
type Editor = { mode: 'start' | 'finish' | 'manual' | 'edit'; session?: FastingSession }

function useFastingNow() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => subscribeFastingClock(AppState, setNow), [])
  return now
}

function dateLabel(iso: string, language: string) {
  return new Date(iso).toLocaleString(language, { timeZone: getTimezone(), month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function FastingOverview({ fasting, onOpen }: Props & { onOpen: () => void }) {
  const { t } = useTranslation()
  const now = useFastingNow()
  const active = fasting.activeSession
  const progress = active ? getFastingProgress(active, now) : null
  const detail = progress
    ? `${formatFastingDuration(progress.elapsedMs)} · ${t('fasting.goalHours', { hours: active!.goalHours })}`
    : fasting.isLoading ? t('fasting.loading')
      : fasting.error && fasting.sessions.length === 0 ? t(getFastingErrorKey(fasting.error))
        : t('fasting.overviewIdle', { hours: fasting.settings.goalHours })
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t('fasting.open')} onPress={onOpen} className="mb-5 flex-row items-center gap-3 rounded-xl border border-lime/30 bg-lime/5 p-4 active:bg-lime/10">
      <Clock3 size={22} color="#a3e635" />
      <View className="flex-1 gap-1">
        <Kicker tone="lime">{t(active ? 'fasting.active' : 'fasting.title')}</Kicker>
        <Text className="font-sans-medium text-sm text-foreground">
          {detail}
        </Text>
        {progress?.goalReached && <Text className="text-xs text-muted-foreground">{t('fasting.goalReached')}</Text>}
      </View>
      <ChevronRight size={18} color="#a3e635" />
    </Pressable>
  )
}

function DateTimeFields({ value, onChange, label, disabled }: { value: string; onChange: (v: string) => void; label: string; disabled: boolean }) {
  const { t } = useTranslation()
  const [date = '', time = ''] = value.split('T')
  return (
    <View className="gap-2">
      <Kicker tone="foreground">{label}</Kicker>
      <View className="flex-row gap-3">
        <View className="flex-1 gap-1">
          <Text className="text-xs text-muted-foreground">{t('fasting.date')}</Text>
          <Input accessibilityLabel={`${label}: ${t('fasting.date')}`} placeholder={t('fasting.datePlaceholder')} value={date} onChangeText={v => onChange(`${v}T${time}`)} editable={!disabled} autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" maxLength={10} className="font-mono h-12" />
        </View>
        <View className="w-28 gap-1">
          <Text className="text-xs text-muted-foreground">{t('fasting.time')}</Text>
          <Input accessibilityLabel={`${label}: ${t('fasting.time')}`} placeholder={t('fasting.timePlaceholder')} value={time} onChangeText={v => onChange(`${date}T${v}`)} editable={!disabled} autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" maxLength={5} className="font-mono h-12" />
        </View>
      </View>
    </View>
  )
}

function FastingEditor({ editor, fasting, onClose, defaultHours }: Props & { editor: Editor; onClose: () => void; defaultHours: number }) {
  const { t } = useTranslation()
  const session = editor.session
  const [start, setStart] = useState(() => toLocalDateTimeInput(session?.startedAt ?? new Date(Date.now() - (editor.mode === 'manual' ? defaultHours * 3600000 : 0)).toISOString()))
  const [defaultEnd] = useState(() => session?.endedAt ?? new Date().toISOString())
  const [end, setEnd] = useState(() => toLocalDateTimeInput(defaultEnd))
  const [hours, setHours] = useState(String(session?.goalHours ?? defaultHours))
  const [notes, setNotes] = useState(session?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const busy = saving || fasting.isSaving
  const hasEnd = editor.mode === 'finish' || editor.mode === 'manual' || !!session?.endedAt
  const titleKey = { start: 'fasting.startBackdated', finish: 'fasting.finish', manual: 'fasting.addPast', edit: 'fasting.edit' }[editor.mode]

  const save = async () => {
    if (savingRef.current || fasting.isSaving) return
    savingRef.current = true
    setError(null)
    setSaving(true)
    try {
      // Conservar segundos originales al editar solo notas o confirmar el final.
      const startedAt = session && start === toLocalDateTimeInput(session.startedAt) ? session.startedAt : fromLocalDateTimeInput(start)
      const endedAt = hasEnd ? (end === toLocalDateTimeInput(defaultEnd) ? defaultEnd : fromLocalDateTimeInput(end)) : null
      const goalHours = Number(hours)
      if (!hours.trim() || !Number.isFinite(goalHours) || goalHours < 1 || goalHours > 48) {
        setError('fasting.error.invalidGoal'); return
      }
      if (editor.mode === 'start') await fasting.startFast({ startedAt, goalHours, notes })
      else if (editor.mode === 'finish' && session) await fasting.finishFast(session.id, { endedAt: endedAt!, notes })
      else await fasting.saveFast({ id: session?.id, startedAt, endedAt, goalHours, notes })
      haptics.success()
      onClose()
    } catch (err) { setError(getFastingErrorKey(err)); haptics.error() }
    finally { savingRef.current = false; setSaving(false) }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={() => { if (!busy) onClose() }}>
      <KeyboardProvider>
        <SafeAreaView className="flex-1 bg-background">
          <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
              <Text className="flex-1 font-bebas text-3xl text-foreground">{t(titleKey)}</Text>
              <Button variant="ghost" size="icon" disabled={busy} accessibilityLabel={t('fasting.close')} onPress={onClose}><X size={22} color="#a3e635" /></Button>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="p-5 gap-6 pb-10">
              <Text className="text-sm text-muted-foreground">{t('fasting.localTimeHint')}</Text>
              {editor.mode !== 'finish' && <DateTimeFields value={start} onChange={setStart} label={t('fasting.startedAt')} disabled={busy} />}
              {hasEnd && <DateTimeFields value={end} onChange={setEnd} label={t('fasting.endedAt')} disabled={busy} />}
              {editor.mode !== 'finish' && <View className="gap-2"><Kicker>{t('fasting.durationGoal')}</Kicker><Input accessibilityLabel={t('fasting.durationGoal')} value={hours} onChangeText={setHours} keyboardType="decimal-pad" editable={!busy} className="h-12 font-mono" /><Text className="text-xs text-muted-foreground">{t('fasting.customHint')}</Text></View>}
              <View className="gap-2"><Kicker>{t('fasting.notes')}</Kicker><Input accessibilityLabel={t('fasting.notes')} value={notes} onChangeText={setNotes} placeholder={t('fasting.notesPlaceholder')} multiline textAlignVertical="top" maxLength={2000} editable={!busy} className="h-28 py-3" /></View>
              {editor.mode === 'finish' && <Text className="text-sm text-muted-foreground">{t('fasting.finishHint')}</Text>}
              {editor.mode !== 'finish' && Number(hours) >= 24 && <Text className="text-xs leading-5 text-muted-foreground">{t('fasting.extendedNotice')}</Text>}
              {error && <Text accessibilityRole="alert" className="text-sm text-red-500">{t(error)}</Text>}
              <Button size="lg" variant="limeSolid" disabled={busy} onPress={() => { void save() }}><Text>{t(busy ? 'fasting.saving' : 'fasting.save')}</Text></Button>
              <Button size="lg" variant="outline" disabled={busy} onPress={onClose}><Text>{t('fasting.cancel')}</Text></Button>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </KeyboardProvider>
    </Modal>
  )
}

export default function FastingPanel({ fasting }: Props) {
  const { t, i18n } = useTranslation()
  const now = useFastingNow()
  const [editor, setEditor] = useState<Editor | null>(null)
  const [goal, setGoal] = useState(String(fasting.settings.goalHours))
  const [weeklyGoal, setWeeklyGoal] = useState(String(fasting.settings.weeklyGoal))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [historyLimit, setHistoryLimit] = useState(10)
  useEffect(() => { setGoal(String(fasting.settings.goalHours)); setWeeklyGoal(String(fasting.settings.weeklyGoal)) }, [fasting.settings.goalHours, fasting.settings.weeklyGoal])
  const active = fasting.activeSession
  const progress = active ? getFastingProgress(active, now) : null
  const summary = useMemo(() => getFastingSummary(fasting.sessions, now), [fasting.sessions, now])
  const completed = fasting.sessions.filter(s => s.endedAt).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
  const busy = fasting.isSaving || saving
  const goalNumber = Number(goal)
  const validGoal = goal.trim() !== '' && Number.isFinite(goalNumber) && goalNumber >= 1 && goalNumber <= 48

  const mutate = async (action: () => Promise<unknown>) => {
    if (savingRef.current || fasting.isSaving) return
    savingRef.current = true
    setError(null); setSaving(true)
    try { await action(); haptics.success() }
    catch (err) {
      const key = getFastingErrorKey(err)
      setError(key); haptics.error()
      Alert.alert(t('fasting.title'), t(key))
    }
    finally { savingRef.current = false; setSaving(false) }
  }
  const deleteSession = (session: FastingSession) => Alert.alert(t('fasting.deleteTitle'), t('fasting.deleteDescription'), [
    { text: t('fasting.cancel'), style: 'cancel' },
    { text: t('fasting.delete'), style: 'destructive', onPress: () => { void mutate(() => fasting.deleteFast(session.id)) } },
  ])
  const saveSettings = () => {
    const weekly = Number(weeklyGoal)
    if (!goal.trim() || !Number.isFinite(goalNumber) || goalNumber < 1 || goalNumber > 48) { setError('fasting.error.invalidGoal'); Alert.alert(t('fasting.title'), t('fasting.error.invalidGoal')); return }
    if (!weeklyGoal.trim() || !Number.isInteger(weekly) || weekly < 1 || weekly > 7) { setError('fasting.error.invalidWeeklyGoal'); Alert.alert(t('fasting.title'), t('fasting.error.invalidWeeklyGoal')); return }
    void mutate(() => fasting.saveSettings({ goalHours: goalNumber, weeklyGoal: weekly }))
  }

  if (fasting.isLoading) return <View className="py-14 items-center gap-4"><ActivityIndicator color="#a3e635" /><Text className="text-muted-foreground">{t('fasting.loading')}</Text></View>
  if (fasting.error && fasting.sessions.length === 0) return (
    <View className="gap-4 rounded-lg border border-red-500/30 p-5">
      <Text accessibilityRole="alert" className="text-sm text-red-500">{t(error ?? getFastingErrorKey(fasting.error))}</Text>
      <Button variant="outline" size="lg" disabled={busy} onPress={() => { void mutate(fasting.refresh) }}><Text>{t('fasting.retry')}</Text></Button>
    </View>
  )

  return (
    <View className="gap-7 pb-4">
      {!!(error || fasting.error) && <View className="gap-3 rounded-lg border border-red-500/30 p-4"><Text accessibilityRole="alert" className="text-sm text-red-500">{t(error ?? getFastingErrorKey(fasting.error))}</Text><Button variant="outline" disabled={busy} onPress={() => { void mutate(fasting.refresh) }}><Text>{t('fasting.retry')}</Text></Button></View>}
      <View className="rounded-xl border border-lime/30 bg-card p-5 gap-4">
        <View className="flex-row items-center justify-between"><Kicker tone="lime">{t(active ? 'fasting.active' : 'fasting.ready')}</Kicker><Clock3 size={20} color="#a3e635" /></View>
        {active && progress ? <>
          <Text className="font-bebas text-6xl text-foreground" accessibilityLabel={`${t('fasting.elapsed')}: ${formatFastingDuration(progress.elapsedMs)}`}>{formatFastingDuration(progress.elapsedMs)}</Text>
          <View className="h-1.5 overflow-hidden rounded-full bg-muted" accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress.progress * 100) }}><View className="h-full bg-lime" style={{ width: `${progress.progress * 100}%` }} /></View>
          <View className="flex-row justify-between gap-3"><View className="flex-1 gap-1"><Kicker>{t('fasting.durationGoal')}</Kicker><Text className="font-mono text-sm">{t('fasting.goalHours', { hours: active.goalHours })}</Text></View><View className="flex-1 gap-1"><Kicker>{t('fasting.remainingLabel')}</Kicker><Text className="font-mono text-sm text-lime">{progress.goalReached ? t('fasting.goalReached') : formatFastingDuration(progress.remainingMs)}</Text></View></View>
          <Text className="text-xs text-muted-foreground">{t('fasting.startedAt')}: {dateLabel(active.startedAt, i18n.language)}</Text>
          <Text className="text-xs text-muted-foreground">{t('fasting.targetAt')}: {dateLabel(progress.targetAt, i18n.language)}</Text>
          {progress.goalReached && <Text className="text-sm text-muted-foreground">{t('fasting.stillActive')}</Text>}
          {!!active.notes && <Text className="text-sm text-muted-foreground">{active.notes}</Text>}
          <Button size="lg" variant="limeSolid" disabled={busy} onPress={() => setEditor({ mode: 'finish', session: active })}><Text>{t('fasting.finish')}</Text></Button>
          <View className="flex-row gap-2"><Button className="flex-1" variant="outline" disabled={busy} onPress={() => setEditor({ mode: 'edit', session: active })}><Text>{t('fasting.edit')}</Text></Button><Button className="flex-1" variant="danger" disabled={busy} onPress={() => deleteSession(active)}><Text>{t('fasting.delete')}</Text></Button></View>
        </> : <>
          <Text className="font-bebas text-4xl text-foreground">{t('fasting.noActive')}</Text>
          <Text className="text-sm text-muted-foreground">{t('fasting.startDescription')}</Text>
          <Button size="lg" variant="limeSolid" disabled={busy || !!fasting.error || !validGoal} onPress={() => { if (validGoal) void mutate(() => fasting.startFast({ goalHours: goalNumber })) }}><Text>{t('fasting.startNowWithGoal', { hours: validGoal ? goalNumber : fasting.settings.goalHours })}</Text></Button>
          <Button size="lg" variant="outline" disabled={busy || !!fasting.error || !validGoal} onPress={() => setEditor({ mode: 'start' })}><Text>{t('fasting.startBackdated')}</Text></Button>
        </>}
      </View>

      <View className="gap-4">
        <Kicker>{t('fasting.preferences')}</Kicker>
        <Text className="text-sm text-muted-foreground">{t('fasting.preferencesHint')}</Text>
        <View className="flex-row flex-wrap gap-2">{FASTING_PRESETS.map(hours => <Button key={hours} className="min-w-16 h-11" variant={goalNumber === hours ? 'lime' : 'outline'} disabled={busy} accessibilityState={{ selected: goalNumber === hours }} onPress={() => setGoal(String(hours))}><Text className="font-mono text-xs">{t('fasting.goalHours', { hours })}</Text></Button>)}</View>
        <View className="flex-row gap-3"><View className="flex-1 gap-2"><Kicker>{t('fasting.customHours')}</Kicker><Input accessibilityLabel={t('fasting.customHours')} value={goal} onChangeText={setGoal} keyboardType="decimal-pad" editable={!busy} className="font-mono h-12" /></View><View className="flex-1 gap-2"><Kicker>{t('fasting.weeklyGoal')}</Kicker><Input accessibilityLabel={t('fasting.weeklyGoal')} value={weeklyGoal} onChangeText={setWeeklyGoal} keyboardType="number-pad" maxLength={1} editable={!busy} className="font-mono h-12" /></View></View>
        <Text className="text-xs text-muted-foreground">{t('fasting.settingsLimits')}</Text>
        <Button variant="outline" size="lg" disabled={busy || (goalNumber === fasting.settings.goalHours && Number(weeklyGoal) === fasting.settings.weeklyGoal)} onPress={saveSettings}><Text>{t('fasting.savePreferences')}</Text></Button>
        {(goalNumber >= 24 || (active?.goalHours ?? 0) >= 24) && <Text className="text-xs leading-5 text-muted-foreground">{t('fasting.extendedNotice')}</Text>}
      </View>

      <View className="gap-4 border-t border-border pt-5">
        <Kicker>{t('fasting.progress')}</Kicker>
        <View className="flex-row flex-wrap gap-y-5">{[
          [t('fasting.thisWeek'), `${summary.weekCompleted}/${fasting.settings.weeklyGoal}`],
          [t('fasting.thisMonth'), String(summary.monthCompleted)],
          [t('fasting.completed'), String(summary.completedCount)],
          [t('fasting.goalsReached'), String(summary.goalsReached)],
        ].map(([label, value]) => <View key={label} className="w-1/2 gap-1"><Text className="font-bebas text-3xl text-foreground">{value}</Text><Kicker>{label}</Kicker></View>)}</View>
        <View className="gap-1"><Text className="text-xs text-muted-foreground">{t('fasting.weekHours', { hours: summary.weekHours.toLocaleString(i18n.language, { maximumFractionDigits: 1 }) })}</Text><Text className="text-xs text-muted-foreground">{t('fasting.monthHours', { hours: summary.monthHours.toLocaleString(i18n.language, { maximumFractionDigits: 1 }) })}</Text></View>
      </View>

      <View className="gap-4 border-t border-border pt-5">
        <View className="flex-row items-center justify-between gap-3"><Kicker>{t('fasting.history')}</Kicker><Button variant="lime" disabled={busy} onPress={() => setEditor({ mode: 'manual' })}><Text>{t('fasting.addPast')}</Text></Button></View>
        {completed.length === 0 && <View className="py-5 gap-2"><Text className="font-sans-medium">{t('fasting.historyEmpty')}</Text><Text className="text-sm text-muted-foreground">{t('fasting.historyEmptyHint')}</Text></View>}
        {completed.slice(0, historyLimit).map(session => {
          const duration = Date.parse(session.endedAt!) - Date.parse(session.startedAt)
          const reached = duration >= session.goalHours * 3600000
          return <View key={session.id} className="gap-2 border-b border-border pb-4">
            <View className="flex-row items-center gap-2"><Text className="flex-1 font-bebas text-2xl text-foreground">{formatFastingDuration(duration)}</Text><Button variant="ghost" size="icon" disabled={busy} accessibilityLabel={t('fasting.edit')} onPress={() => setEditor({ mode: 'edit', session })}><Pencil size={18} color="#a3e635" /></Button><Button variant="ghost" size="icon" disabled={busy} accessibilityLabel={t('fasting.delete')} onPress={() => deleteSession(session)}><Trash2 size={18} color="#ef4444" /></Button></View>
            <Text className={cn('font-mono text-[10px]', reached ? 'text-lime' : 'text-muted-foreground')}>{t('fasting.goalHours', { hours: session.goalHours })} · {t(reached ? 'fasting.goalReached' : 'fasting.savedSession')}</Text>
            <Text className="text-xs text-muted-foreground">{t('fasting.startedAt')}: {dateLabel(session.startedAt, i18n.language)}</Text>
            <Text className="text-xs text-muted-foreground">{t('fasting.endedAt')}: {dateLabel(session.endedAt!, i18n.language)}</Text>
            {!!session.notes && <Text className="text-sm text-muted-foreground">{session.notes}</Text>}
          </View>
        })}
        {completed.length > historyLimit && <Button variant="outline" size="lg" onPress={() => setHistoryLimit(limit => limit + 10)}><Text>{t('fasting.showMore')}</Text></Button>}
      </View>
      {editor && <FastingEditor key={`${editor.mode}:${editor.session?.id ?? 'new'}`} editor={editor} fasting={fasting} defaultHours={validGoal ? goalNumber : fasting.settings.goalHours} onClose={() => setEditor(null)} />}
    </View>
  )
}
