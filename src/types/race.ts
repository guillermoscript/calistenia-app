export type RaceMode = 'distance' | 'time'

export type RaceStatus = 'waiting' | 'countdown' | 'active' | 'finished' | 'cancelled'

export type ParticipantStatus = 'joined' | 'ready' | 'racing' | 'finished' | 'dnf'

export type RaceActivityType = 'running' | 'walking' | 'cycling'

export interface Race {
  id: string
  creator: string
  name: string
  mode: RaceMode
  target_distance_km: number
  target_duration_seconds: number
  status: RaceStatus
  starts_at: string
  ends_at: string
  finished_at: string | null
  route_points: Array<{ lat: number; lng: number }> | null
  is_public: boolean
  origin_lat: number
  origin_lng: number
  activity_type: RaceActivityType
  created: string
  updated: string
}

export interface RaceParticipant {
  id: string
  race: string
  user: string
  display_name: string
  status: ParticipantStatus
  distance_km: number
  duration_seconds: number
  avg_pace: number
  last_lat: number | null
  last_lng: number | null
  last_update: string | null
  finished_at: string | null
  gps_track: Array<RaceGpsPoint> | null
}

export interface RaceGpsPoint {
  lat: number
  lng: number
  t: number
}
