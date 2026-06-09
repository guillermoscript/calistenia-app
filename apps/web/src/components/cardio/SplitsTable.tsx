import { formatPace, formatDuration } from '../../lib/geo'
import type { KmSplit } from '../../types'

interface SplitsTableProps {
  splits: KmSplit[]
}

export default function SplitsTable({ splits }: SplitsTableProps) {
  if (splits.length === 0) return null

  const paces = splits.map(s => s.pace).filter(p => p > 0)
  const fastestPace = Math.min(...paces)
  const slowestPace = Math.max(...paces)

  return (
    <div className="rounded-xl overflow-hidden border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/60">
            <th className="text-left px-3 sm:px-4 py-2 text-[10px] font-mono tracking-widest text-muted-foreground">KM</th>
            <th className="text-right px-3 sm:px-4 py-2 text-[10px] font-mono tracking-widest text-muted-foreground">TIEMPO</th>
            <th className="text-right px-3 sm:px-4 py-2 text-[10px] font-mono tracking-widest text-muted-foreground">RITMO</th>
          </tr>
        </thead>
        <tbody>
          {splits.map((split) => {
            const isFastest = split.pace === fastestPace && paces.length > 1
            const isSlowest = split.pace === slowestPace && paces.length > 1
            return (
              <tr
                key={split.km}
                className={
                  isFastest
                    ? 'bg-lime/10'
                    : isSlowest
                      ? 'bg-red-500/10'
                      : 'bg-muted/30'
                }
              >
                <td className="px-3 sm:px-4 py-2">
                  <span className="font-bebas text-base tabular-nums">{split.km}</span>
                  {isFastest && <span className="ml-1.5 text-[9px] text-lime">MEJOR</span>}
                  {isSlowest && <span className="ml-1.5 text-[9px] text-red-500">MÁS LENTO</span>}
                </td>
                <td className="px-3 sm:px-4 py-2 text-right font-bebas text-base tabular-nums">
                  {formatDuration(split.time_seconds)}
                </td>
                <td className={`px-3 sm:px-4 py-2 text-right font-bebas text-base tabular-nums ${
                  isFastest ? 'text-lime' : isSlowest ? 'text-red-500' : 'text-sky-500'
                }`}>
                  {formatPace(split.pace)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
