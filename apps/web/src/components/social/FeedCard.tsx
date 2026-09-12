/**
 * Tarjeta del muro (web).
 *
 * Vivía dentro de `ActivityFeedPage`, con el texto de cada tipo de actividad
 * incrustado en el JSX (`'Hizo cardio'` a pelo, sin traducir). Al pasar de dos
 * tipos a seis eso dejó de escalar: ahora el QUÉ dice cada tarjeta lo decide
 * `describeFeedItem` en core —compartido con la app nativa— y este fichero solo
 * decide CÓMO se ve.
 */
import { useTranslation } from 'react-i18next'
import { timeAgo } from '@calistenia/core/lib/dateUtils'
import { capitalizeFirst, describeFeedItem } from '@calistenia/core/lib/feed-item'
import type { FeedItem } from '@calistenia/core/types'
import { cn } from '../../lib/utils'
import { EmojiPicker } from './EmojiPicker'

export interface FeedCardProps {
  item: FeedItem
  isOwnPost?: boolean
  highlight?: boolean
  /** Abrir el detalle de la actividad. `null` cuando este item no tiene destino. */
  onOpen: (() => void) | null
  onTapUser: () => void
  reactions: Record<string, { count: number; hasReacted: boolean }>
  onReact: (emoji: string) => void
  commentCount: number
  onComment: () => void
  onShare: () => void
}

export default function FeedCard({
  item,
  isOwnPost,
  highlight,
  onOpen,
  onTapUser,
  reactions,
  onReact,
  commentCount,
  onComment,
  onShare,
}: FeedCardProps) {
  const { t, i18n } = useTranslation()
  const view = describeFeedItem(item)

  const formattedDate = formatFeedDate(item.completedAt, i18n.language)

  return (
    <div className={cn(
      'px-4 py-3.5 bg-card border border-border rounded-xl hover:border-lime/20 transition-colors shadow-sm',
      highlight && 'feed-flash',
    )}>
      {/* Autor + tiempo */}
      <div className="flex items-center gap-2.5 mb-2.5">
        <button
          onClick={(e) => { e.stopPropagation(); onTapUser() }}
          aria-label={item.displayName}
          className="size-9 rounded-full bg-accent flex items-center justify-center text-xs font-medium text-foreground shrink-0 hover:ring-2 hover:ring-lime/30 transition-all overflow-hidden"
        >
          {item.avatarUrl ? (
            <img src={item.avatarUrl} alt="" className="size-full object-cover" />
          ) : (
            item.displayName[0]?.toUpperCase() || '?'
          )}
        </button>
        <div className="flex-1 min-w-0">
          <button
            onClick={(e) => { e.stopPropagation(); onTapUser() }}
            className="text-sm font-medium truncate hover:text-lime transition-colors block"
          >
            {item.displayName}
            {isOwnPost && <span className="ml-1.5 text-[10px] text-lime font-normal">({t('feed.you')})</span>}
          </button>
          <span className="text-[10px] text-muted-foreground">
            {formattedDate}{formattedDate && ' · '}{timeAgo(item.completedAt)}
          </span>
        </div>
      </div>

      {/* Línea de acción — una frase por tipo, ya traducida en core */}
      <p className="text-xs text-muted-foreground mb-2">{capitalizeFirst(view.action)}</p>

      <FeedCardBody item={item} view={view} onOpen={onOpen} openLabel={t('feed.openDetail')} />

      {/* Reacciones + comentarios + compartir */}
      <div id="tour-feed-reaction" className="mt-2.5 flex flex-wrap items-center gap-2">
        <EmojiPicker reactions={reactions} onToggle={onReact} />
        <button
          onClick={(e) => { e.stopPropagation(); onComment() }}
          className="inline-flex min-h-8 items-center gap-1.5 px-3 py-1 rounded-full text-xs transition-all duration-200 active:scale-95 text-muted-foreground hover:text-sky-400 hover:bg-sky-500/10 border border-border/60"
        >
          <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H5l-3 3V3Z" />
          </svg>
          <span>{t('social.comments')}</span>
          <span className="font-medium tabular-nums">{commentCount}</span>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onShare() }}
          aria-label={t('common.share')}
          className="inline-flex min-h-8 items-center gap-1 px-2.5 py-1 rounded-full text-xs transition-all duration-200 active:scale-95 text-muted-foreground hover:text-pink-400 hover:bg-pink-500/10 border border-transparent"
        >
          <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="3" r="2" />
            <circle cx="12" cy="13" r="2" />
            <circle cx="4" cy="8" r="2" />
            <line x1="5.8" y1="7" x2="10.2" y2="4" />
            <line x1="5.8" y1="9" x2="10.2" y2="12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── Cuerpo de la tarjeta ─────────────────────────────────────────────────────

/**
 * El bloque de la actividad. Un solo layout para los seis tipos: lo único que
 * cambia es el acento y qué líneas trae `view`.
 *
 * Se pinta como `<button>` solo cuando hay destino. No todo lo del muro se puede
 * abrir: el detalle de un circuito ajeno lee `circuit_sessions`, que es
 * owner-only, y el de una batalla lo sirve `/snapshot`, que solo responde a
 * quien jugó. Antes que llevar a un 404, esas tarjetas no son pulsables.
 */
function FeedCardBody({
  item,
  view,
  onOpen,
  openLabel,
}: {
  item: FeedItem
  view: ReturnType<typeof describeFeedItem>
  onOpen: (() => void) | null
  openLabel: string
}) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className={cn('text-sm font-medium truncate', view.accent.text)}>{view.title}</div>
          {view.detail && (
            <div className="text-[11px] text-muted-foreground truncate mt-0.5">{view.detail}</div>
          )}
          {view.metrics && (
            <div className="text-[11px] text-muted-foreground font-mono tracking-wider mt-0.5">{view.metrics}</div>
          )}
        </div>
        {view.badge && (
          <span className="text-[10px] text-muted-foreground font-mono tracking-wider uppercase shrink-0">
            {view.badge}
          </span>
        )}
        {onOpen && (
          <svg className="size-4 text-muted-foreground shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="6,3 11,8 6,13" />
          </svg>
        )}
      </div>
      {item.note && (
        <div className="text-[11px] text-muted-foreground truncate mt-1.5 italic border-t border-border/50 pt-1.5">
          &quot;{item.note}&quot;
        </div>
      )}
    </>
  )

  const shell = cn('w-full text-left px-3 py-2.5 rounded-md bg-muted/30 border-l-[3px]', view.accent.border)

  if (!onOpen) return <div className={shell}>{content}</div>

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onOpen() }}
      aria-label={`${openLabel}: ${view.title}`}
      className={cn(shell, 'hover:bg-muted/50 transition-colors cursor-pointer')}
    >
      {content}
    </button>
  )
}

// ── Fecha ────────────────────────────────────────────────────────────────────

/**
 * "sáb, 9 ago". Devuelve cadena vacía —y no "Invalid Date"— si la marca temporal
 * de la fila viene corrupta, que en un muro que mezcla seis colecciones con tres
 * formatos de fecha distintos es un caso real.
 */
function formatFeedDate(completedAt: string, language: string): string {
  const ms = Date.parse(completedAt)
  if (!Number.isFinite(ms)) return ''
  return new Date(ms).toLocaleDateString(language, { weekday: 'short', day: 'numeric', month: 'short' })
}
