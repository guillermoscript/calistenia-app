/**
 * Facade de analytics — misma API op.track/identify/clear en web y mobile.
 * La implementación real (OpenPanel web o react-native) se inyecta vía initCore().
 */
import { getPlatform, type CoreAnalytics } from '../platform'

export const op: CoreAnalytics = {
  track: (name, properties) => getPlatform().analytics.track(name, properties),
  identify: (payload) => getPlatform().analytics.identify(payload),
  clear: () => getPlatform().analytics.clear(),
}
