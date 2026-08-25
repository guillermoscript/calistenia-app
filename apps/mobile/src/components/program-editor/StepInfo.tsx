/**
 * Paso 1 del editor de programas (#223): información básica.
 * Port de ProgramEditorPage web :237-320 (sin isOfficial en v1 mobile:
 * publicar como oficial es flujo de editor/admin desde web).
 *
 * La segunda tarjeta («catálogo y recomendación», #613) expone los campos que
 * `lib/matchPrograms.ts` necesita para poder recomendar el programa. Hasta que
 * existió solo se podían fijar por script, así que ningún programa creado desde
 * aquí entraba nunca en el «PARA TI» del onboarding.
 */
import { useState, type ReactNode } from 'react'
import { View, Pressable } from 'react-native'
import { Image } from 'expo-image'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { Card, CardContent } from '@/components/ui/card'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import type { ProgramEditorState } from '@calistenia/core/hooks/useProgramEditor'
import { EQUIPMENT_CATALOG, getEquipmentLabelKey } from '@calistenia/core/lib/equipment'
import { CONDITION_IDS, INJURY_IDS } from '@calistenia/core/types/onboarding'
import { pickCover, type MediaSource } from '@/lib/program-media'

const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const
const VISIBILITIES = ['private', 'link', 'public'] as const
const GOAL_TYPES = ['fat_loss', 'muscle_gain', 'maintain', 'skill'] as const
const SKILLS = ['pull_up', 'handstand', 'muscle_up', 'planche'] as const
const INTENSITIES = ['light', 'moderate', 'intense'] as const
const DAYS_PER_WEEK = [1, 2, 3, 4, 5, 6, 7] as const

/**
 * Vocabulario de `contraindications`: la unión de lesiones y condiciones, que
 * es exactamente contra lo que `matchPrograms` cruza el historial de salud del
 * usuario. Se deduplica porque `other` aparece en las dos listas.
 */
const CONTRAINDICATION_IDS: string[] = [
  ...INJURY_IDS,
  ...CONDITION_IDS.filter(c => !(INJURY_IDS as readonly string[]).includes(c)),
]

function contraindicationLabelKey(id: string): string {
  return (INJURY_IDS as readonly string[]).includes(id)
    ? `onboarding.injuries.${id}`
    : `onboarding.conditions.${id}`
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter(x => x !== id) : [...list, id]
}

/**
 * A nivel de módulo a propósito: declarada dentro de `StepInfo` sería un tipo
 * de componente nuevo en cada render y React la remontaría en cada pulsación.
 */
function SectionLabel({ children }: { children: ReactNode }) {
  return <Text className="text-[11px] uppercase tracking-wide text-muted-foreground">{children}</Text>
}

/**
 * Selector de portada (#618). Mismo camino que la foto de perfil de #434:
 * `expo-image-picker` → `uriToBlob` → subida multipart en `saveProgram`.
 *
 * A nivel de módulo por lo mismo que `SectionLabel`.
 */
function CoverPicker({
  info,
  updateInfo,
}: {
  info: ProgramEditorState['info']
  updateInfo: (info: Partial<ProgramEditorState['info']>) => void
}) {
  const { t } = useTranslation()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Lo elegido ahora gana a lo que hay en el servidor; si se ha quitado, no se
  // enseña nada aunque el registro todavía tenga fichero.
  const preview = info.coverFile?.previewUri || (info.coverRemoved ? null : info.coverUrl)

  const pick = async (source: MediaSource) => {
    if (busy) return
    setBusy(true)
    try {
      const result = await pickCover(source, {
        title: t('common.permissionRequired'),
        message: t(source === 'camera' ? 'common.cameraPermissionMessage' : 'common.galleryPermissionMessage'),
      })
      // `ok: null` es cancelar o denegar el permiso: no hay nada que contar.
      if (result.ok === null) return
      if (result.ok === false) {
        setError(t(result.reason === 'size' ? 'programEditor.coverTooLarge' : 'programEditor.coverUnsupported'))
        return
      }
      setError(null)
      haptics.light()
      updateInfo({ coverFile: result.files[0], coverRemoved: false })
    } finally {
      setBusy(false)
    }
  }

  const remove = () => {
    setError(null)
    haptics.light()
    updateInfo({ coverFile: null, coverRemoved: true })
  }

  return (
    <View className="gap-1.5">
      <SectionLabel>{t('programEditor.coverLabel')}</SectionLabel>
      {preview ? (
        <Image
          source={{ uri: preview }}
          style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 8 }}
          contentFit="cover"
          accessibilityLabel={t('programEditor.coverPreviewAlt')}
        />
      ) : (
        <View className="w-full items-center justify-center rounded-lg border border-dashed border-border py-8">
          <Text className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('programEditor.coverEmpty')}
          </Text>
        </View>
      )}
      <View className="flex-row gap-2">
        <Pressable
          onPress={() => void pick('gallery')}
          disabled={busy}
          className="flex-1 items-center rounded-lg border border-border py-2.5 active:opacity-70 disabled:opacity-40"
        >
          <Text className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('programEditor.coverPickGallery')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => void pick('camera')}
          disabled={busy}
          className="flex-1 items-center rounded-lg border border-border py-2.5 active:opacity-70 disabled:opacity-40"
        >
          <Text className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('programEditor.coverPickCamera')}
          </Text>
        </Pressable>
        {preview && (
          <Pressable
            onPress={remove}
            disabled={busy}
            className="items-center rounded-lg border border-border px-3 py-2.5 active:opacity-70 disabled:opacity-40"
          >
            <Text className="font-mono text-[10px] uppercase tracking-wide text-red-400">
              {t('programEditor.coverRemove')}
            </Text>
          </Pressable>
        )}
      </View>
      <Text className={cn('text-[11px]', error ? 'text-red-400' : 'text-muted-foreground')}>
        {error || t('programEditor.coverDesc')}
      </Text>
    </View>
  )
}

