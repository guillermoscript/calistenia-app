import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from './ui/dialog'
import changelog from '../data/changelog.json'
import i18n from '../lib/i18n'
import { cn } from '../lib/utils'

const APP_VERSION = __APP_VERSION__
const LS_KEY = 'calistenia_last_seen_version'

interface ChangelogItem {
  description: string
  scope: string | null
  breaking: boolean
  hash: string
}

interface ChangelogGroup {
  label: string
  emoji: string
  type: string
  items: ChangelogItem[]
}

interface ChangelogVersion {
  version: string
  date: string
  groups: ChangelogGroup[]
}

// ── Type visuals ─────────────────────────────────────────────────────────────

const TYPE_STYLES: Record<string, { dot: string; label: string }> = {
  feat:     { dot: 'bg-lime-400',           label: 'text-lime-400/80' },
  fix:      { dot: 'bg-amber-400',          label: 'text-amber-400/80' },
  perf:     { dot: 'bg-sky-400',            label: 'text-sky-400/80' },
  refactor: { dot: 'bg-violet-400',         label: 'text-violet-400/80' },
  style:    { dot: 'bg-pink-400',           label: 'text-pink-400/80' },
  chore:    { dot: 'bg-foreground/30',      label: 'text-muted-foreground' },
  other:    { dot: 'bg-foreground/30',      label: 'text-muted-foreground' },
}

function formatDate(iso: string): string {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString(i18n.language, {
      day: 'numeric', month: 'short',
    })
  } catch {
    return iso
  }
}

function getUnseenVersions(): ChangelogVersion[] {
  const lastSeen = localStorage.getItem(LS_KEY)
  if (!lastSeen) return changelog.versions.slice(0, 1)
  if (lastSeen === APP_VERSION) return []
  const idx = changelog.versions.findIndex(v => v.version === lastSeen)
  if (idx <= 0) return changelog.versions.slice(0, 1)
  return changelog.versions.slice(0, idx)
}

function markSeen() {
  localStorage.setItem(LS_KEY, APP_VERSION)
}

// ── Staggered item reveal ────────────────────────────────────────────────────

function StaggeredItem({ index, children }: { index: number; children: React.ReactNode }) {
  const ref = useRef<HTMLLIElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60 + index * 35)
    return () => clearTimeout(t)
  }, [index])

  return (
    <li
      ref={ref}
      className={cn(
        'transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1.5',
      )}
    >
      {children}
    </li>
  )
}

// ── Version block ────────────────────────────────────────────────────────────

