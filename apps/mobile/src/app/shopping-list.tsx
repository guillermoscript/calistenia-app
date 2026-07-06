import { useRouter } from 'expo-router'
import { Pressable, View } from 'react-native'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react-native'
import { Text } from '@/components/ui/text'
import { useAuthUser } from '@/lib/use-auth-user'
import { ShoppingListView } from '@/components/pantry/ShoppingListView'

export default function ShoppingListScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const authUser = useAuthUser()
  const userId = authUser?.id ?? null

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-row items-center gap-2 px-2 py-1">
        <Pressable onPress={() => router.back()} hitSlop={8} className="p-2" accessibilityRole="button">
          <ArrowLeft size={20} color="hsl(0 0% 55%)" />
        </Pressable>
        <View>
          <Text className="font-mono text-[10px] uppercase tracking-[4px] text-muted-foreground">
            {t('shopping.kicker')}
          </Text>
          <Text className="font-bebas text-4xl text-foreground">{t('shopping.title')}</Text>
        </View>
      </View>
      {/* KeyboardProvider LOCAL: re-registra el callback de insets en MIUI (ver pantry.tsx) */}
      <KeyboardProvider>
        <ShoppingListView userId={userId} />
      </KeyboardProvider>
    </SafeAreaView>
  )
}
