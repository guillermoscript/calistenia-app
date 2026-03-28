import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Dumbbell } from 'lucide-react'

export default function BlogCTA() {
  const { t } = useTranslation()

  return (
    <div className="rounded-2xl bg-gradient-to-br from-lime-500/20 to-emerald-500/10 border border-lime-500/30 p-8 text-center">
      <Dumbbell className="mx-auto mb-4 h-10 w-10 text-lime-500" />
      <h3 className="text-xl font-bold mb-2">{t('blog.cta.title')}</h3>
      <p className="text-muted-foreground mb-6 max-w-md mx-auto">{t('blog.cta.description')}</p>
      <Link
        to="/auth"
        className="inline-flex items-center gap-2 rounded-full bg-lime-500 px-6 py-3 font-semibold text-black hover:bg-lime-400 transition-colors"
      >
        {t('blog.cta.button')}
      </Link>
    </div>
  )
}
