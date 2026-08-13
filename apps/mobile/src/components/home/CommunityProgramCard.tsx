/**
 * Entrada de descubrimiento a los programas de comunidad (#353) en Home.
 *
 * Muestra el programa en el que ya está el usuario y, si no está en ninguno, el
 * primero publicado. A propósito NO calcula el progreso: eso exigiría consultar
 * las sesiones de toda la ventana del programa y Home ya lanza bastantes
 * consultas. El detalle está a un toque y ahí sí se calcula.
 */
import { View, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { useCommunityPrograms } from '@calistenia/core/hooks/useCommunityPrograms'

interface CommunityProgramCardProps {
  userId: string | null
}

export default function CommunityProgramCard({ userId }: CommunityProgramCardProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const { programs, loading } = useCommunityPrograms(userId)

  if (loading || programs.length === 0) return null

  const joined = programs.find(p => p.membership?.status === 'active')
  const program = joined ?? programs[0]

  return (
    <Pressable
      onPress={() => router.push(`/community-programs/${program.id}`)}
      className="rounded-xl border border-border bg-card p-4 active:opacity-70"
    >
      <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
        {t('communityProgram.kicker')}
      </Text>
      <Text className="mt-1 text-sm font-sans-medium text-foreground">{t(program.title_key)}</Text>
      <Text numberOfLines={2} className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {t(program.description_key)}
      </Text>
      <View className="mt-3">
        <Text className="font-mono text-[10px] uppercase tracking-[2px] text-lime">
          {joined ? t('challenge.preset.open') : t('communityProgram.discoverCta')}
        </Text>
      </View>
    </Pressable>
  )
}
