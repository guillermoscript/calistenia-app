import { useCallback } from 'react'
import { Button } from './ui/button'

interface WorkoutShareCardProps {
  workoutTitle: string
  totalSets: number
  durationMin: number
  date?: string
}

export default function WorkoutShareCard({ workoutTitle, totalSets, durationMin, date }: WorkoutShareCardProps) {
  const dateStr = date || new Date().toISOString().split('T')[0]

  const handleShare = useCallback(async () => {
    const canvas = document.createElement('canvas')
    const scale = 2
    const w = 400
    const h = 220
    canvas.width = w * scale
    canvas.height = h * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.scale(scale, scale)

    // Background
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, w, h)

    // Border accent
    ctx.fillStyle = '#c8f542'
    ctx.fillRect(0, 0, 4, h)

    // App name
    ctx.fillStyle = '#c8f542'
    ctx.font = 'bold 14px system-ui'
    ctx.fillText('Calistenia App', 20, 30)

    // Date
    ctx.fillStyle = '#666'
    ctx.font = '12px system-ui'
    ctx.fillText(dateStr, 20, 50)

    // Workout title
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 28px system-ui'
    ctx.fillText(workoutTitle.toUpperCase(), 20, 95)

    // Stats
    const stats = [
      { label: 'Series', value: String(totalSets), color: '#c8f542' },
      { label: 'Duración', value: `${durationMin} min`, color: '#38bdf8' },
    ]

    stats.forEach((s, i) => {
      const x = 20 + i * 140
      ctx.fillStyle = s.color
      ctx.font = 'bold 32px system-ui'
      ctx.fillText(s.value, x, 150)
      ctx.fillStyle = '#888'
      ctx.font = '12px system-ui'
      ctx.fillText(s.label, x, 170)
    })

    // Footer
    ctx.fillStyle = '#333'
    ctx.fillRect(20, 190, w - 40, 1)
    ctx.fillStyle = '#555'
    ctx.font = '10px system-ui'
    ctx.fillText('calistenia-app.com', 20, 208)

    canvas.toBlob(async (blob) => {
      if (!blob) return
      if (navigator.share) {
        const file = new File([blob], `workout_${dateStr}.png`, { type: 'image/png' })
        await navigator.share({
          files: [file],
          title: `${workoutTitle} - ${dateStr}`,
          text: `${workoutTitle} — ${totalSets} series en ${durationMin} min`,
        }).catch(() => {})
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `workout_${dateStr}.png`
        a.click()
        URL.revokeObjectURL(url)
      }
    }, 'image/png')
  }, [workoutTitle, totalSets, durationMin, dateStr])

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleShare}
      className="font-mono text-[10px] tracking-[2px] border-lime/25 text-lime hover:bg-lime/10"
    >
      COMPARTIR
    </Button>
  )
}
