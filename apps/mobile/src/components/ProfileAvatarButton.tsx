/**
 * Avatar de la cabecera de cada pestaña: la única entrada a Perfil y ajustes
 * desde que Perfil dejó de ser pestaña (#859, épica #852).
 *
 * Foto del usuario si la tiene; si no, su inicial. Lee del authStore, que es
 * lo que refresca `useAvatarUpload` al cambiar la foto.
 */
import { Pressable } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { haptics } from '@/lib/haptics'
import { useAuthUser } from '@/lib/use-auth-user'
import { withCacheToken } from '@/lib/avatar'
import { getUserAvatarUrl } from '@calistenia/core/lib/pocketbase'

const FILL = { width: '100%', height: '100%' } as const

export function ProfileAvatarButton() {
  const { t } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()

  // Mismo tamaño que el de Perfil: PB solo sirve miniaturas declaradas (si
  // no, manda el original), y así las dos comparten caché.
  const avatarUrl = user ? withCacheToken(getUserAvatarUrl(user, '200x200'), user.updated as string) : null
  const name = (user?.display_name as string) || (user?.name as string) || (user?.email as string) || '?'
  const initial = name.trim().charAt(0).toUpperCase()

  return (
    <Pressable
      onPress={() => {
        haptics.selection()
        router.push('/profile')
      }}
      className="size-10 items-center justify-center overflow-hidden rounded-full border border-border bg-muted active:opacity-70"
      accessibilityRole="button"
      accessibilityLabel={t('nav.profile')}
    >
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={FILL} contentFit="cover" cachePolicy="memory-disk" />
      ) : (
        <Text className="font-sans-medium text-base text-foreground">{initial}</Text>
      )}
    </Pressable>
  )
}
