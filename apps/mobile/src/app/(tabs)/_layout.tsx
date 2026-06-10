import { View } from 'react-native'
import { Redirect, Tabs } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Home, ClipboardList, Library, History, User } from 'lucide-react-native'
import { useColorScheme } from 'nativewind'
import { pb } from '@calistenia/core/lib/pocketbase'
import { NAV_THEME } from '@/lib/theme'
import ActiveCardioBar from '@/components/cardio/ActiveCardioBar'

export default function TabsLayout() {
  const { t } = useTranslation()
  const { colorScheme } = useColorScheme()
  const theme = NAV_THEME[colorScheme === 'dark' ? 'dark' : 'light']

  if (!pb.authStore.isValid) return <Redirect href="/login" />

  return (
    <View className="flex-1">
    <Tabs
      screenOptions={{
        headerShown: false,
        // Acento lime para el tab activo, como el indicador del sidebar web
        tabBarActiveTintColor: colorScheme === 'dark' ? 'hsl(74 90% 57%)' : 'hsl(74 90% 38%)',
        tabBarInactiveTintColor: colorScheme === 'dark' ? 'hsl(0 0% 45%)' : 'hsl(0 0% 55%)',
        tabBarStyle: {
          backgroundColor: theme.colors.card,
          borderTopColor: theme.colors.border,
        },
        tabBarLabelStyle: { fontSize: 9, fontFamily: 'JetBrainsMono_400Regular', letterSpacing: 0.5, textTransform: 'uppercase' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('nav.home'),
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="programs"
        options={{
          title: t('nav.programs'),
          tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: t('nav.exercises'),
          tabBarIcon: ({ color, size }) => <Library color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: t('nav.progress'),
          tabBarIcon: ({ color, size }) => <History color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('nav.profile'),
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tabs>
    {/* Sesión de cardio en curso: barra flotante para volver a /cardio */}
    <ActiveCardioBar />
    </View>
  )
}
