import { useEffect, useState } from 'react'
import { op } from '@calistenia/core/lib/analytics'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'

const SOURCES = ['ChatGPT o IA', 'Google', 'Instagram, TikTok o YouTube', 'Recomendación de alguien', 'Otro'] as const
const GOALS = ['Una rutina de calistenia', 'Aprender un ejercicio', 'Seguir mi progreso', 'Entrenar en casa', 'Otro'] as const

function storageKey(userId: string) {
  return `calistenia_discovery_survey_v1_${userId}`
}

/** Encuesta local, opcional y de una sola vez. Solo manda respuestas estructuradas a OpenPanel. */
export default function DiscoverySurvey({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState<string | null>(null)
  const [goal, setGoal] = useState<string | null>(null)

  useEffect(() => {
    if (localStorage.getItem(storageKey(userId))) return
    const timeout = window.setTimeout(() => {
      setOpen(true)
      op.track('discovery_survey_viewed', { platform: 'web' })
    }, 4_000)
    return () => window.clearTimeout(timeout)
  }, [userId])

  const dismiss = () => {
    localStorage.setItem(storageKey(userId), 'dismissed')
    setOpen(false)
    op.track('discovery_survey_dismissed', { platform: 'web', step: source ? 'goal' : 'source' })
  }

  const submit = () => {
    if (!source || !goal) return
    localStorage.setItem(storageKey(userId), 'answered')
    setOpen(false)
    op.track('discovery_survey_completed', {
      platform: 'web',
      discovery_source: source,
      user_goal: goal,
    })
  }

  const options = source ? GOALS : SOURCES
  const selected = source ? goal : source
  const choose = (value: string) => source ? setGoal(value) : setSource(value)

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) dismiss() }}>
      <DialogContent hideClose className="max-w-md" data-testid="discovery-survey">
        <DialogHeader>
          <DialogTitle>Ayúdanos a mejorar Calistenia</DialogTitle>
          <DialogDescription>Es opcional y toma menos de un minuto.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <p className="font-medium">{source ? '¿Qué estabas buscando cuando llegaste?' : '¿Cómo conociste Calistenia?'}</p>
          <div className="grid gap-2">
            {options.map((option) => (
              <Button
                key={option}
                variant={selected === option ? 'limeSolid' : 'outline'}
                className="justify-start whitespace-normal text-left"
                onClick={() => choose(option)}
              >
                {option}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={dismiss}>Ahora no</Button>
          {source ? <Button variant="limeSolid" disabled={!goal} onClick={submit}>Enviar</Button> : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
