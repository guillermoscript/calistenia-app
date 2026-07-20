import { View, Easing } from 'react-native'
import { Redirect, Tabs } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Home, ClipboardList, Library, History, User, Utensils, CalendarDays } from 'lucide-react-native'
import { useColorScheme } from 'nativewind'
import { isOnboardingDone } from '@calistenia/core/lib/onboarding-state'
import { useAuthUser } from '@/lib/use-auth-user'
import { NAV_THEME } from '@/lib/theme'
import ActiveCardioBar from '@/components/cardio/ActiveCardioBar'
import ActiveSessionBar from '@/components/ActiveSessionBar'
import { QuickMenuProvider } from '@/components/QuickMenu'
import { haptics } from '@/lib/haptics'

export default function TabsLayout() {
  const { t } = useTranslation()
  const { colorScheme } = useColorScheme()
  // Reactivo (pb.authStore.onChange): si el token se limpia con la app abierta
  // (sesión fantasma #254, logout), el guard re-evalúa y redirige a login.
  const user = useAuthUser()
  const theme = NAV_THEME[colorScheme === 'dark' ? 'dark' : 'light']

  if (!user) return <Redirect href="/login" />
  if (!isOnboardingDone(user.id)) return <Redirect href="/onboarding" />

  return (
    <QuickMenuProvider>
    <View className="flex-1">
    <Tabs
      screenListeners={{ tabPress: () => haptics.selection() }}
      screenOptions={{
        headerShown: false,
        // Shift slides content in the direction of the tapped tab — native iOS feel
        animation: 'shift',
        transitionSpec: {
          animation: 'timing',
          config: { duration: 200, easing: Easing.inOut(Easing.ease) },
        },
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
        name="calendar"
        options={{
          title: t('nav.calendar'),
          tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{
          title: t('nav.nutrition'),
          tabBarIcon: ({ color, size }) => <Utensils color={color} size={size} />,
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
    {/* Sesión de fuerza en curso: barra flotante para volver a /session */}
    <ActiveSessionBar />
    </View>
    </QuickMenuProvider>
  )
}
