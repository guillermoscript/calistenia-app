/**
 * Comparador antes/después (native) — port del PhotoComparator de web.
 * Slider arrastrable que revela la foto "antes" sobre la "después" (mismo
 * tamaño, el wrapper recorta por ancho animado en el hilo de UI vía reanimated).
 * Se monta dentro de un Modal full-screen desde progress-photos.tsx.
 */
import { useMemo, useState } from 'react'
import { View, Pressable, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Image } from 'expo-image'
import { X, MoveHorizontal } from 'lucide-react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated'

import { Text } from '@/components/ui/text'
import { Chip } from '@/components/ui/chip'
import { haptics } from '@/lib/haptics'
import ProgressShareButton from '@/components/progress/ProgressShareButton'
import type { BodyPhoto } from '@calistenia/core/hooks/useBodyPhotos'

const CATEGORY_KEY: Record<string, string> = {
  all: 'progress.bodyPhotos.all',
  front: 'progress.bodyPhotos.front',
  side: 'progress.bodyPhotos.side',
  back: 'progress.bodyPhotos.back',
}

interface Props {
  photos: BodyPhoto[]
  onClose: () => void
}

export default function PhotoComparator({ photos, onClose }: Props) {
  const { t } = useTranslation()
  const MUTED = 'rgba(255,255,255,0.55)'
  const { width } = useWindowDimensions()

  // Filtros disponibles: "Todas" + cada categoría presente. Comparar NO exige
  // ≥2 por categoría — con "Todas" puedes elegir 2 fotos cualesquiera (p.ej.
  // una frontal y una de perfil de distintas fechas).
  const catOptions = useMemo(() => {
    const present = new Set<string>()
    for (const p of photos) if (p.category) present.add(p.category)
    return ['all', ...[...present]]
  }, [photos])

  const [category, setCategory] = useState('all')

  const filtered = useMemo(() => {
    const list = category === 'all' ? photos : photos.filter((p) => p.category === category)
    return [...list].sort((a, b) => a.date.localeCompare(b.date))
  }, [photos, category])

  const [leftIdx, setLeftIdx] = useState(0)
  const [rightIdx, setRightIdx] = useState(() => Math.max(0, filtered.length - 1))

  // Geometría del comparador: ancho de pantalla menos padding px-4 (16*2).
  const W = width - 32
  const H = Math.min((W * 4) / 3, 520)
  const x = useSharedValue(W / 2)

  const pan = Gesture.Pan()
    .onBegin((e) => {
      'worklet'
      x.value = e.x < 0 ? 0 : e.x > W ? W : e.x
    })
    .onUpdate((e) => {
      'worklet'
      x.value = e.x < 0 ? 0 : e.x > W ? W : e.x
    })

  const clipStyle = useAnimatedStyle(() => ({ width: x.value }))
  const lineStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }))

  const selectCategory = (c: string) => {
    haptics.selection()
    const f = (c === 'all' ? photos : photos.filter((p) => p.category === c)).sort((a, b) =>
      a.date.localeCompare(b.date),
    )
    setCategory(c)
    setLeftIdx(0)
    setRightIdx(Math.max(0, f.length - 1))
  }

  const left = filtered[Math.min(leftIdx, filtered.length - 1)]
  const right = filtered[Math.min(rightIdx, filtered.length - 1)]
  const canCompare = filtered.length >= 2 && !!left && !!right

  return (
    // GestureHandlerRootView propio: el Modal es otra ventana nativa en Android,
    // fuera del root del _layout → sin esto el Pan del slider no recibe eventos.
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 py-2">
        <View>
          <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
            {t('progress.bodyPhotos.title')}
          </Text>
          <Text className="font-bebas text-3xl text-foreground">
            {t('progress.bodyPhotos.compare')}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          {canCompare && left && right && <ProgressShareButton before={left} after={right} />}
          <Pressable onPress={onClose} hitSlop={8} className="size-9 items-center justify-center">
            <X size={24} color={MUTED} />
          </Pressable>
        </View>
      </View>

      {/* Filtro por categoría ("Todas" + categorías presentes) */}
      {catOptions.length > 1 && (
        <View className="flex-row gap-2 px-4 pb-3">
          {catOptions.map((c) => (
            <Chip
              key={c}
              label={t(CATEGORY_KEY[c] || c)}
              active={category === c}
              onPress={() => selectCategory(c)}
            />
          ))}
        </View>
      )}

      {canCompare ? (
        <View className="px-4">
          {/* Slider comparator */}
          <GestureDetector gesture={pan}>
            <View
              style={{ width: W, height: H }}
              className="overflow-hidden rounded-xl border border-border"
            >
              {/* "Después" (foto completa de fondo) */}
              <Image
                source={{ uri: right.url }}
                style={{ position: 'absolute', width: W, height: H }}
                contentFit="cover"
                transition={100}
              />
              {/* "Antes" (recortada por ancho animado; la imagen interior mantiene
                  el ancho completo del contenedor para no deformarse) */}
              <Animated.View
                style={[{ position: 'absolute', left: 0, top: 0, height: H, overflow: 'hidden' }, clipStyle]}
              >
                <Image
                  source={{ uri: left.url }}
                  style={{ width: W, height: H }}
                  contentFit="cover"
                  transition={100}
                />
              </Animated.View>
              {/* Línea + handle */}
              <Animated.View
                style={[{ position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1 }, lineStyle]}
                pointerEvents="none"
              >
                <View className="h-full w-0.5 bg-white/80" />
                <View
                  className="absolute size-9 items-center justify-center rounded-full border-2 border-lime bg-white/90"
                  style={{ top: H / 2 - 18, left: -17 }}
                >
                  <MoveHorizontal size={16} color="#1a2000" />
                </View>
              </Animated.View>
              {/* Fechas */}
              <View className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1">
                <Text className="font-mono text-[10px] text-white">{left.date}</Text>
              </View>
              <View className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1">
                <Text className="font-mono text-[10px] text-white">{right.date}</Text>
              </View>
            </View>
          </GestureDetector>

          {/* Selectores antes / después */}
          <View className="mt-4 flex-row gap-4">
            <View className="flex-1 gap-2">
              <Text className="font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">
                {t('progress.bodyPhotos.before')}
              </Text>
              <View className="flex-row flex-wrap gap-1.5">
                {filtered.map((p, i) => (
                  <DateChip key={p.id} uri={p.url} label={p.date.slice(5)} active={leftIdx === i} onPress={() => { haptics.selection(); setLeftIdx(i) }} />
                ))}
              </View>
            </View>
            <View className="flex-1 gap-2">
              <Text className="font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">
                {t('progress.bodyPhotos.after')}
              </Text>
              <View className="flex-row flex-wrap gap-1.5">
                {filtered.map((p, i) => (
                  <DateChip key={p.id} uri={p.url} label={p.date.slice(5)} active={rightIdx === i} onPress={() => { haptics.selection(); setRightIdx(i) }} />
                ))}
              </View>
            </View>
          </View>
        </View>
      ) : (
        <View className="flex-1 items-center justify-center px-8">
          <MoveHorizontal size={30} color={MUTED} />
          <Text className="mt-4 text-center font-sans text-sm text-muted-foreground">
            {t('progress.bodyPhotos.selectTwo')}
          </Text>
        </View>
      )}
    </SafeAreaView>
    </GestureHandlerRootView>
  )
}

/** Miniatura + fecha para elegir la foto antes/después. */
function DateChip({
  uri,
  label,
  active,
  onPress,
}: {
  uri: string
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`items-center gap-1 rounded-lg border p-1 ${active ? 'border-lime/60 bg-lime/10' : 'border-border'}`}
    >
      <Image
        source={{ uri }}
        style={{ width: 40, height: 52, borderRadius: 4 }}
        contentFit="cover"
        transition={100}
      />
      <Text className={`font-mono text-[10px] ${active ? 'text-lime' : 'text-muted-foreground'}`}>{label}</Text>
    </Pressable>
  )
}
