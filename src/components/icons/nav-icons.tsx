export interface IconProps {
  className?: string
}

export function LayoutIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="1" width="6" height="6" rx="1" />
      <rect x="9" y="1" width="6" height="6" rx="1" />
      <rect x="1" y="9" width="6" height="6" rx="1" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  )
}

export function DumbbellIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="6" width="3" height="4" rx="0.5" />
      <rect x="12" y="6" width="3" height="4" rx="0.5" />
      <line x1="4" y1="8" x2="12" y2="8" />
      <rect x="2.5" y="5" width="2" height="6" rx="0.5" />
      <rect x="11.5" y="5" width="2" height="6" rx="0.5" />
    </svg>
  )
}

export function SpineIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="8" y1="1" x2="8" y2="15" />
      <rect x="5" y="3" width="6" height="2.5" rx="0.5" />
      <rect x="5" y="6.75" width="6" height="2.5" rx="0.5" />
      <rect x="5" y="10.5" width="6" height="2.5" rx="0.5" />
    </svg>
  )
}

export function ChartIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polyline points="1,12 5,7 8,9 12,4 15,6" />
      <line x1="1" y1="14" x2="15" y2="14" />
    </svg>
  )
}

export function NutritionIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M5 1v4a3 3 0 006 0V1" />
      <line x1="8" y1="8" x2="8" y2="15" />
      <line x1="5" y1="1" x2="5" y2="5" />
      <line x1="8" y1="1" x2="8" y2="4" />
      <line x1="11" y1="1" x2="11" y2="5" />
    </svg>
  )
}

export function ProfileIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="5" r="3" />
      <path d="M2 14c0-3 2.5-5 6-5s6 2 6 5" />
    </svg>
  )
}

export function ProgramIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="1" width="12" height="14" rx="1.5" />
      <line x1="5" y1="5" x2="11" y2="5" />
      <line x1="5" y1="8" x2="11" y2="8" />
      <line x1="5" y1="11" x2="9" y2="11" />
    </svg>
  )
}

export function ExerciseIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6" />
      <polyline points="8,4 8,8 11,10" />
    </svg>
  )
}

export function RunningIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="10" cy="3" r="1.5" />
      <path d="M5 16l2-5 3 2v5" />
      <path d="M8 8l-3 3 1.5 1" />
      <path d="M8 8l2-2 3 1" />
    </svg>
  )
}

export function ChallengeIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4v4l3 2" />
      <polyline points="11,2 13,4" />
    </svg>
  )
}

export function ActivityIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1 8h3l2-4 2 8 2-4h5" />
    </svg>
  )
}

export function FriendsIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="6" cy="5" r="2.5" />
      <path d="M1 14c0-2.5 2-4 5-4s5 1.5 5 4" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 9c2 0 3.5 1 3.5 3" />
    </svg>
  )
}

export function TrophyIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 2h8v5a4 4 0 01-8 0V2z" />
      <path d="M4 4H2a1 1 0 00-1 1v1a2 2 0 002 2h1" />
      <path d="M12 4h2a1 1 0 011 1v1a2 2 0 01-2 2h-1" />
      <line x1="8" y1="11" x2="8" y2="13" />
      <line x1="5" y1="14" x2="11" y2="14" />
    </svg>
  )
}

export function FreeSessionIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="2" width="12" height="12" rx="2" />
      <line x1="5" y1="6" x2="11" y2="6" />
      <line x1="5" y1="8.5" x2="11" y2="8.5" />
      <line x1="5" y1="11" x2="9" y2="11" />
      <polyline points="10,3 12,5 14,1" strokeWidth="2" />
    </svg>
  )
}

export function CalendarNavIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="3" width="14" height="12" rx="1.5" />
      <line x1="1" y1="7" x2="15" y2="7" />
      <line x1="4" y1="1" x2="4" y2="4" />
      <line x1="12" y1="1" x2="12" y2="4" />
    </svg>
  )
}

export function ShieldIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 1L2 4v4c0 3.5 2.5 6 6 7 3.5-1 6-3.5 6-7V4L8 1z" />
    </svg>
  )
}

export function PencilIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
    </svg>
  )
}

export function LogOutIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 2H2v12h4" />
      <polyline points="10,5 14,8 10,11" />
      <line x1="6" y1="8" x2="14" y2="8" />
    </svg>
  )
}

export function SleepIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M13.5 10A6 6 0 0 1 6 2.5a6 6 0 1 0 7.5 7.5z" />
    </svg>
  )
}

export function BellIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 1.5a4 4 0 00-4 4v3l-1.5 2h11L12 8.5v-3a4 4 0 00-4-4z" />
      <path d="M6.5 13.5a1.5 1.5 0 003 0" />
    </svg>
  )
}

export function SunIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="3" />
      <line x1="8" y1="1" x2="8" y2="2.5" />
      <line x1="8" y1="13.5" x2="8" y2="15" />
      <line x1="1" y1="8" x2="2.5" y2="8" />
      <line x1="13.5" y1="8" x2="15" y2="8" />
      <line x1="3" y1="3" x2="4.1" y2="4.1" />
      <line x1="11.9" y1="11.9" x2="13" y2="13" />
      <line x1="13" y1="3" x2="11.9" y2="4.1" />
      <line x1="4.1" y1="11.9" x2="3" y2="13" />
    </svg>
  )
}

export function ReferralIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="5" cy="5" r="2.5" />
      <path d="M0.5 13c0-2 1.5-3.5 4.5-3.5" />
      <circle cx="11" cy="5" r="2.5" />
      <path d="M15.5 13c0-2-1.5-3.5-4.5-3.5" />
      <path d="M8 9v4" />
      <path d="M6 11h4" />
    </svg>
  )
}

export function MoonIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M13.5 10A6 6 0 0 1 6 2.5a6 6 0 1 0 7.5 7.5z" />
    </svg>
  )
}

// ── Action icons ──────────────────────────────────────────────────────────────

export function ArrowLeftIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <line x1="13" y1="8" x2="3" y2="8" />
      <polyline points="7,4 3,8 7,12" />
    </svg>
  )
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <polyline points="3,8 7,12 13,4" />
    </svg>
  )
}

export function CopyIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="5" y="5" width="9" height="9" rx="1" />
      <path d="M3 11V3a1 1 0 011-1h8" />
    </svg>
  )
}

export function EditIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M11.5 2.5l2 2L5 13H3v-2z" />
      <line x1="9.5" y1="4.5" x2="11.5" y2="6.5" />
    </svg>
  )
}

export function ShareIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="12" cy="3" r="2" />
      <circle cx="12" cy="13" r="2" />
      <circle cx="4" cy="8" r="2" />
      <line x1="5.8" y1="7" x2="10.2" y2="4" />
      <line x1="5.8" y1="9" x2="10.2" y2="12" />
    </svg>
  )
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="7" cy="7" r="5" />
      <line x1="11" y1="11" x2="15" y2="15" />
    </svg>
  )
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <line x1="8" y1="3" x2="8" y2="13" />
      <line x1="3" y1="8" x2="13" y2="8" />
    </svg>
  )
}

export function CircuitIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M8 1v2M8 13v2" />
      <path d="M1 8h2M13 8h2" />
      <circle cx="8" cy="8" r="5" />
      <path d="M8 5v3l2 1.5" />
    </svg>
  )
}
