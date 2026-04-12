import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthState } from '../contexts/AuthContext'
import { RaceProvider, useRaceContext } from '../contexts/RaceContext'
import { Loader } from '../components/ui/loader'
import { Button } from '../components/ui/button'
import RaceLobby from '../components/race/RaceLobby'
import RaceCountdown from '../components/race/RaceCountdown'
import RaceLive from '../components/race/RaceLive'
import RaceResults from '../components/race/RaceResults'

export default function RacePage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthState()

  if (!id) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-bebas text-3xl text-red-400">{t('race.noRace')}</h1>
        <Button onClick={() => navigate('/cardio')} variant="outline" className="font-bebas tracking-widest">
          CARDIO
        </Button>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-bebas text-4xl tracking-wide">{t('race.lobby')}</h1>
        <p className="text-muted-foreground text-sm">{t('race.waitingForStart')}</p>
        <Button
          onClick={() => navigate('/auth')}
          className="bg-lime hover:bg-lime/90 text-zinc-900 font-bebas text-lg tracking-widest px-8"
        >
          Login
        </Button>
      </div>
    )
  }

  return (
    <RaceProvider raceId={id}>
      <RaceRouter />
    </RaceProvider>
  )
}

function RaceRouter() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { phase } = useRaceContext()

  switch (phase) {
    case 'loading':
      return <div className="flex justify-center py-20"><Loader /></div>

    case 'not_found':
      return (
        <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
          <h1 className="font-bebas text-3xl text-red-400">{t('race.noRace')}</h1>
          <Button onClick={() => navigate('/cardio')} variant="outline" className="font-bebas tracking-widest">
            CARDIO
          </Button>
        </div>
      )

    case 'lobby':
      return <RaceLobby />

    case 'countdown':
      return (
        <>
          <RaceLobby />
          <RaceCountdown />
        </>
      )

    case 'racing':
      return <RaceLive />

    case 'finished':
      return <RaceResults />

    case 'cancelled':
      return (
        <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
          <h1 className="font-bebas text-3xl text-muted-foreground">CANCELADA</h1>
          <Button onClick={() => navigate('/cardio')} variant="outline" className="font-bebas tracking-widest">
            CARDIO
          </Button>
        </div>
      )
  }
}
