import { ActivityIndicator, Linking, Pressable, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Activity, ChevronLeft, RefreshCw, ShieldCheck, Watch } from 'lucide-react-native'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { haptics } from '@/lib/haptics'
import { useHealthSync } from '@/lib/health/useHealthSync'

const LIME = 'hsl(74 90% 57%)'
const MUTED = 'rgba(255,255,255,0.45)'
const HC_PACKAGE = 'com.google.android.apps.healthdata'
const HC_PLAY_URL = `https://play.google.com/store/apps/details?id=${HC_PACKAGE}`

function fmtSleep(min?: number): string | null {
  if (!min) return null
  return `${Math.floor(min / 60)}h ${min % 60}m`
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between border-b border-border/40 py-3">
      <Text className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{label}</Text>
      <Text className="font-bebas text-2xl text-foreground">{value}</Text>
    </View>
  )
}

export default function HealthScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const h = useHealthSync()

  const s = h.summary
  const metrics: { label: string; value: string }[] = []
  if (s) {
    if (s.steps) metrics.push({ label: 'Pasos', value: s.steps.toLocaleString() })
    if (s.active_calories) metrics.push({ label: 'Calorías activas', value: `${Math.round(s.active_calories)} kcal` })
    if (s.resting_hr) metrics.push({ label: 'FC en reposo', value: `${s.resting_hr} bpm` })
    if (s.hrv_ms) metrics.push({ label: 'VFC (HRV)', value: `${Math.round(s.hrv_ms)} ms` })
    const sleep = fmtSleep(s.sleep_minutes)
    if (sleep) metrics.push({ label: 'Sueño', value: sleep })
    if (s.weight_kg) metrics.push({ label: 'Peso', value: `${s.weight_kg} kg` })
    if (s.body_fat_pct) metrics.push({ label: 'Grasa corporal', value: `${s.body_fat_pct}%` })
    if (s.vo2max) metrics.push({ label: 'VO₂ máx', value: `${Math.round(s.vo2max)}` })
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView contentContainerClassName="px-4 pb-32" showsVerticalScrollIndicator={false}>
        <View className="mb-6 pb-2 pt-2">
          <Pressable
            onPress={() => {
              haptics.selection()
              router.back()
            }}
            className="-ml-2 mb-1 size-9 flex-row items-center justify-center self-start rounded-lg"
          >
            <ChevronLeft size={24} color={MUTED} />
          </Pressable>
          <View className="flex-row items-center gap-2">
            <Watch size={26} color={LIME} />
            <Text className="font-bebas text-4xl text-foreground">Reloj y salud</Text>
          </View>
          <Text className="mt-1 font-sans text-sm text-muted-foreground">
            Conecta tu reloj a través de Health Connect para traer sueño, frecuencia cardíaca, pasos, calorías y peso.
          </Text>
        </View>

        {h.isLoadingStatus && (
          <View className="items-center py-12">
            <ActivityIndicator color={LIME} />
          </View>
        )}

        {/* iOS / web — Phase 2 */}
        {!h.isLoadingStatus && h.status === 'unsupported' && (
          <Card>
            <CardContent className="gap-2 py-6">
              <Text className="font-sans-medium text-foreground">Disponible en Android</Text>
              <Text className="font-sans text-sm text-muted-foreground">
                La integración con Apple Salud (iPhone) llegará pronto.
              </Text>
            </CardContent>
          </Card>
        )}

        {/* Health Connect not installed */}
        {!h.isLoadingStatus && h.status === 'unavailable' && (
          <Card>
            <CardContent className="gap-3 py-6">
              <Text className="font-sans-medium text-foreground">Instala Health Connect</Text>
              <Text className="font-sans text-sm text-muted-foreground">
                Health Connect es la app de Google donde tu reloj guarda los datos de salud. Instálala para continuar.
              </Text>
              <Button onPress={() => Linking.openURL(HC_PLAY_URL)} className="mt-1">
                <Text>Abrir Google Play</Text>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Provider needs update */}
        {!h.isLoadingStatus && h.status === 'update_required' && (
          <Card>
            <CardContent className="gap-3 py-6">
              <Text className="font-sans-medium text-foreground">Actualiza Health Connect</Text>
              <Button onPress={() => Linking.openURL(HC_PLAY_URL)} className="mt-1">
                <Text>Abrir Google Play</Text>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Available, not yet connected */}
        {!h.isLoadingStatus && h.status === 'available' && !h.isConnected && (
          <View className="gap-4">
            <Card>
              <CardContent className="gap-2 py-6">
                <View className="flex-row items-center gap-2">
                  <Activity size={18} color={LIME} />
                  <Text className="font-sans-medium text-foreground">Qué leeremos</Text>
                </View>
                <Text className="font-sans text-sm text-muted-foreground">
                  Sueño · Frecuencia cardíaca y FC en reposo · VFC · Pasos · Calorías · Peso y grasa corporal · VO₂ máx.
                  Solo lectura: la app nunca modifica tus datos del reloj.
                </Text>
              </CardContent>
            </Card>
            <Button onPress={() => h.connect()} disabled={h.isConnecting} size="lg">
              <Text>{h.isConnecting ? 'Conectando…' : 'Conectar con Health Connect'}</Text>
            </Button>
            <View className="flex-row items-center gap-2 px-1">
              <ShieldCheck size={14} color={MUTED} />
              <Text className="flex-1 font-mono text-[10px] leading-4 tracking-wide text-muted-foreground">
                Tus datos de salud nunca se envían a analítica ni publicidad.
              </Text>
            </View>
          </View>
        )}

        {/* Connected */}
        {!h.isLoadingStatus && h.status === 'available' && h.isConnected && (
          <View className="gap-4">
            <Card>
              <CardContent className="py-2">
                {metrics.length === 0 ? (
                  <Text className="py-4 font-sans text-sm text-muted-foreground">
                    {t('health.emptyToday')}
                  </Text>
                ) : (
                  metrics.map((m) => <Metric key={m.label} label={m.label} value={m.value} />)
                )}
              </CardContent>
            </Card>

            <Button onPress={() => h.sync()} disabled={h.isSyncing} variant="outline">
              <RefreshCw size={16} color={LIME} />
              <Text>{h.isSyncing ? 'Sincronizando…' : 'Sincronizar ahora'}</Text>
            </Button>

            {h.syncError && (
              <Text className="px-1 font-mono text-[10px] text-destructive">{h.syncError.message}</Text>
            )}

            {h.lastSyncedAt && (
              <Text className="px-1 font-mono text-[10px] tracking-wide text-muted-foreground">
                Última sync: {new Date(h.lastSyncedAt).toLocaleString()}
              </Text>
            )}

            <Pressable onPress={() => h.openSettings()} className="px-1 py-2">
              <Text className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground underline">
                Gestionar permisos en Health Connect
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
