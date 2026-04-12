import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { cn } from '../../lib/utils'
import RouteDrawer from './RouteDrawer'
import { createRace } from '../../lib/race/raceApi'
import { op } from '../../lib/analytics'
import type { Race, RaceMode } from '../../types/race'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (race: Race) => void
}

export default function CreateRaceDialog({ open, onOpenChange, onCreated }: Props) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [mode, setMode] = useState<RaceMode>('distance')
  const [targetKm, setTargetKm] = useState('')
  const [targetMin, setTargetMin] = useState('')
  const [routePoints, setRoutePoints] = useState<Array<{ lat: number; lng: number }>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError('')
    try {
      const race = await createRace({
        name: name.trim(),
        mode,
        target_distance_km: mode === 'distance' && targetKm ? parseFloat(targetKm) : undefined,
        target_duration_seconds: mode === 'time' && targetMin ? parseFloat(targetMin) * 60 : undefined,
        route_points: routePoints.length > 0 ? routePoints : undefined,
      })
      op.track('race_created', {
        race_id: race.id,
        mode,
        target_distance_km: race.target_distance_km,
        target_duration_seconds: race.target_duration_seconds,
        has_route: routePoints.length > 0,
      })
      onCreated(race)
      setName('')
      setTargetKm('')
      setTargetMin('')
      setRoutePoints([])
      setMode('distance')
      onOpenChange(false)
    } catch (err) {
      setError((err as Error)?.message || 'Error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-bebas text-2xl tracking-wide">{t('race.create')}</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            {t('race.waitingForParticipants')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground tracking-widest uppercase mb-1.5 block">
              {t('race.name')}
            </label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('race.name')}
              maxLength={60}
              required
              autoFocus
              className="bg-muted/50 border-border"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground tracking-widest uppercase mb-1.5 block">
              MODO
            </label>
            <div className="grid grid-cols-2 gap-2">
              <ModeButton active={mode === 'distance'} onClick={() => setMode('distance')}>
                DISTANCIA
              </ModeButton>
              <ModeButton active={mode === 'time'} onClick={() => setMode('time')}>
                TIEMPO
              </ModeButton>
            </div>
          </div>

          {mode === 'distance' && (
            <div>
              <label className="text-xs text-muted-foreground tracking-widest uppercase mb-1.5 block">
                {t('race.targetDistance')}
              </label>
              <Input
                type="number"
                value={targetKm}
                onChange={e => setTargetKm(e.target.value)}
                placeholder="5.0"
                min={0}
                step={0.1}
                className="bg-muted/50 border-border"
              />
            </div>
          )}

          {mode === 'time' && (
            <div>
              <label className="text-xs text-muted-foreground tracking-widest uppercase mb-1.5 block">
                MINUTOS
              </label>
              <Input
                type="number"
                value={targetMin}
                onChange={e => setTargetMin(e.target.value)}
                placeholder="20"
                min={0}
                step={1}
                className="bg-muted/50 border-border"
              />
            </div>
          )}

          <div>
            <label className="text-xs text-muted-foreground tracking-widest uppercase mb-1.5 block">
              RUTA (opcional)
            </label>
            <RouteDrawer points={routePoints} onChange={setRoutePoints} height="200px" />
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={!name.trim() || loading}
            className="w-full h-12 bg-lime hover:bg-lime/90 text-zinc-900 font-bebas text-lg tracking-widest"
          >
            {loading ? '...' : t('race.create')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-11 rounded-lg border font-bebas text-sm tracking-widest transition-colors',
        active
          ? 'bg-lime/15 border-lime/40 text-lime'
          : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted/60',
      )}
    >
      {children}
    </button>
  )
}
