import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Dumbbell } from 'lucide-react'

interface BlogLayoutProps {
  children: ReactNode
}

export default function BlogLayout({ children }: BlogLayoutProps) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language?.startsWith('en') ? 'en' : 'es'

  const toggleLang = () => {
    i18n.changeLanguage(lang === 'es' ? 'en' : 'es')
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2 font-bold text-lg">
              <Dumbbell className="h-5 w-5 text-lime-500" />
              <span>Calistenia App</span>
            </Link>
            <span className="text-muted-foreground">·</span>
            <Link to="/blog" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Blog
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleLang}
              className="rounded-md px-2 py-1 text-xs font-medium border hover:bg-muted transition-colors"
            >
              {lang === 'es' ? 'EN' : 'ES'}
            </button>
            <Link
              to="/auth"
              className="rounded-full bg-lime-500 px-4 py-1.5 text-sm font-semibold text-black hover:bg-lime-400 transition-colors"
            >
              {t('blog.signIn')}
            </Link>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t py-8 mt-16">
        <div className="mx-auto max-w-4xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <Link to="/" className="flex items-center gap-2 hover:text-foreground transition-colors">
            <Dumbbell className="h-4 w-4" />
            Calistenia App
          </Link>
          <div className="flex gap-4">
            <Link to="/blog" className="hover:text-foreground transition-colors">Blog</Link>
            <Link to="/legal" className="hover:text-foreground transition-colors">Legal</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
