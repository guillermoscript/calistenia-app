import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from './ui/dialog'
import changelogJson from '@calistenia/core/data/changelog.mobile.json'
import {
  compareVersions,
  dotColorForType,
  getUnseenVersions as getUnseenVersionsCore,
  pickLang,
  type ChangelogData,
  type ChangelogVersion,
} from '@calistenia/core/lib/whats-new'
import i18n from '../lib/i18n'
import { cn } from '../lib/utils'

const CHANGELOG = changelogJson as ChangelogData
// Web deploys continuously (no discrete "installed version") — the newest
// entry in the changelog is always considered current, so nothing is ever
// filtered out as "not released yet" the way mobile's app.json version gates it.
const CURRENT_VERSION = CHANGELOG.versions[0]?.version ?? '0.0.0'
const LS_KEY = 'calistenia_last_seen_version'

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
  return getUnseenVersionsCore(CHANGELOG.versions, CURRENT_VERSION, localStorage.getItem(LS_KEY))
}

function markSeen() {
  localStorage.setItem(LS_KEY, CURRENT_VERSION)
}

// ── Staggered item reveal ────────────────────────────────────────────────────

function StaggeredItem({ index, children }: { index: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60 + index * 55)
    return () => clearTimeout(t)
  }, [index])

  return (
    <div
      ref={ref}
      className={cn(
        'transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1.5',
      )}
    >
      {children}
    </div>
  )
}

// ── Version block — curated bilingual summary + highlights (same content as mobile) ──

function VersionBlock({ version, isFirst }: { version: ChangelogVersion; isFirst: boolean }) {
  const { i18n: i18nInstance } = useTranslation()
  const lang = i18nInstance.language

  return (
    <div className="relative">
      {/* Version header */}
      <div className={cn('flex items-end gap-3 mb-2', isFirst ? '' : 'mt-1')}>
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

      {/* Summary */}
      <p className="text-[13px] leading-snug text-muted-foreground mb-4">
        {pickLang(version.summary, lang)}
      </p>

      {/* Highlights */}
      <div className="space-y-3.5">
        {version.highlights.map((h, i) => (
          <StaggeredItem key={i} index={i}>
            <div className="flex items-start gap-3">
              <div className="w-6 flex items-center justify-center pt-0.5 shrink-0">
                <span className="text-[17px] leading-none">{h.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="size-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: dotColorForType(h.type) }}
                  />
                  <span className="text-[14px] font-semibold text-foreground leading-tight">
                    {pickLang(h.title, lang)}
                  </span>
                </div>
                <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
                  {pickLang(h.body, lang)}
                </p>
              </div>
            </div>
          </StaggeredItem>
        ))}
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
  const displayVersions = versions || CHANGELOG.versions.filter(
    (v) => compareVersions(v.version, CURRENT_VERSION) <= 0,
  )

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
                v{CURRENT_VERSION}
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
        v{CURRENT_VERSION}
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
        {t('whatsNew.title')} · v{CURRENT_VERSION}
      </button>
      <WhatsNewDialog
        open={open}
        onOpenChange={handleOpenChange}
        versions={hasUnseen ? unseen : undefined}
      />
    </>
  )
}
