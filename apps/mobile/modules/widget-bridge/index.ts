// Vía 'expo' (re-export): expo-modules-core es dep transitiva y pnpm estricto no la expone
import { requireNativeModule } from 'expo'

interface WidgetBridgeModule {
  setSnapshot(json: string): void
  startActivity(workoutTitle: string, stateJson: string): boolean
  updateActivity(stateJson: string): void
  endActivity(): void
}

/** null fuera de iOS nativo (Expo Go viejo, web, android). */
export function getWidgetBridge(): WidgetBridgeModule | null {
  try {
    return requireNativeModule<WidgetBridgeModule>('WidgetBridge')
  } catch {
    return null
  }
}
