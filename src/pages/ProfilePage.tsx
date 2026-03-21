import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { cn } from '../lib/utils'
import { pb, isPocketBaseAvailable, getUserAvatarUrl } from '../lib/pocketbase'
import { WhatsAppIcon } from '../components/icons/WhatsAppIcon'

const LEVELS = [
  { value: 'principiante', label: 'Principiante' },
  { value: 'intermedio', label: 'Intermedio' },
  { value: 'avanzado', label: 'Avanzado' },
]

interface ProfilePageProps {
  user: any
}

export default function ProfilePage({ user }: ProfilePageProps) {
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState(user?.display_name || user?.name || '')
  const [weight, setWeight] = useState<string>('')
  const [height, setHeight] = useState<string>('')
  const [level, setLevel] = useState('principiante')
  const [goal, setGoal] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [copied, setCopied] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const profileUrl = `${window.location.origin}/u/${user?.id}`

  function shareWhatsApp() {
    const msg = `💪 Sígueme en Calistenia App y entrenemos juntos!\n${profileUrl}`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  async function copyProfileLink() {
    try {
      await navigator.clipboard.writeText(profileUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const input = document.createElement('input')
      input.value = profileUrl
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  useEffect(() => {
    if (!user?.id || loaded) return

    const load = async () => {
      const available = await isPocketBaseAvailable()
      if (available) {
        try {
          const rec = await pb.collection('users').getOne(user.id)
          setDisplayName((rec as any).display_name || (rec as any).name || '')
          setWeight((rec as any).weight ? String((rec as any).weight) : '')
          setHeight((rec as any).height ? String((rec as any).height) : '')
          setLevel((rec as any).level || 'principiante')
          setGoal((rec as any).goal || '')
          setAvatarUrl(getUserAvatarUrl(rec as any, '200x200'))
        } catch (e) {
          console.warn('Failed to load profile:', e)
        }
      }
      setLoaded(true)
    }
    load()
  }, [user?.id, loaded])

  const bmi = useMemo(() => {
    const w = parseFloat(weight)
    const h = parseFloat(height)
    if (!w || !h || h <= 0) return null
    const meters = h / 100
    return (w / (meters * meters)).toFixed(1)
  }, [weight, height])

  const bmiCategory = useMemo(() => {
    if (!bmi) return null
    const v = parseFloat(bmi)
    if (v < 18.5) return { label: 'Bajo peso', color: 'text-amber-400' }
    if (v < 25) return { label: 'Normal', color: 'text-emerald-500' }
    if (v < 30) return { label: 'Sobrepeso', color: 'text-amber-400' }
    return { label: 'Obesidad', color: 'text-red-500' }
  }, [bmi])

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user?.id) return

    setUploadingAvatar(true)
    try {
      const available = await isPocketBaseAvailable()
      if (available) {
        const formData = new FormData()
        formData.append('avatar', file)
        const updated = await pb.collection('users').update(user.id, formData)
        // Add cache-busting param so the browser doesn't show the old cached image
        const url = getUserAvatarUrl(updated as any, '200x200')
        setAvatarUrl(url ? `${url}&t=${Date.now()}` : null)
        // Refresh auth to sync avatar in authStore
        await pb.collection('users').authRefresh()
      }
    } catch (e) {
      console.warn('Failed to upload avatar:', e)
    }
    setUploadingAvatar(false)
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSave = async () => {
    if (!user?.id) return
    setSaving(true)
    setSaved(false)

    try {
      const available = await isPocketBaseAvailable()
      if (available) {
        await pb.collection('users').update(user.id, {
          display_name: displayName,
          weight: weight ? parseFloat(weight) : null,
          height: height ? parseFloat(height) : null,
          level,
          goal,
        })
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } catch (e) {
      console.warn('Failed to save profile:', e)
    }

    setSaving(false)
  }

  return (
    <div className="max-w-[600px] mx-auto px-4 py-6 md:px-6 md:py-8">
      <div className="text-[10px] text-muted-foreground tracking-[3px] mb-2 uppercase">Cuenta</div>
      <div className="font-bebas text-[36px] md:text-[52px] leading-none mb-8">PERFIL</div>

      {/* Avatar */}
      <div className="flex flex-col items-center mb-6">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingAvatar}
          className="relative group size-24 rounded-full overflow-hidden bg-accent border-2 border-border hover:border-lime transition-colors focus:outline-none focus:ring-2 focus:ring-lime"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" className="size-full object-cover" />
          ) : (
            <span className="flex items-center justify-center size-full text-3xl font-bebas text-foreground">
              {(displayName || user?.email || '?')[0]?.toUpperCase()}
            </span>
          )}
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <svg className="size-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </div>
          {uploadingAvatar && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <div className="size-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleAvatarChange}
          className="hidden"
        />
        <span className="text-[10px] text-muted-foreground mt-2">Toca para cambiar foto</span>
      </div>

      {/* Share profile */}
      <div className="mb-6 rounded-xl border border-border bg-card p-4 motion-safe:animate-fade-in">
        <div className="text-xs text-muted-foreground mb-3">Comparte tu perfil</div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={shareWhatsApp}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] tracking-widest h-9 px-4"
          >
            <WhatsAppIcon className="size-4 mr-1.5" />
            WHATSAPP
          </Button>
          <Button
            onClick={copyProfileLink}
            variant="outline"
            size="sm"
            className="text-[10px] tracking-widest h-9 px-4"
          >
            {copied ? (
              <>
                <svg className="size-3.5 mr-1.5 text-lime" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                COPIADO
              </>
            ) : (
              <>
                <svg className="size-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" /></svg>
                COPIAR LINK
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {/* Basic info */}
        <Card id="tour-personal-info">
          <CardContent className="p-5 flex flex-col gap-4">
            <div className="text-[10px] text-muted-foreground tracking-[3px] uppercase mb-1">Información Personal</div>

            <div>
              <Label htmlFor="profile-name" className="text-[11px] text-muted-foreground mb-1.5 block">Nombre</Label>
              <Input
                id="profile-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Tu nombre"
                className="h-10"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="profile-weight" className="text-[11px] text-muted-foreground mb-1.5 block">Peso (kg)</Label>
                <Input
                  id="profile-weight"
                  type="number"
                  step="0.1"
                  min="0"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="Ej: 75"
                  className="h-10"
                />
              </div>
              <div>
                <Label htmlFor="profile-height" className="text-[11px] text-muted-foreground mb-1.5 block">Altura (cm)</Label>
                <Input
                  id="profile-height"
                  type="number"
                  min="0"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  placeholder="Ej: 175"
                  className="h-10"
                />
              </div>
            </div>

            {/* BMI */}
            {bmi && bmiCategory && (
              <div className="bg-muted/30 rounded-lg p-3 border border-border/60">
                <div className="flex items-baseline gap-2">
                  <span className="font-bebas text-3xl leading-none text-foreground">{bmi}</span>
                  <span className="text-[10px] text-muted-foreground tracking-wide uppercase">IMC</span>
                </div>
                <div className={cn('text-xs mt-0.5', bmiCategory.color)}>{bmiCategory.label}</div>
              </div>
            )}

            <div id="tour-level-selector">
              <Label htmlFor="profile-level" className="text-[11px] text-muted-foreground mb-1.5 block">Nivel</Label>
              <div className="flex gap-2">
                {LEVELS.map(l => (
                  <Button
                    key={l.value}
                    variant={level === l.value ? 'default' : 'outline'}
                    size="sm"
                    aria-pressed={level === l.value}
                    onClick={() => setLevel(l.value)}
                    className={level === l.value
                      ? 'h-8 px-4 text-[11px] bg-lime text-zinc-900 hover:bg-lime/90'
                      : 'h-8 px-4 text-[11px]'
                    }
                  >
                    {l.label}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="profile-goal" className="text-[11px] text-muted-foreground mb-1.5 block">Objetivo</Label>
              <textarea
                id="profile-goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Ej: Lograr 10 muscle-ups seguidos, bajar grasa corporal..."
                rows={3}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              />
            </div>
          </CardContent>
        </Card>

        {/* Account info (read-only) */}
        <Card>
          <CardContent className="p-5">
            <div className="text-[10px] text-muted-foreground tracking-[3px] uppercase mb-3">Cuenta</div>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-muted-foreground">Email</span>
                <span className="text-sm text-foreground">{user?.email || '—'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-muted-foreground">Miembro desde</span>
                <span className="text-sm text-foreground">{user?.created?.split(' ')[0] || '—'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Reminders link */}
        <Card
          className="cursor-pointer hover:border-lime-400/30 transition-colors"
          onClick={() => navigate('/reminders')}
        >
          <CardContent className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">🔔</span>
              <div>
                <div className="text-sm font-medium">Recordatorios</div>
                <div className="text-[10px] text-muted-foreground">Comidas, ejercicio y pausas activas</div>
              </div>
            </div>
            <svg className="size-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </CardContent>
        </Card>

        {/* Save button */}
        <Button
          onClick={handleSave}
          disabled={saving}
          className="h-11 bg-lime text-zinc-900 hover:bg-lime/90 font-bebas text-lg tracking-wide"
        >
          {saving ? 'GUARDANDO...' : saved ? '¡GUARDADO!' : 'GUARDAR CAMBIOS'}
        </Button>
      </div>
    </div>
  )
}
