import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Redirect, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { getCurrentUser, logout, pb } from '@calistenia/core/lib/pocketbase'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Text } from '@/components/ui/text'

/** Placeholder fase 1 — el dashboard real (workout del día) llega en fase 2. */
export default function HomeScreen() {
  const { t } = useTranslation()
  const router = useRouter()

  if (!pb.authStore.isValid) {
    return <Redirect href="/login" />
  }

  const user = getCurrentUser()
  const name = user?.display_name || user?.name || user?.email || ''

  const handleLogout = () => {
    logout()
    router.replace('/login')
  }

  return (
    <SafeAreaView className="bg-background flex-1">
      <View className="flex-1 justify-center gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('nav.home')}</CardTitle>
          </CardHeader>
          <CardContent className="gap-4">
            <Text>{name}</Text>
            <Text variant="muted">{user?.email}</Text>
            <View className="bg-lime self-start rounded-md px-3 py-1">
              <Text className="text-lime-foreground text-sm font-semibold">
                @calistenia/core ✓
              </Text>
            </View>
            <Button variant="outline" onPress={handleLogout}>
              <Text>{t('nav.signOut')}</Text>
            </Button>
          </CardContent>
        </Card>
      </View>
    </SafeAreaView>
  )
}