interface StepInfoProps {
  info: ProgramEditorState['info']
  updateInfo: (info: Partial<ProgramEditorState['info']>) => void
  redistributeWeeks: () => void
  /** Días de entrenamiento contados en la fase 1, para enseñar qué haría el modo automático. */
  derivedDaysPerWeek: number
}

export function StepInfo({ info, updateInfo, redistributeWeeks, derivedDaysPerWeek }: StepInfoProps) {
  const { t } = useTranslation()

  return (
    <View className="gap-4">
      <Card>
        <CardContent className="gap-4 p-5">
          <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
            {t('programEditor.programInfo')}
          </Text>

          <View className="gap-1.5">
            <Label nativeID="pe-name">
              <Text className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t('programEditor.nameLabel')}
              </Text>
            </Label>
            <Input
              aria-labelledby="pe-name"
              placeholder={t('programEditor.namePlaceholder')}
              value={info.name}
              onChangeText={name => updateInfo({ name })}
            />
          </View>

          <View className="gap-1.5">
            <Label nativeID="pe-desc">
              <Text className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t('programEditor.descLabel')}
              </Text>
            </Label>
            <Textarea
              aria-labelledby="pe-desc"
              placeholder={t('programEditor.descPlaceholder')}
              value={info.description}
              onChangeText={description => updateInfo({ description })}
              numberOfLines={3}
            />
          </View>

          <CoverPicker info={info} updateInfo={updateInfo} />

          <View className="gap-1.5">
            <Label nativeID="pe-instructions">
              <Text className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t('programEditor.instructionsLabel')}
              </Text>
            </Label>
            <Textarea
              aria-labelledby="pe-instructions"
              placeholder={t('programEditor.instructionsPlaceholder')}
              value={info.instructions}
              onChangeText={instructions => updateInfo({ instructions })}
              numberOfLines={5}
            />
            <Text className="text-[11px] text-muted-foreground">{t('programEditor.instructionsDesc')}</Text>
          </View>

          <View className="gap-1.5">
            <Label nativeID="pe-weeks">
              <Text className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t('programEditor.durationLabel')}
              </Text>
            </Label>
            <Input
              aria-labelledby="pe-weeks"
              keyboardType="number-pad"
              value={String(info.durationWeeks || '')}
              onChangeText={v => updateInfo({ durationWeeks: parseInt(v, 10) || 0 })}
              onBlur={redistributeWeeks}
            />
          </View>

          <View className="gap-1.5">
            <SectionLabel>{t('programEditor.difficultyLabel')}</SectionLabel>
            <View className="flex-row gap-2">
              {DIFFICULTIES.map(d => {
                const active = info.difficulty === d
                return (
                  <Pressable
                    key={d}
                    onPress={() => { haptics.light(); updateInfo({ difficulty: d }) }}
                    className={cn(
                      'flex-1 items-center rounded-lg border py-2.5 active:opacity-70',
                      active ? 'border-lime/50 bg-lime/10' : 'border-border bg-card',
                    )}
                  >
                    <Text className={cn('font-mono text-[10px] uppercase tracking-wide', active ? 'text-lime' : 'text-muted-foreground')}>
                      {t(`difficulty.${d}`)}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
          <View className="gap-1.5">
            <SectionLabel>{t('programEditor.visibilityLabel')}</SectionLabel>
            <View className="flex-row gap-2">
              {VISIBILITIES.map(v => {
                const active = info.visibility === v
                return (
                  <Pressable
                    key={v}
                    onPress={() => { haptics.light(); updateInfo({ visibility: v }) }}
                    className={cn(
                      'flex-1 items-center rounded-lg border py-2.5 active:opacity-70',
                      active ? 'border-lime/50 bg-lime/10' : 'border-border bg-card',
                    )}
                  >
                    <Text className={cn('font-mono text-[10px] uppercase tracking-wide', active ? 'text-lime' : 'text-muted-foreground')}>
                      {t(`programEditor.visibility.${v}`)}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
            <Text className="text-[11px] text-muted-foreground">
              {t(`programEditor.visibilityDesc.${info.visibility}`)}
            </Text>
          </View>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="gap-4 p-5">
          <View className="gap-1">
            <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
              {t('programEditor.catalogTitle')}
            </Text>
            <Text className="text-[11px] text-muted-foreground">{t('programEditor.catalogDesc')}</Text>
          </View>

          <View className="gap-1.5">
            <SectionLabel>{t('programEditor.goalLabel')}</SectionLabel>
            <View className="flex-row flex-wrap gap-2">
              <Chip
                label={t('programEditor.unset')}
                active={info.goalType === ''}
                onPress={() => updateInfo({ goalType: '', skill: '' })}
              />
              {GOAL_TYPES.map(g => (
                <Chip
                  key={g}
                  label={t(`programEditor.goal.${g}`)}
                  active={info.goalType === g}
                  // La skill se limpia aquí, en el estado, y no solo al guardar:
                  // si no, volver a «habilidad» reaparecería con la marca vieja
                  // ya seleccionada sin que el autor la haya vuelto a elegir.
                  onPress={() => updateInfo({ goalType: g, skill: g === 'skill' ? info.skill : '' })}
                />
              ))}
            </View>
          </View>

          {info.goalType === 'skill' && (
            <View className="gap-1.5">
              <SectionLabel>{t('programEditor.skillLabel')}</SectionLabel>
              <View className="flex-row flex-wrap gap-2">
                {SKILLS.map(sk => (
                  <Chip
                    key={sk}
                    label={t(`onboarding.focus.${sk}`)}
                    active={info.skill === sk}
                    onPress={() => updateInfo({ skill: sk })}
                  />
                ))}
              </View>
            </View>
          )}

          <View className="gap-1.5">
            <SectionLabel>{t('programEditor.intensityLabel')}</SectionLabel>
            <View className="flex-row flex-wrap gap-2">
              <Chip
                label={t('programEditor.unset')}
                active={info.intensity === ''}
                onPress={() => updateInfo({ intensity: '' })}
              />
              {INTENSITIES.map(i => (
                <Chip
                  key={i}
                  label={t(`programEditor.intensity.${i}`)}
                  active={info.intensity === i}
                  onPress={() => updateInfo({ intensity: i })}
                />
              ))}
            </View>
          </View>

          <View className="gap-1.5">
            <SectionLabel>{t('programEditor.daysPerWeekLabel')}</SectionLabel>
            <View className="flex-row flex-wrap gap-2">
              <Chip
                label={t('programEditor.daysPerWeekAuto', { n: derivedDaysPerWeek })}
                active={info.daysPerWeek === null}
                onPress={() => updateInfo({ daysPerWeek: null })}
              />
              {DAYS_PER_WEEK.map(n => (
                <Chip
                  key={n}
                  label={String(n)}
                  active={info.daysPerWeek === n}
                  onPress={() => updateInfo({ daysPerWeek: n })}
                />
              ))}
            </View>
            <Text className="text-[11px] text-muted-foreground">{t('programEditor.daysPerWeekDesc')}</Text>
          </View>

          <View className="gap-1.5">
            <SectionLabel>{t('programEditor.equipmentLabel')}</SectionLabel>
            <View className="flex-row flex-wrap gap-2">
              {EQUIPMENT_CATALOG.map(eq => (
                <Chip
                  key={eq.id}
                  label={`${eq.icon} ${t(getEquipmentLabelKey(eq.id))}`}
                  active={info.equipmentRequired.includes(eq.id)}
                  onPress={() => updateInfo({ equipmentRequired: toggle(info.equipmentRequired, eq.id) })}
                />
              ))}
            </View>
            <Text className="text-[11px] text-muted-foreground">{t('programEditor.equipmentDesc')}</Text>
          </View>

          <View className="gap-1.5">
            <SectionLabel>{t('programEditor.contraindicationsLabel')}</SectionLabel>
            <View className="flex-row flex-wrap gap-2">
              {CONTRAINDICATION_IDS.map(id => (
                <Chip
                  key={id}
                  label={t(contraindicationLabelKey(id))}
                  active={info.contraindications.includes(id)}
                  onPress={() => updateInfo({ contraindications: toggle(info.contraindications, id) })}
                />
              ))}
            </View>
            <Text className="text-[11px] text-muted-foreground">{t('programEditor.contraindicationsDesc')}</Text>
          </View>
        </CardContent>
      </Card>
    </View>
  )
}
