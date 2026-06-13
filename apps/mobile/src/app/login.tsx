import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { pb } from '@calistenia/core/lib/pocketbase'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Text } from '@/components/ui/text'
import { loginWithGoogle } from '@/lib/auth'

export default function LoginScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleEmailLogin = async () => {
    setError(null)
    setLoading(true)
    try {
      await pb.collection('users').authWithPassword(email.trim(), password)
      router.replace('/(tabs)')
    } catch {
      setError(t('auth.loginError'))
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setError(null)
    setLoading(true)
    try {
      await loginWithGoogle()
      router.replace('/(tabs)')
    } catch {
      setError(t('auth.googleError'))
    } finally {
      setLoading(false)
    }
  }

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
          <View className="mb-8 items-center gap-2">
            <Text className="font-bebas text-5xl leading-none tracking-[6px] text-foreground">CALISTENIA</Text>
            <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">{t('auth.tagline')}</Text>
          </View>

          <Card>
            <CardHeader>
              <CardTitle>{t('auth.login')}</CardTitle>
            </CardHeader>
            <CardContent className="gap-4">
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
                  autoComplete="password"
                  value={password}
                  onChangeText={setPassword}
                  onSubmitEditing={handleEmailLogin}
                />
              </View>

              {error ? <Text className="text-destructive text-sm">{error}</Text> : null}

              <Button className="bg-lime active:bg-lime/90" onPress={handleEmailLogin} disabled={loading || !email || !password}>
                <Text className="font-sans-bold text-sm tracking-wide text-lime-foreground">
                  {loading ? t('auth.connecting') : t('auth.login')}
                </Text>
              </Button>

              <View className="flex-row items-center gap-3">
                <View className="bg-border h-px flex-1" />
                <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">{t('common.or')}</Text>
                <View className="bg-border h-px flex-1" />
              </View>

              <Button variant="outline" onPress={handleGoogleLogin} disabled={loading}>
                <Text>{t('auth.continueWithGoogle')}</Text>
              </Button>
            </CardContent>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
