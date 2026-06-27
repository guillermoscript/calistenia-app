/**
 * Preferencia de tema del usuario (claro/oscuro/sistema), persistida en la caché
 * síncrona de storage. NativeWind aplica la clase `.dark` según `colorScheme.set()`;
 * aquí guardamos el *modo elegido* (incluido 'system') aparte del esquema resuelto
 * que devuelve `useColorScheme()`.
 *
 * Boot: `_layout.tsx` llama `applyThemeMode(getThemeMode())` tras hidratar storage.
 */
import { colorScheme as nwColorScheme } from 'nativewind'
import { syncStorage } from '@/lib/storage'

export type ThemeMode = 'system' | 'light' | 'dark'

const KEY = 'calistenia_theme_mode'

export function getThemeMode(): ThemeMode {
  const v = syncStorage.getItem(KEY)
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
}

/** Aplica el modo a NativeWind sin persistir (uso en boot). */
export function applyThemeMode(mode: ThemeMode): void {
  nwColorScheme.set(mode)
}

/** Persiste el modo elegido y lo aplica de inmediato. */
export function setThemeMode(mode: ThemeMode): void {
  syncStorage.setItem(KEY, mode)
  applyThemeMode(mode)
}
