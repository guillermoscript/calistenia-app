/**
 * Fila de navegación del perfil: icono en círculo, título, descripción opcional
 * y chevron. Estaba copiada nueve veces en `app/(tabs)/profile.tsx` (#478).
 *
 * `description` es opcional a propósito: la fila de usuarios bloqueados no tiene
 * subtítulo hoy, y ponérselo sería un cambio de comportamiento.
 *
 * Los colores van literales, no vía el `lime` calculado por tema de la pantalla,
 * porque así estaban en las nueve copias — este componente no cambia nada visual.
 */
import { View, Pressable } from 'react-native'
import { ChevronRight, type LucideIcon } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Card, CardContent } from '@/components/ui/card'

interface ProfileLinkRowProps {
  icon: LucideIcon
  title: string
  description?: string
  onPress: () => void
}

export function ProfileLinkRow({ icon: Icon, title, description, onPress }: ProfileLinkRowProps) {
  return (
    <Pressable onPress={onPress}>
      <Card>
        <CardContent className="flex-row items-center gap-3 py-4">
          <View className="size-10 items-center justify-center rounded-full bg-lime/10">
            <Icon size={18} color="hsl(74 90% 57%)" />
          </View>
          {/* flex-1 + el texto dentro: sin esto el título largo empujaría al
              chevron fuera de pantalla (flexShrink es 0 por defecto en RN). */}
          <View className="flex-1">
            <Text className="font-sans-medium text-foreground">{title}</Text>
            {description ? (
              <Text className="mt-0.5 font-mono text-[10px] tracking-wide text-muted-foreground">
                {description}
              </Text>
            ) : null}
          </View>
          <ChevronRight size={18} color="hsl(0 0% 45%)" />
        </CardContent>
      </Card>
    </Pressable>
  )
}
