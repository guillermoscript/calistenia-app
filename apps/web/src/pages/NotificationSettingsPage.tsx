import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthState } from '../contexts/AuthContext'
import { useNotificationPrefs, NOTIFICATION_PREF_KEYS, type NotificationPrefs } from '@calistenia/core/hooks/useNotificationPrefs'
import { cn } from '../lib/utils'
import { Loader } from '../components/ui/loader'

// ── Groups ────────────────────────────────────────────────────────────────────

type PrefKey = keyof NotificationPrefs

const GROUPS: { titleKey: string; keys: PrefKey[] }[] = [
  {
    titleKey: 'notifSettings.sectionSocial',
    keys: ['reactions', 'comments', 'follows', 'challenges', 'referrals'],
  },
  {
    titleKey: 'notifSettings.sectionFriends',
    keys: ['friend_workouts', 'friend_streaks', 'friend_achievements'],
  },
  {
    titleKey: 'notifSettings.sectionYou',
    keys: ['own_milestones'],
  },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

interface ToggleRowProps {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}

function ToggleRow({ label, checked, disabled = false, onChange }: ToggleRowProps) {
  return (
    <div className={cn('flex items-center justify-between py-3 px-4 rounded-xl transition-colors', disabled && 'opacity-40')}>
      <span className={cn('text-sm', checked ? 'text-foreground' : 'text-muted-foreground')}>
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="shrink-0 flex items-center justify-center w-11 h-11 -mr-2"
      >
        <div className={cn(
          'w-9 h-[22px] rounded-full relative transition-colors',
          checked ? 'bg-lime-400' : 'bg-muted-foreground/20',
        )}>
          <div className={cn(
            'absolute top-[2px] size-[18px] rounded-full bg-white transition-transform shadow-sm',
            checked ? 'translate-x-[16px]' : 'translate-x-[2px]',
          )} />
        </div>
      </button>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationSettingsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { userId } = useAuthState()
  const { prefs, loading, saving, setPref } = useNotificationPrefs(userId)

  // NOTIFICATION_PREF_KEYS is the full array; filter it to only the grouped keys
  // so any key not in a group is still type-safe.
  void NOTIFICATION_PREF_KEYS

  return (
    <div className="max-w-lg mx-auto px-4 md:px-6 py-6 md:py-8">
      {/* Header */}
      <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">
        {t('notifSettings.subtitle')}
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
        <h1 className="font-bebas text-4xl md:text-5xl">{t('notifSettings.title')}</h1>
        {saving && (
          <div className="ml-auto">
            <Loader size="sm" label="" />
          </div>
        )}
      </div>

      {loading ? (
        <Loader label="" className="py-12" />
      ) : (
        <div className="flex flex-col gap-6">
          {/* Master push toggle */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 pt-3 pb-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground/60">
                Push
              </div>
            </div>
            <ToggleRow
              label={t('notifSettings.pushMaster')}
              checked={prefs.push_enabled}
              onChange={(v) => setPref('push_enabled', v)}
            />
            <div className="px-4 pb-3 text-[11px] text-muted-foreground/60 leading-relaxed -mt-1">
              {t('notifSettings.pushMasterDesc')}
            </div>
          </div>

          {/* Grouped prefs */}
          {GROUPS.map((group) => (
            <div key={group.titleKey} className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 pt-3 pb-1">
                <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground/60">
                  {t(group.titleKey)}
                </div>
              </div>
              <div className="divide-y divide-border/40">
                {group.keys.map((key) => (
                  <ToggleRow
                    key={key}
                    label={t(`notifSettings.${key}`)}
                    checked={prefs[key]}
                    onChange={(v) => setPref(key, v)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
