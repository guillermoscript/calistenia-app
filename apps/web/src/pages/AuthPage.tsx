import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { captureReferralCode } from '@/hooks/useAuth'

interface AuthPageProps {
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<void>
  authError: string | null
  isLoading: boolean
}

export default function AuthPage({ signInWithGoogle, signInWithEmail, signUpWithEmail, authError, isLoading }: AuthPageProps) {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const initialMode = searchParams.get('mode') === 'signup' ? 'signup' : searchParams.get('ref') && searchParams.get('mode') !== 'login' ? 'signup' : 'login'
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')

  // Capture ?ref= query param to localStorage
  useEffect(() => {
    const ref = searchParams.get('ref')
    if (ref) captureReferralCode(ref)
  }, [searchParams])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === 'login') {
      signInWithEmail(email, password)
    } else {
      signUpWithEmail(email, password, displayName)
    }
  }

  const inputCls = 'w-full h-10 px-3 rounded-lg border border-[hsl(0_0%_15%)] bg-[hsl(0_0%_4%)] text-sm text-[hsl(0_0%_90%)] placeholder:text-[hsl(0_0%_35%)] focus:outline-none focus:border-[hsl(82_85%_55%/0.5)] transition-colors'

  return (
    <div className="min-h-screen bg-[hsl(0_0%_2%)] flex items-center justify-center p-6">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-2.5 mb-2">
            <img src="/logo.png" alt="" className="w-9 h-9 rounded-lg" />
            <span className="font-bebas text-3xl tracking-[0.15em] text-[hsl(0_0%_95%)]">CALISTENIA</span>
          </div>
          <p className="text-xs text-[hsl(0_0%_50%)] tracking-[0.2em] uppercase">{t('auth.tagline')}</p>
        </div>

        {/* Card */}
        <div className="bg-[hsl(0_0%_6%)] border border-[hsl(0_0%_12%)] rounded-xl overflow-hidden">
          <div className="p-6 flex flex-col gap-4">
            <p className="text-center text-sm text-[hsl(0_0%_60%)]">
              {mode === 'login' ? t('auth.loginSubtitle') : t('auth.signupSubtitle')}
            </p>

            {authError && (
              <div className="px-3.5 py-2.5 bg-red-500/10 border border-red-500/25 rounded-lg text-red-400 text-sm">
                {authError}
              </div>
            )}

            {/* Google */}
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
              {isLoading ? t('auth.connecting') : t('auth.continueWithGoogle')}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-[hsl(0_0%_12%)]" />
              <span className="text-[10px] text-[hsl(0_0%_40%)] tracking-widest uppercase">{t('common.or')}</span>
              <div className="flex-1 h-px bg-[hsl(0_0%_12%)]" />
            </div>

            {/* Email/Password form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              {mode === 'signup' && (
                <input
                  type="text"
                  placeholder={t('auth.name')}
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  className={inputCls}
                  required
                />
              )}
              <input
                type="email"
                placeholder={t('auth.email')}
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={inputCls}
                required
              />
              <input
                type="password"
                placeholder={t('auth.password')}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className={inputCls}
                required
                minLength={8}
              />
              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 rounded-lg bg-[hsl(82_85%_55%)] text-black text-sm font-bold tracking-wide hover:bg-[hsl(82_85%_60%)] transition-colors disabled:opacity-50"
              >
                {isLoading ? t('common.loading') : mode === 'login' ? t('auth.login') : t('auth.createAccount')}
              </button>
            </form>

            {/* Toggle mode */}
            <p className="text-center text-xs text-[hsl(0_0%_50%)]">
              {mode === 'login' ? (
                <>
                  {t('auth.noAccount')}{' '}
                  <button type="button" onClick={() => setMode('signup')} className="text-[hsl(82_85%_55%)] hover:underline">
                    {t('auth.register')}
                  </button>
                </>
              ) : (
                <>
                  {t('auth.hasAccount')}{' '}
                  <button type="button" onClick={() => setMode('login')} className="text-[hsl(82_85%_55%)] hover:underline">
                    {t('auth.loginLink')}
                  </button>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-3 mt-5 text-xs text-[hsl(0_0%_40%)]">
          <Link to="/legal#privacy" className="hover:text-[hsl(0_0%_60%)] transition-colors">{t('auth.privacy')}</Link>
          <span>·</span>
          <Link to="/legal#terms" className="hover:text-[hsl(0_0%_60%)] transition-colors">{t('auth.terms')}</Link>
        </div>
      </div>
    </div>
  )
}
