/**
 * Pestaña Comunidad (#860, épica #852): lo social del móvil en un solo sitio.
 *
 * Antes estaba repartido entre el inicio (reto destacado, programa de la
 * comunidad, actividad), el menú ☰ y pantallas sueltas. Aquí va con cuatro
 * secciones: Actividad · Retos · Batallas · Ranking. Cada sección es su propio
 * scroller; la cabecera y las pestañas internas se quedan fijas.
 *
 * Las rutas de siempre (`/challenges`, `/leaderboard`, `/battle-history`,
 * `/battle/[id]`, `/races-discover`, `/referrals`…) siguen existiendo y pintan
 * los mismos componentes: a ellas llegan los push, las invitaciones y los App
 * Links.
 *
 * `?section=challenges|battles|ranking` abre directamente esa sección.
 */
import { useEffect, useState } from 'react'
import { View, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { UserPlus } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Kicker } from '@/components/ui/kicker'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { ProfileAvatarButton } from '@/components/ProfileAvatarButton'
import CommunityActivity from '@/components/community/CommunityActivity'
import ChallengesList from '@/components/community/ChallengesList'
import CommunityBattles from '@/components/community/CommunityBattles'
import LeaderboardList from '@/components/community/LeaderboardList'

type Section = 'activity' | 'challenges' | 'battles' | 'ranking'

const SECTIONS: { id: Section; labelKey: string }[] = [
  { id: 'activity', labelKey: 'nav.activity' },
  { id: 'challenges', labelKey: 'nav.challenges' },
  { id: 'battles', labelKey: 'nav.battles' },
  { id: 'ranking', labelKey: 'nav.leaderboard' },
]

function isSection(value: unknown): value is Section {
  return SECTIONS.some(s => s.id === value)
}

export default function CommunityScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useLocalSearchParams<{ section?: string }>()
  const [section, setSection] = useState<Section>(isSection(params.section) ? params.section : 'activity')

  // La pestaña no se desmonta al salir: un segundo `?section=` tiene que
  // cambiar la sección aunque el estado inicial ya se hubiera fijado.
  useEffect(() => {
    if (isSection(params.section)) setSection(params.section)
  }, [params.section])

  const select = (next: Section) => {
    if (next === section) return
    haptics.selection()
    setSection(next)
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="gap-3.5 px-4 pb-4 pt-2">
        <View className="flex-row items-end justify-between gap-3">
          <View className="flex-1 gap-0.5">
            <Kicker>{t('community.kicker')}</Kicker>
            <Text className="font-bebas text-4xl leading-none text-foreground">{t('nav.community')}</Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <Pressable
              onPress={() => router.push('/friends')}
              className="size-10 items-center justify-center rounded-full border border-border active:bg-muted/40"
              accessibilityRole="button"
              accessibilityLabel={t('dashboard.findFriends')}
            >
              <UserPlus size={18} color="hsl(0 0% 55%)" />
            </Pressable>
            <ProfileAvatarButton />
          </View>
        </View>

        <View
          className="flex-row rounded-[10px] border border-border p-[3px]"
          accessibilityRole="tablist"
          accessibilityLabel={t('community.sectionsLabel')}
        >
          {SECTIONS.map(s => {
            const active = s.id === section
            return (
              <Pressable
                key={s.id}
                onPress={() => select(s.id)}
                className={cn('h-11 flex-1 items-center justify-center rounded-[7px]', active && 'bg-muted')}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text
                  className={cn(
                    'font-mono text-[10px] uppercase tracking-[1px]',
                    active ? 'text-foreground' : 'text-muted-foreground',
                  )}
                  numberOfLines={1}
                >
                  {t(s.labelKey)}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      <View className="flex-1">
        {section === 'activity' ? (
          <CommunityActivity onSeeRanking={() => select('ranking')} />
        ) : section === 'challenges' ? (
          <ChallengesList />
        ) : section === 'battles' ? (
          <CommunityBattles />
        ) : (
          <LeaderboardList />
        )}
      </View>
    </SafeAreaView>
  )
}
