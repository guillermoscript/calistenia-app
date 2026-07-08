import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ShoppingListView } from '../components/pantry/ShoppingListView'

export default function ShoppingListPage({ userId }: { userId: string | null }) {
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="10,3 5,8 10,13" />
        </svg>
        {t('common.back')}
      </button>

      <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">{t('shopping.kicker')}</div>
      <div className="font-bebas text-4xl md:text-5xl mb-6">{t('shopping.title')}</div>

      <ShoppingListView userId={userId} />
    </div>
  )
}
