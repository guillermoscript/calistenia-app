/**
 * Flecha de volver para las pantallas de pila que antes eran pestaña
 * (Programas, Ejercicios, Calendario, Perfil — #859).
 *
 * Si no hay a dónde volver (se entró por un push o un enlace profundo con la
 * app cerrada), va al inicio en vez de no hacer nada: ninguna pantalla puede
 * dejar al usuario sin salida.
 */
import { Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ChevronLeft } from 'lucide-react-native'

import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'

export function BackButton({ className }: { className?: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  return (
    <Pressable
      onPress={() => {
        haptics.selection()
        if (router.canGoBack()) router.back()
        else router.replace('/(tabs)')
      }}
      hitSlop={8}
      className={cn('-ml-2 size-11 items-center justify-center rounded-lg active:opacity-60', className)}
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
    >
      <ChevronLeft size={24} color="hsl(0 0% 55%)" />
    </Pressable>
  )
}
