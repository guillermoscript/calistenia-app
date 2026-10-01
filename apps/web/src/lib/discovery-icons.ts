import { Bot, Ellipsis, GitBranch, Search, Share2, Store, UserPlus, type LucideIcon } from 'lucide-react'
import type { DiscoverySourceId } from '@calistenia/core/lib/discovery-source'

/** Icono de cada fuente de «¿cómo conociste la app?»: se reconoce de un vistazo. */
export const DISCOVERY_SOURCE_ICONS: Record<DiscoverySourceId, LucideIcon> = {
  app_store: Store,
  search: Search,
  ai_chat: Bot,
  social: Share2,
  friend: UserPlus,
  github: GitBranch,
  other: Ellipsis,
}
