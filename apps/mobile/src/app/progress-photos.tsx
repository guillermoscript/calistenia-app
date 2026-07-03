/**
 * Fotos de progreso (native) — parity con la tab "Cuerpo" de web.
 * Timeline en grid + subida (cámara/galería) con categoría, fecha y nota.
 * v1 sin "phase" (date + category + note), tope 5 MB (campo PB body_photos.photo).
 */
import { useMemo, useState } from 'react'
import {
  View,
  Pressable,
  FlatList,
  Modal,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useColorScheme } from 'nativewind'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { ChevronLeft, ChevronRight, Plus, Camera, Images, Trash2, X, Columns2 } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Chip } from '@/components/ui/chip'
import PhotoComparator from '@/components/progress/PhotoComparator'
import { haptics } from '@/lib/haptics'
import { Sentry } from '@/lib/instrument'
import {
  uriToBlob,
  requestCameraPermission,
  requestMediaPermission,
  MAX_PHOTO_SIZE_BYTES,
} from '@/lib/image-upload'
import { useAuthUser } from '@/lib/use-auth-user'
import { useBodyPhotos, type BodyPhoto } from '@calistenia/core/hooks/useBodyPhotos'
import { todayStr, addDays } from '@calistenia/core/lib/dateUtils'

const CATEGORIES = [
  { value: 'front', labelKey: 'progress.bodyPhotos.front' },
  { value: 'side', labelKey: 'progress.bodyPhotos.side' },
  { value: 'back', labelKey: 'progress.bodyPhotos.back' },
] as const

type Category = (typeof CATEGORIES)[number]['value']
type Filter = 'all' | Category

