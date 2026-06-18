import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { Image } from 'expo-image'

import { useAuth } from '@calistenia/core/hooks/useAuth'
import { pb } from '@calistenia/core/lib/pocketbase'

import { Sentry } from '@/lib/instrument'
import { haptics } from '@/lib/haptics'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Text } from '@/components/ui/text'
import { GoogleIcon } from '@/components/ui/google-icon'
import { loginWithGoogle, isAuthCancelled } from '@/lib/auth'

export default function LoginScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { signInWithEmail, signUpWithEmail, isLoading, authError } = useAuth()

  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [googleLoading, setGoogleLoading] = useState(false)

  const error = authError ?? localError

  const handleEmailSubmit = async () => {
    setLocalError(null)
    try {
      if (mode === 'login') {
        await signInWithEmail(email.trim(), password)
      } else {
        await signUpWithEmail(email.trim(), password, displayName.trim())
      }
      if (pb.authStore.isValid) {
        haptics.success()
        router.replace('/')
      }
    } catch (e) {
      haptics.error()
      Sentry.captureException(e, { tags: { flow: mode === 'login' ? 'email_login' : 'email_signup' } })
      if (!authError) setLocalError(t('common.error'))
    }
  }

  const handleGoogleLogin = async () => {
    setLocalError(null)
    setGoogleLoading(true)
    try {
      await loginWithGoogle()
      haptics.success()
      router.replace('/')
    } catch (e) {
      if (isAuthCancelled(e)) return
      haptics.error()
      Sentry.captureException(e, { tags: { flow: 'google_login' } })
      setLocalError(t('auth.googleError'))
    } finally {
      setGoogleLoading(false)
    }
  }

  const busy = isLoading || googleLoading
  const canSubmit = mode === 'login'
    ? !busy && !!email && !!password
    : !busy && !!email && !!password && !!displayName

  return (
    <SafeAreaView className="bg-background flex-1">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="flex-grow justify-center p-6"
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={FadeInDown.duration(450)}>
            <View className="mb-8 items-center gap-2">
              <Image
                source={require('../../assets/images/splash-icon.png')}
                style={{ width: 80, height: 80 }}
                contentFit="contain"
              />
              <Text className="font-bebas text-5xl leading-none tracking-[6px] text-foreground">CALISTENIA</Text>
              <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">{t('auth.tagline')}</Text>
            </View>

            <Card>
              <CardHeader>
                <CardTitle>
                  {mode === 'login' ? t('auth.login') : t('auth.createAccount')}
                </CardTitle>
              </CardHeader>
              <CardContent className="gap-4">
                {mode === 'signup' && (
                  <View className="gap-1.5">
                    <Label nativeID="displayName">{t('auth.name')}</Label>
                    <Input
                      aria-labelledby="displayName"
                      autoCapitalize="words"
                      autoComplete="name"
                      value={displayName}
                      onChangeText={setDisplayName}
                    />
                  </View>
                )}

                <View className="gap-1.5">
                  <Label nativeID="email">{t('auth.email')}</Label>
                  <Input
                    aria-labelledby="email"
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    value={email}
                    onChangeText={setEmail}
                  />
                </View>

                <View className="gap-1.5">
                  <Label nativeID="password">{t('auth.password')}</Label>
                  <Input
                    aria-labelledby="password"
                    secureTextEntry
                    autoComplete={mode === 'signup' ? 'new-password' : 'password'}
                    value={password}
                    onChangeText={setPassword}
                    onSubmitEditing={handleEmailSubmit}
                  />
                </View>

                {error ? <Text className="text-destructive text-sm">{error}</Text> : null}

                <Button className="bg-lime active:bg-lime/90" onPress={handleEmailSubmit} disabled={!canSubmit}>
                  <Text className="font-sans-bold text-sm tracking-wide text-lime-foreground">
                    {busy
                      ? t('auth.connecting')
                      : mode === 'login'
                        ? t('auth.login')
                        : t('auth.createAccount')}
                  </Text>
                </Button>

                <View className="flex-row items-center gap-3">
                  <View className="bg-border h-px flex-1" />
                  <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">{t('common.or')}</Text>
                  <View className="bg-border h-px flex-1" />
                </View>

                <Pressable
                  onPress={handleGoogleLogin}
                  disabled={busy}
                  className="w-full rounded-full border border-zinc-200 bg-white py-3 px-6 active:opacity-80 disabled:opacity-50"
                >
                  <View className="flex-row items-center justify-center gap-3">
                    <GoogleIcon size={20} />
                    <Text className="text-sm text-zinc-900">{t('auth.continueWithGoogle')}</Text>
                  </View>
                </Pressable>

                {/* Mode toggle */}
                <View className="flex-row justify-center gap-1">
                  <Text className="text-muted-foreground text-xs">
                    {mode === 'login' ? t('auth.noAccount') : t('auth.hasAccount')}
                  </Text>
                  <Text
                    className="text-lime text-xs"
                    onPress={() => {
                      setLocalError(null)
                      setMode(mode === 'login' ? 'signup' : 'login')
                    }}
                  >
                    {mode === 'login' ? t('auth.register') : t('auth.loginLink')}
                  </Text>
                </View>
              </CardContent>
            </Card>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
