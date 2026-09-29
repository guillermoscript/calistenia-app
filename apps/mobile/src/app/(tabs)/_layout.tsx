import { View, Easing } from 'react-native'
import { Redirect, Tabs } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Home, Dumbbell, Apple, BarChart3, Users } from 'lucide-react-native'
import { useColorScheme } from 'nativewind'
import { isOnboardingDone } from '@calistenia/core/lib/onboarding-state'
import { useAuthUser } from '@/lib/use-auth-user'
import { NAV_THEME } from '@/lib/theme'
import ActiveCardioBar from '@/components/cardio/ActiveCardioBar'
import ActiveSessionBar from '@/components/ActiveSessionBar'
import ActiveBattleBar from '@/components/ActiveBattleBar'
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
        // 5 pestañas (#859): 10 px como mínimo y poco espaciado, para que
        // «COMUNIDAD» y «NUTRICIÓN» (9 letras mono ≈ 60 dp) quepan enteras a 360 dp
        // (72 dp por pestaña). Sin escalado de fuente: con la letra del sistema
        // grande se cortarían; el icono sigue identificando cada pestaña.
        tabBarLabelStyle: { fontSize: 10, fontFamily: 'JetBrainsMono_400Regular', letterSpacing: 0.5, textTransform: 'uppercase' },
        tabBarAllowFontScaling: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('nav.today'),
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="train"
        options={{
          title: t('nav.workout'),
          tabBarIcon: ({ color, size }) => <Dumbbell color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{
          title: t('nav.nutrition'),
          tabBarIcon: ({ color, size }) => <Apple color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: t('nav.progress'),
          tabBarIcon: ({ color, size }) => <BarChart3 color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: t('nav.community'),
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
    </Tabs>
    {/* Sesión de cardio en curso: barra flotante para volver a /cardio */}
    <ActiveCardioBar />
    {/* Sesión de fuerza en curso: barra flotante para volver a /session */}
    <ActiveSessionBar />
    {/* Batalla en curso: barra flotante para volver a /battle/[id] */}
    <ActiveBattleBar />
    </View>
  )
}
