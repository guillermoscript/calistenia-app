import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthState } from '../contexts/AuthContext'
import { useBlocks } from '@calistenia/core/hooks/useBlocks'
import { Loader } from '../components/ui/loader'
import { Button } from '../components/ui/button'

// ── Sub-components ────────────────────────────────────────────────────────────

function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function BlockedUsersPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { userId } = useAuthState()
  const { blocked, unblock, loading } = useBlocks(userId)

  return (
    <div className="max-w-lg mx-auto px-4 md:px-6 py-6 md:py-8">
      {/* Header */}
      <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">
        {t('blocks.manageEntry')}
      </div>
      <div className="flex items-center gap-3 mb-8">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="size-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 active:scale-95 transition-all shrink-0"
          aria-label={t('common.back', { defaultValue: 'Volver' })}
        >
          <BackIcon className="size-4" />
        </button>
        <h1 className="font-bebas text-4xl md:text-5xl">{t('blocks.manageTitle')}</h1>
      </div>

      {loading ? (
        <Loader label="" className="py-12" />
      ) : blocked.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          {t('blocks.empty')}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border/40">
          {blocked.map(u => (
            <div key={u.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-10 rounded-full bg-accent flex items-center justify-center text-sm font-bebas text-foreground shrink-0 overflow-hidden">
                  {u.avatarUrl ? (
                    <img src={u.avatarUrl} alt={u.displayName} className="size-full object-cover" />
                  ) : (
                    u.displayName[0]?.toUpperCase() || '?'
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{u.displayName}</div>
                  {u.username && (
                    <div className="text-[10px] text-muted-foreground truncate">@{u.username}</div>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => unblock(u.id)}
                className="text-[10px] tracking-widest h-9 border-red-500/60 text-red-500 hover:bg-red-500 hover:text-white shrink-0"
              >
                {t('blocks.unblockBtn')}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
