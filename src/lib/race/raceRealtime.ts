import { pb } from '../pocketbase'
import type { Race, RaceParticipant } from '../../types/race'

export interface RaceRealtimeHandlers {
  onRace: (race: Race) => void
  onParticipants: (participants: RaceParticipant[]) => void
  onError?: (e: Error) => void
}

/**
 * Subscribe to live updates for a race and its participants.
 *
 * Owns both subscriptions under one unsub. The participants subscription is
 * filtered by race id on the client (PB wildcard subscription); we maintain a
 * local array and apply create/update/delete events in order, passing a fresh
 * array to the consumer on each change.
 */
export function subscribeRace(raceId: string, handlers: RaceRealtimeHandlers): () => void {
  let cancelled = false
  let participants: RaceParticipant[] = []
  let unsubParticipants: (() => void) | null = null
  let unsubRace: (() => void) | null = null

  const emitParticipants = () => handlers.onParticipants([...participants])

  pb.collection('race_participants').getFullList<RaceParticipant>({
    filter: `race = "${raceId}"`,
    sort: '-distance_km',
    requestKey: null,
  }).then(initial => {
    if (cancelled) return
    participants = initial
    emitParticipants()
  }).catch(err => {
    if (!cancelled) handlers.onError?.(err as Error)
  })

  pb.collection('race_participants').subscribe('*', (e) => {
    if (cancelled) return
    const rec = e.record as unknown as RaceParticipant
    if (rec.race !== raceId) return
    if (e.action === 'create') {
      if (!participants.some(p => p.id === rec.id)) participants = [...participants, rec]
    } else if (e.action === 'update') {
      const idx = participants.findIndex(p => p.id === rec.id)
      participants = idx >= 0
        ? participants.map(p => p.id === rec.id ? rec : p)
        : [...participants, rec]
    } else if (e.action === 'delete') {
      participants = participants.filter(p => p.id !== rec.id)
    }
    emitParticipants()
  }).then(fn => {
    if (cancelled) { fn(); return }
    unsubParticipants = fn
  }).catch(err => {
    if (!cancelled) handlers.onError?.(err as Error)
  })

  pb.collection('races').subscribe(raceId, (e) => {
    if (cancelled) return
    if (e.action === 'update') {
      handlers.onRace(e.record as unknown as Race)
    }
  }).then(fn => {
    if (cancelled) { fn(); return }
    unsubRace = fn
  }).catch(err => {
    if (!cancelled) handlers.onError?.(err as Error)
  })

  return () => {
    cancelled = true
    unsubParticipants?.()
    unsubRace?.()
    unsubParticipants = null
    unsubRace = null
  }
}
