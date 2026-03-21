import { useState, type InputHTMLAttributes } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { RegisterData } from '@/lib/pocketbase'

interface AuthPageProps {
  signIn: (email: string, password: string) => Promise<void>
  signUp: (data: RegisterData) => Promise<void>
  signInWithGoogle: () => Promise<void>
  authError: string | null
  isLoading: boolean
}

type AuthMode = 'login' | 'register'

const LEVELS = [
  { value: 'principiante', label: 'Principiante', desc: 'Nuevo en calistenia' },
  { value: 'intermedio', label: 'Intermedio', desc: '6+ meses entrenando' },
  { value: 'avanzado', label: 'Avanzado', desc: 'Muscle-ups, planche...' },
]

const SEX_OPTIONS = [
  { value: 'male', label: 'Hombre' },
  { value: 'female', label: 'Mujer' },
]

function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        {...props}
        type={show ? 'text' : 'password'}
        className={cn(props.className as string, 'pr-10')}
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        className="absolute right-0 top-0 h-full px-3 text-[hsl(0_0%_45%)] hover:text-[hsl(0_0%_70%)] transition-colors"
        aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        tabIndex={-1}
      >
        {show ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  )
}

export default function AuthPage({ signIn, signUp, signInWithGoogle, authError, isLoading }: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>('login')

  // Step: 0 = credentials, 1 = profile data
  const [step, setStep] = useState(0)

  // Fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [weight, setWeight] = useState('')
  const [height, setHeight] = useState('')
  const [age, setAge] = useState('')
  const [sex, setSex] = useState('')
  const [level, setLevel] = useState('principiante')
  const [goal, setGoal] = useState('')

  const switchMode = (m: AuthMode) => {
    setMode(m)
    setStep(0)
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    await signIn(email, password)
  }

  const handleRegisterStep1 = (e: React.FormEvent) => {
    e.preventDefault()
    setStep(1)
  }

  const handleRegisterStep2 = async (e: React.FormEvent) => {
    e.preventDefault()
    await signUp({
      email,
      password,
      display_name: displayName,
      weight: weight ? parseFloat(weight) : null,
      height: height ? parseFloat(height) : null,
      age: age ? parseInt(age, 10) : null,
      sex,
      level,
      goal,
    })
  }

  return (
    <div className="min-h-screen bg-[hsl(0_0%_2%)] flex items-center justify-center p-6">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-2.5 mb-2">
            <img src="/logo.png" alt="" className="w-9 h-9 rounded-lg" />
            <span className="font-bebas text-3xl tracking-[0.15em] text-[hsl(0_0%_95%)]">CALISTENIA</span>
          </div>
          <p className="text-xs text-[hsl(0_0%_50%)] tracking-[0.2em] uppercase">Entrena con propósito</p>
        </div>

        {/* Card */}
        <div className="bg-[hsl(0_0%_6%)] border border-[hsl(0_0%_12%)] rounded-xl overflow-hidden">

          {/* Mode tabs */}
          <div className="flex border-b border-[hsl(0_0%_12%)]">
            {(['login', 'register'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={cn(
                  'flex-1 py-3.5 text-xs tracking-[0.2em] font-medium transition-colors uppercase border-b-2 -mb-px',
                  mode === m
                    ? 'text-[hsl(0_0%_95%)] border-lime'
                    : 'text-[hsl(0_0%_50%)] border-transparent hover:text-[hsl(0_0%_75%)]'
                )}
              >
                {m === 'login' ? 'Iniciar sesión' : 'Registrarse'}
              </button>
            ))}
          </div>

          <div className="p-6">
            {/* ── Login ─────────────────────────────── */}
            {mode === 'login' && (
              <form onSubmit={handleLogin} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="login-email" className="text-xs tracking-widest uppercase text-[hsl(0_0%_50%)]">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="bg-[hsl(0_0%_4%)] border-[hsl(0_0%_15%)] h-11 text-[hsl(0_0%_90%)] placeholder:text-[hsl(0_0%_30%)]"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="login-password" className="text-xs tracking-widest uppercase text-[hsl(0_0%_50%)]">Contraseña</Label>
                  <PasswordInput
                    id="login-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="bg-[hsl(0_0%_4%)] border-[hsl(0_0%_15%)] h-11 text-[hsl(0_0%_90%)] placeholder:text-[hsl(0_0%_30%)]"
                  />
                </div>

                {authError && (
                  <div className="px-3.5 py-2.5 bg-red-500/10 border border-red-500/25 rounded-lg text-red-400 text-sm">
                    {authError}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-11 bg-lime text-[hsl(0_0%_5%)] hover:bg-lime/90 font-semibold text-sm mt-1"
                >
                  {isLoading ? 'Entrando...' : 'Entrar'}
                </Button>

                <div className="relative my-1">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-[hsl(0_0%_12%)]" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-[hsl(0_0%_6%)] px-3 text-[hsl(0_0%_40%)]">o</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={signInWithGoogle}
                  disabled={isLoading}
                  className="w-full h-11 flex items-center justify-center gap-2.5 rounded-lg border border-[hsl(0_0%_15%)] bg-[hsl(0_0%_4%)] text-sm text-[hsl(0_0%_80%)] hover:bg-[hsl(0_0%_8%)] hover:border-[hsl(0_0%_20%)] transition-colors disabled:opacity-50"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Continuar con Google
                </button>
              </form>
            )}

            {/* ── Register step 0: credentials ──────── */}
            {mode === 'register' && step === 0 && (
              <form onSubmit={handleRegisterStep1} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reg-name" className="text-xs tracking-widest uppercase text-[hsl(0_0%_50%)]">Nombre</Label>
                  <Input
                    id="reg-name"
                    type="text"
                    placeholder="Tu nombre"
                    value={displayName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDisplayName(e.target.value)}
                    required
                    autoComplete="name"
                    className="bg-[hsl(0_0%_4%)] border-[hsl(0_0%_15%)] h-11 text-[hsl(0_0%_90%)] placeholder:text-[hsl(0_0%_30%)]"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reg-email" className="text-xs tracking-widest uppercase text-[hsl(0_0%_50%)]">Email</Label>
                  <Input
                    id="reg-email"
                    type="email"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="bg-[hsl(0_0%_4%)] border-[hsl(0_0%_15%)] h-11 text-[hsl(0_0%_90%)] placeholder:text-[hsl(0_0%_30%)]"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reg-password" className="text-xs tracking-widest uppercase text-[hsl(0_0%_50%)]">Contraseña</Label>
                  <PasswordInput
                    id="reg-password"
                    placeholder="Mínimo 8 caracteres"
                    value={password}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="bg-[hsl(0_0%_4%)] border-[hsl(0_0%_15%)] h-11 text-[hsl(0_0%_90%)] placeholder:text-[hsl(0_0%_30%)]"
                  />
                </div>

                {authError && (
                  <div className="px-3.5 py-2.5 bg-red-500/10 border border-red-500/25 rounded-lg text-red-400 text-sm">
                    {authError}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-11 bg-lime text-[hsl(0_0%_5%)] hover:bg-lime/90 font-semibold text-sm mt-1"
                >
                  Siguiente
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="ml-1.5">
                    <path d="M3 8h10m0 0L9 4m4 4L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Button>

                <div className="relative my-1">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-[hsl(0_0%_12%)]" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-[hsl(0_0%_6%)] px-3 text-[hsl(0_0%_40%)]">o</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={signInWithGoogle}
                  disabled={isLoading}
                  className="w-full h-11 flex items-center justify-center gap-2.5 rounded-lg border border-[hsl(0_0%_15%)] bg-[hsl(0_0%_4%)] text-sm text-[hsl(0_0%_80%)] hover:bg-[hsl(0_0%_8%)] hover:border-[hsl(0_0%_20%)] transition-colors disabled:opacity-50"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Registrarse con Google
                </button>
              </form>
            )}

            {/* ── Register step 1: profile ──────────── */}
            {mode === 'register' && step === 1 && (
              <form onSubmit={handleRegisterStep2} className="flex flex-col gap-4">
                <div className="flex items-center gap-3 mb-1">
                  <button
                    type="button"
                    onClick={() => setStep(0)}
                    className="text-[hsl(0_0%_50%)] hover:text-[hsl(0_0%_80%)] transition-colors"
                    aria-label="Volver"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M13 8H3m0 0l4-4m-4 4l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <div>
                    <p className="text-sm text-[hsl(0_0%_90%)] font-medium">Tu perfil</p>
                    <p className="text-xs text-[hsl(0_0%_50%)]">Opcional — puedes completar después</p>
                  </div>
                </div>

                {/* Physical data */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="reg-weight" className="text-xs tracking-widest uppercase text-[hsl(0_0%_50%)]">Peso (kg)</Label>
                    <Input
                      id="reg-weight"
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="75"
                      value={weight}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWeight(e.target.value)}
                      className="bg-[hsl(0_0%_4%)] border-[hsl(0_0%_15%)] h-11 text-[hsl(0_0%_90%)] placeholder:text-[hsl(0_0%_30%)]"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="reg-height" className="text-xs tracking-widest uppercase text-[hsl(0_0%_50%)]">Altura (cm)</Label>
                    <Input
                      id="reg-height"
                      type="number"
                      min="0"
                      placeholder="175"
                      value={height}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHeight(e.target.value)}
                      className="bg-[hsl(0_0%_4%)] border-[hsl(0_0%_15%)] h-11 text-[hsl(0_0%_90%)] placeholder:text-[hsl(0_0%_30%)]"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="reg-age" className="text-xs tracking-widest uppercase text-[hsl(0_0%_50%)]">Edad</Label>
                    <Input
                      id="reg-age"
                      type="number"
                      min="13"
                      max="99"
                      placeholder="28"
                      value={age}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAge(e.target.value)}
                      className="bg-[hsl(0_0%_4%)] border-[hsl(0_0%_15%)] h-11 text-[hsl(0_0%_90%)] placeholder:text-[hsl(0_0%_30%)]"
                    />
                  </div>
                </div>

                {/* Sex */}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs tracking-widest uppercase text-[hsl(0_0%_50%)]">Sexo</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {SEX_OPTIONS.map(s => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setSex(s.value)}
                        className={cn(
                          'h-10 rounded-lg border text-sm transition-colors',
                          sex === s.value
                            ? 'border-lime bg-lime/10 text-lime'
                            : 'border-[hsl(0_0%_15%)] text-[hsl(0_0%_60%)] hover:border-[hsl(0_0%_25%)] hover:text-[hsl(0_0%_80%)]'
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Level */}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs tracking-widest uppercase text-[hsl(0_0%_50%)]">Nivel</Label>
                  <div className="flex flex-col gap-2">
                    {LEVELS.map(l => (
                      <button
                        key={l.value}
                        type="button"
                        onClick={() => setLevel(l.value)}
                        className={cn(
                          'flex items-center gap-3 px-3.5 py-2.5 rounded-lg border text-left transition-colors',
                          level === l.value
                            ? 'border-lime bg-lime/10'
                            : 'border-[hsl(0_0%_15%)] hover:border-[hsl(0_0%_25%)]'
                        )}
                      >
                        <div className={cn(
                          'w-3 h-3 rounded-full border-2 shrink-0',
                          level === l.value ? 'border-lime bg-lime' : 'border-[hsl(0_0%_30%)]'
                        )} />
                        <div>
                          <p className={cn('text-sm', level === l.value ? 'text-lime' : 'text-[hsl(0_0%_80%)]')}>{l.label}</p>
                          <p className="text-xs text-[hsl(0_0%_50%)]">{l.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Goal */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reg-goal" className="text-xs tracking-widest uppercase text-[hsl(0_0%_50%)]">Objetivo</Label>
                  <textarea
                    id="reg-goal"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="Ej: 10 muscle-ups, bajar grasa..."
                    rows={2}
                    className="flex w-full rounded-lg border border-[hsl(0_0%_15%)] bg-[hsl(0_0%_4%)] px-3 py-2.5 text-sm text-[hsl(0_0%_90%)] placeholder:text-[hsl(0_0%_30%)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lime resize-none"
                  />
                </div>

                {authError && (
                  <div className="px-3.5 py-2.5 bg-red-500/10 border border-red-500/25 rounded-lg text-red-400 text-sm">
                    {authError}
                  </div>
                )}

                <div className="flex gap-3 mt-1">
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 h-11 bg-lime text-[hsl(0_0%_5%)] hover:bg-lime/90 font-semibold text-sm"
                  >
                    {isLoading ? 'Creando cuenta...' : 'Crear cuenta'}
                  </Button>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    // Submit without profile data
                    e.preventDefault()
                    signUp({ email, password, display_name: displayName })
                  }}
                  disabled={isLoading}
                  className="text-xs text-[hsl(0_0%_50%)] hover:text-[hsl(0_0%_70%)] transition-colors text-center"
                >
                  Omitir y crear cuenta
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Step indicator for registration */}
        {mode === 'register' && (
          <div className="flex items-center justify-center gap-2 mt-5">
            <div className={cn('w-6 h-1 rounded-full transition-colors', step === 0 ? 'bg-lime' : 'bg-[hsl(0_0%_20%)]')} />
            <div className={cn('w-6 h-1 rounded-full transition-colors', step === 1 ? 'bg-lime' : 'bg-[hsl(0_0%_20%)]')} />
          </div>
        )}

        {/* Switch mode */}
        <p className="text-center mt-5 text-sm text-[hsl(0_0%_50%)]">
          {mode === 'login' ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
          <button
            type="button"
            onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
            className="text-lime hover:text-lime/80 transition-colors"
          >
            {mode === 'login' ? 'Regístrate' : 'Inicia sesión'}
          </button>
        </p>

        <div className="flex items-center justify-center gap-3 mt-4 text-xs text-[hsl(0_0%_40%)]">
          <Link to="/legal#privacy" className="hover:text-[hsl(0_0%_60%)] transition-colors">Privacidad</Link>
          <span>·</span>
          <Link to="/legal#terms" className="hover:text-[hsl(0_0%_60%)] transition-colors">Condiciones</Link>
        </div>
      </div>
    </div>
  )
}