function VersionBlock({ version, isFirst }: { version: ChangelogVersion; isFirst: boolean }) {
  let itemIndex = 0

  return (
    <div className="relative">
      {/* Version header */}
      <div className={cn('flex items-end gap-3 mb-4', isFirst ? '' : 'mt-1')}>
        <span
          className="font-['Bebas_Neue',cursive] text-[2rem] leading-none tracking-wide text-foreground"
          style={{ fontFeatureSettings: '"tnum"' }}
        >
          {version.version}
        </span>
        <span className="text-[11px] text-muted-foreground/60 pb-[3px] font-medium uppercase tracking-wider">
          {formatDate(version.date)}
        </span>
      </div>

      {/* Groups */}
      <div className="space-y-4">
        {version.groups.map(group => {
          const style = TYPE_STYLES[group.type] || TYPE_STYLES.other
          return (
            <div key={group.type}>
              {/* Group label */}
              <div className="flex items-center gap-2 mb-2">
                <div className={cn('size-1.5 rounded-full shrink-0', style.dot)} />
                <span className={cn('text-[10px] font-semibold uppercase tracking-[0.1em]', style.label)}>
                  {group.label}
                </span>
                <span className="text-[10px] text-muted-foreground/30 font-medium">
                  {group.items.length}
                </span>
              </div>

              {/* Items */}
              <ul className="space-y-1.5 pl-[18px]">
                {group.items.map((item, i) => {
                  const idx = itemIndex++
                  return (
                    <StaggeredItem key={i} index={idx}>
                      <div className="flex items-start gap-2 group">
                        <div className="flex items-start gap-2 min-w-0">
                          {item.breaking ? (
                            <span className="shrink-0 mt-[2px] inline-block text-[9px] font-bold text-destructive bg-destructive/10 rounded px-1 py-px uppercase tracking-wider">
                              break
                            </span>
                          ) : null}
                          <span className="text-[13px] leading-relaxed text-foreground/85">
                            {item.scope ? (
                              <span className="text-muted-foreground/60 font-medium">{item.scope} — </span>
                            ) : null}
                            {item.description}
                          </span>
                        </div>
                        <span className="shrink-0 text-[10px] text-muted-foreground/20 font-mono pt-[3px] opacity-0 group-hover:opacity-100 transition-opacity">
                          {item.hash}
                        </span>
                      </div>
                    </StaggeredItem>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── WhatsNewDialog (controlled) ──────────────────────────────────────────────

export function WhatsNewDialog({
  open, onOpenChange, versions,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  versions?: ChangelogVersion[]
}) {
  const { t } = useTranslation()
  const displayVersions = versions || changelog.versions

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[26rem] max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden rounded-xl border-border/60">
        {/* Header — editorial style */}
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0 space-y-0">
          <div className="flex items-start justify-between">
            <div>
              <DialogDescription className="text-[10px] font-semibold uppercase tracking-[0.15em] text-lime-400/70 mb-1">
                Changelog
              </DialogDescription>
              <DialogTitle className="font-['Bebas_Neue',cursive] text-xl tracking-wide text-foreground leading-none">
                {t('whatsNew.title')}
              </DialogTitle>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
              <div className="size-1.5 rounded-full bg-lime-400 animate-pulse" />
              <span className="text-[10px] font-mono text-muted-foreground/50">
                v{APP_VERSION}
              </span>
            </div>
          </div>
        </DialogHeader>

        {/* Divider */}
        <div className="mx-6 h-px bg-border/50" />

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-8">
            {displayVersions.map((version, i) => (
              <VersionBlock key={version.version} version={version} isFirst={i === 0} />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 shrink-0 border-t border-border/40">
          <button
            onClick={() => onOpenChange(false)}
            className={cn(
              'w-full h-9 rounded-lg text-[13px] font-medium tracking-wide transition-all duration-200',
              'bg-foreground/[0.06] text-foreground/70 hover:bg-foreground/[0.1] hover:text-foreground',
              'active:scale-[0.98]',
            )}
          >
            {t('whatsNew.continue')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Auto-show wrapper ────────────────────────────────────────────────────────

export default function WhatsNew() {
  const unseen = useMemo(() => getUnseenVersions(), [])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (unseen.length > 0) {
      const t = setTimeout(() => setOpen(true), 800)
      return () => clearTimeout(t)
    }
  }, [unseen.length])

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) markSeen()
  }

  if (unseen.length === 0) return null
  return <WhatsNewDialog open={open} onOpenChange={handleOpenChange} versions={unseen} />
}

// ── Manual trigger (for sidebar/settings) ────────────────────────────────────

export function WhatsNewButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn('transition-colors', className)}
      >
        v{APP_VERSION}
      </button>
      <WhatsNewDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

// ── Home page button (optional, with unseen dot) ────────────────────────────

export function WhatsNewHomeButton({ className }: { className?: string }) {
  const { t } = useTranslation()
  const unseen = useMemo(() => getUnseenVersions(), [])
  const hasUnseen = unseen.length > 0
  const [open, setOpen] = useState(false)

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next && hasUnseen) markSeen()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors',
          className,
        )}
      >
        {hasUnseen && <span className="size-1.5 rounded-full bg-lime-400 animate-pulse" />}
        {t('whatsNew.title')} · v{APP_VERSION}
      </button>
      <WhatsNewDialog
        open={open}
        onOpenChange={handleOpenChange}
        versions={hasUnseen ? unseen : undefined}
      />
    </>
  )
}
