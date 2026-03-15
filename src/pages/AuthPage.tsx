import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

interface AuthPageProps {
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, displayName: string) => Promise<void>
  authError: string | null
  isLoading: boolean
}

type AuthMode = 'login' | 'register'

export default function AuthPage({ signIn, signUp, authError, isLoading }: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (mode === 'login') {
      await signIn(email, password)
    } else {
      await signUp(email, password, displayName)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="font-bebas text-4xl tracking-[0.15em] leading-none">
            CALISTENIA
          </div>
          <div className="text-xs text-muted-foreground tracking-[0.25em] mt-1.5 uppercase">
            6-Month Program
          </div>
        </div>

        <Card>
          <CardHeader className="pb-0 pt-6 px-6">
            {/* Mode tabs */}
            <div className="flex border-b border-border -mx-6 px-6">
              {(['login', 'register'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    'flex-1 pb-3 text-xs tracking-widest font-medium transition-all -mb-px border-b-2',
                    mode === m
                      ? 'text-foreground border-foreground'
                      : 'text-muted-foreground border-transparent hover:text-foreground'
                  )}
                >
                  {m === 'login' ? 'INICIAR SESIÓN' : 'REGISTRARSE'}
                </button>
              ))}
            </div>
          </CardHeader>

          <CardContent className="pt-6 pb-6 px-6">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">

              {mode === 'register' && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="displayName" className="text-xs tracking-widest uppercase text-muted-foreground">Nombre</Label>
                  <Input
                    id="displayName"
                    type="text"
                    placeholder="Guillermo"
                    value={displayName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDisplayName(e.target.value)}
                    autoComplete="name"
                  />
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email" className="text-xs tracking-widest uppercase text-muted-foreground">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password" className="text-xs tracking-widest uppercase text-muted-foreground">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder={mode === 'register' ? 'Mínimo 8 caracteres' : '••••••••'}
                  value={password}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                  required
                  minLength={mode === 'register' ? 8 : undefined}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </div>

              {authError && (
                <div className="px-3.5 py-2.5 bg-destructive/10 border border-destructive/30 rounded-md text-destructive text-sm">
                  {authError}
                </div>
              )}

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full mt-1"
              >
                {isLoading
                  ? 'Cargando...'
                  : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Switch mode */}
        <p className="text-center mt-5 text-sm text-muted-foreground">
          {mode === 'login' ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
          <button
            type="button"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            className="text-foreground underline underline-offset-4 hover:no-underline transition-all"
          >
            {mode === 'login' ? 'Regístrate' : 'Inicia sesión'}
          </button>
        </p>

      </div>
    </div>
  )
}