export default function ProgressPhotosScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { colorScheme } = useColorScheme()
  const LIME = colorScheme === 'dark' ? 'hsl(74 90% 57%)' : 'hsl(74 90% 38%)'
  const MUTED = 'rgba(255,255,255,0.45)'
  const { width } = useWindowDimensions()

  const user = useAuthUser()
  const userId = user?.id ?? null
  const { photos, isReady, uploadPhoto, deletePhoto } = useBodyPhotos(userId)

  const [filter, setFilter] = useState<Filter>('all')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)
  const [lightbox, setLightbox] = useState<BodyPhoto | null>(null)

  // ── Upload form state ──────────────────────────────────────────────────────
  const [uri, setUri] = useState<string | null>(null)
  const [mimeType, setMimeType] = useState('image/jpeg')
  const [category, setCategory] = useState<Category>('front')
  const [date, setDate] = useState(() => todayStr())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const filtered = useMemo(
    () => (filter === 'all' ? photos : photos.filter((p) => p.category === filter)),
    [photos, filter],
  )

  // Two-column grid: subtract screen padding (px-4 = 16*2) and the inter-column gap.
  const cardW = (width - 32 - 12) / 2

  const resetForm = () => {
    setUri(null)
    setMimeType('image/jpeg')
    setCategory('front')
    setDate(todayStr())
    setNote('')
    setSaving(false)
  }

  const openUpload = () => {
    haptics.selection()
    resetForm()
    setUploadOpen(true)
  }

  const closeUpload = () => {
    setUploadOpen(false)
    resetForm()
  }

  const tooLargeMsg = () =>
    t('progress.bodyPhotos.fileTooLargeMobile') || 'La foto es demasiado grande (máx. 5 MB)'

  const pick = async (source: 'camera' | 'gallery') => {
    haptics.selection()
    const ok =
      source === 'camera'
        ? await requestCameraPermission({
            title: t('common.permissionRequired') || 'Permiso requerido',
            message: t('common.cameraPermissionMessage') || 'Se necesita acceso a la cámara para tomar fotos.',
          })
        : await requestMediaPermission({
            title: t('common.permissionRequired') || 'Permiso requerido',
            message: t('common.galleryPermissionMessage') || 'Se necesita acceso a la galería.',
          })
    if (!ok) return

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.8,
            allowsEditing: false,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.8,
            allowsMultipleSelection: false,
          })

    if (result.canceled || !result.assets?.[0]) return
    const asset = result.assets[0]
    // Reject oversized picks up-front where the picker already reports a size.
    if (asset.fileSize != null && asset.fileSize > MAX_PHOTO_SIZE_BYTES) {
      Alert.alert(tooLargeMsg())
      return
    }
    setUri(asset.uri)
    setMimeType(asset.mimeType ?? 'image/jpeg')
  }

  const save = async () => {
    if (!uri || saving || !userId) return
    setSaving(true)
    try {
      const blob = await uriToBlob(uri, mimeType)
      // Some pickers don't report fileSize, so re-check on the real blob.
      if (blob.size > MAX_PHOTO_SIZE_BYTES) {
        Alert.alert(tooLargeMsg())
        setSaving(false)
        return
      }
      await uploadPhoto(blob, date, category, note.trim() || undefined)
      haptics.success()
      closeUpload()
    } catch (e) {
      Sentry.captureException(e)
      haptics.error()
      Alert.alert(t('progress.bodyPhotos.uploadError') || 'No se pudo subir la foto')
      setSaving(false)
    }
  }

  const confirmDelete = (photo: BodyPhoto) => {
    haptics.selection()
    Alert.alert(
      t('progress.bodyPhotos.confirmDelete') || '¿Eliminar esta foto?',
      undefined,
      [
        { text: t('progress.bodyPhotos.cancel') || 'Cancelar', style: 'cancel' },
        {
          text: t('progress.bodyPhotos.delete') || 'Eliminar',
          style: 'destructive',
          onPress: () => {
            haptics.medium()
            deletePhoto(photo.id)
          },
        },
      ],
    )
  }

  const catLabel = (value: string) =>
    t(CATEGORIES.find((c) => c.value === value)?.labelKey || value)

  // ── Photo card ─────────────────────────────────────────────────────────────
  const renderItem = ({ item }: { item: BodyPhoto }) => (
    <Pressable
      onPress={() => {
        haptics.selection()
        setLightbox(item)
      }}
      style={{ width: cardW }}
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <Image
        source={{ uri: item.url }}
        style={{ width: '100%', aspectRatio: 3 / 4 }}
        contentFit="cover"
        transition={150}
      />
      {/* Bottom meta overlay */}
      <View className="absolute inset-x-0 bottom-0 gap-0.5 bg-black/55 px-2 py-1.5">
        <Text className="font-mono text-[9px] uppercase tracking-wide text-lime">
          {catLabel(item.category)}
        </Text>
        <Text className="font-mono text-[10px] text-foreground">{item.date}</Text>
        {!!item.note && (
          <Text numberOfLines={1} className="font-sans text-[10px] text-muted-foreground">
            {item.note}
          </Text>
        )}
      </View>
      {/* Delete */}
      <Pressable
        onPress={() => confirmDelete(item)}
        hitSlop={8}
        className="absolute right-1.5 top-1.5 size-7 items-center justify-center rounded-full bg-black/60 active:bg-black/80"
      >
        <Trash2 size={14} color="rgba(255,255,255,0.8)" />
      </Pressable>
    </Pressable>
  )

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        renderItem={renderItem}
        numColumns={2}
        columnWrapperStyle={{ gap: 12, marginBottom: 12 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View className="pb-4">
            {/* Header: back + mono kicker + Bebas title */}
            <Pressable
              onPress={() => {
                haptics.selection()
                router.back()
              }}
              hitSlop={8}
              className="-ml-2 mb-1 size-9 flex-row items-center justify-center self-start rounded-lg"
            >
              <ChevronLeft size={24} color={MUTED} />
            </Pressable>
            <View className="flex-row items-end justify-between">
              <View className="flex-1">
                <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
                  {t('progress.bodyPhotos.kicker') || 'Registro visual'}
                </Text>
                <Text className="font-bebas text-4xl text-foreground">
                  {t('progress.bodyPhotos.title')}
                </Text>
              </View>
              {photos.length >= 2 && (
                <Button
                  variant="lime"
                  size="sm"
                  onPress={() => {
                    haptics.selection()
                    setCompareOpen(true)
                  }}
                >
                  <Columns2 size={14} color={LIME} />
                  <Text className="font-mono text-[11px] uppercase tracking-wide">
                    {t('progress.bodyPhotos.compare')}
                  </Text>
                </Button>
              )}
            </View>

            {/* Category filter chips */}
            <View className="mt-4 flex-row flex-wrap gap-2">
              <Chip
                label={t('progress.bodyPhotos.all') || 'Todas'}
                active={filter === 'all'}
                onPress={() => setFilter('all')}
              />
              {CATEGORIES.map((c) => (
                <Chip
                  key={c.value}
                  label={t(c.labelKey)}
                  active={filter === c.value}
                  onPress={() => setFilter(c.value)}
                />
              ))}
            </View>

            {photos.length > 0 && (
              <Text className="mt-4 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
                {filtered.length} {t('progress.bodyPhotos.countLabel') || 'Fotos'}
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          !isReady ? (
            <View className="items-center py-20">
              <ActivityIndicator color={LIME} />
            </View>
          ) : (
            <View className="items-center px-6 py-20">
              <Camera size={32} color={MUTED} />
              <Text className="mt-4 text-center font-sans text-sm text-muted-foreground">
                {userId
                  ? t('progress.bodyPhotos.emptyState')
                  : t('progress.bodyPhotos.loginRequired')}
              </Text>
            </View>
          )
        }
      />

      {/* FAB */}
      {!!userId && (
        <Pressable
          onPress={openUpload}
          className="absolute bottom-8 right-5 size-14 items-center justify-center rounded-full bg-lime-400 active:bg-lime-300"
          style={{ shadowColor: 'hsl(74 90% 45%)', shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 }}
        >
          <Plus size={28} color="#1a2000" strokeWidth={2.5} />
        </Pressable>
      )}

      {/* Upload sheet (native Modal — slide, non-gesture escape via backdrop / ✕) */}
      <Modal visible={uploadOpen} transparent animationType="slide" onRequestClose={closeUpload}>
        <Pressable className="flex-1 justify-end bg-black/60" onPress={closeUpload}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="gap-4 rounded-t-3xl border-t border-border bg-background px-4 pb-8 pt-3"
          >
            {/* Drag handle + title row */}
            <View className="items-center">
              <View className="h-1 w-10 rounded-full bg-border" />
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="font-bebas text-2xl text-foreground">
                {t('progress.bodyPhotos.newPhoto') || 'Nueva foto'}
              </Text>
              <Pressable onPress={closeUpload} hitSlop={8} className="size-8 items-center justify-center">
                <X size={22} color={MUTED} />
              </Pressable>
            </View>

            {/* Image picker / preview */}
            {uri ? (
              <Pressable onPress={() => setUri(null)} className="overflow-hidden rounded-xl border border-border">
                <Image
                  source={{ uri }}
                  style={{ width: '100%', aspectRatio: 3 / 4, maxHeight: 260 }}
                  contentFit="cover"
                  transition={150}
                />
                <View className="absolute right-2 top-2 flex-row items-center gap-1 rounded-full bg-black/60 px-2.5 py-1">
                  <X size={12} color="rgba(255,255,255,0.85)" />
                  <Text className="font-mono text-[10px] uppercase tracking-wide text-white">
                    {t('progress.bodyPhotos.changeImage') || 'Cambiar'}
                  </Text>
                </View>
              </Pressable>
            ) : (
              <View className="flex-row gap-3">
                <Button variant="lime" className="flex-1" onPress={() => pick('camera')}>
                  <Camera size={16} color={LIME} />
                  <Text>{t('progress.bodyPhotos.camera') || 'Cámara'}</Text>
                </Button>
                <Button variant="lime" className="flex-1" onPress={() => pick('gallery')}>
                  <Images size={16} color={LIME} />
                  <Text>{t('progress.bodyPhotos.gallery') || 'Galería'}</Text>
                </Button>
              </View>
            )}

            {/* Category */}
            <View className="gap-2">
              <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
                {t('progress.bodyPhotos.category')}
              </Text>
              <View className="flex-row gap-2">
                {CATEGORIES.map((c) => (
                  <Chip
                    key={c.value}
                    label={t(c.labelKey)}
                    active={category === c.value}
                    onPress={() => setCategory(c.value)}
                  />
                ))}
              </View>
            </View>

            {/* Date stepper */}
            <View className="gap-2">
              <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
                {t('progress.bodyPhotos.date')}
              </Text>
              <View className="flex-row items-center gap-3">
                <Pressable
                  onPress={() => {
                    haptics.selection()
                    setDate((d) => addDays(d, -1))
                  }}
                  hitSlop={8}
                  className="size-9 items-center justify-center rounded-lg border border-border active:bg-lime/10"
                >
                  <ChevronLeft size={18} color={MUTED} />
                </Pressable>
                <Text className="font-mono text-base text-foreground">
                  {date === todayStr() ? t('progress.bodyPhotos.today') || 'Hoy' : date}
                </Text>
                <Pressable
                  disabled={date >= todayStr()}
                  onPress={() => {
                    if (date >= todayStr()) return
                    haptics.selection()
                    setDate((d) => addDays(d, 1))
                  }}
                  hitSlop={8}
                  className={`size-9 items-center justify-center rounded-lg border border-border ${
                    date >= todayStr() ? 'opacity-40' : 'active:bg-lime/10'
                  }`}
                >
                  <ChevronRight size={18} color={MUTED} />
                </Pressable>
              </View>
            </View>

            {/* Note */}
            <View className="gap-2">
              <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
                {t('progress.bodyPhotos.noteOptional')}
              </Text>
              <Input
                value={note}
                onChangeText={setNote}
                placeholder={t('progress.bodyPhotos.notePlaceholder')}
                maxLength={120}
              />
            </View>

            {/* Save */}
            <Button variant="lime" disabled={!uri || saving} onPress={save} className="h-11">
              {saving ? (
                <ActivityIndicator color={LIME} />
              ) : (
                <Text className="font-bebas text-base tracking-wide">
                  {t('progress.bodyPhotos.upload')}
                </Text>
              )}
            </Button>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Comparador antes/después */}
      <Modal visible={compareOpen} animationType="slide" onRequestClose={() => setCompareOpen(false)}>
        <PhotoComparator photos={photos} onClose={() => setCompareOpen(false)} />
      </Modal>

      {/* Lightbox */}
      <Modal visible={!!lightbox} transparent animationType="fade" onRequestClose={() => setLightbox(null)}>
        <Pressable className="flex-1 bg-black/95" onPress={() => setLightbox(null)}>
          <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
            <View className="flex-row items-center justify-between px-4 py-2">
              <Text className="font-mono text-[11px] uppercase tracking-wide text-white/70">
                {lightbox ? `${catLabel(lightbox.category)} · ${lightbox.date}` : ''}
              </Text>
              <Pressable onPress={() => setLightbox(null)} hitSlop={8} className="size-9 items-center justify-center">
                <X size={24} color="white" />
              </Pressable>
            </View>
            {!!lightbox && (
              <Image
                source={{ uri: lightbox.url }}
                style={{ flex: 1, width: '100%' }}
                contentFit="contain"
                transition={150}
              />
            )}
            {!!lightbox?.note && (
              <Text className="px-5 pb-3 pt-2 text-center font-sans text-sm text-white/80">
                {lightbox.note}
              </Text>
            )}
          </SafeAreaView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}
