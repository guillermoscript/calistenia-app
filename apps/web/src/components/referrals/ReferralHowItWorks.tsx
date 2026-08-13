import { useTranslation } from 'react-i18next'
import {
  REFERRAL_BONUS_POINTS,
  REFERRAL_SIGNUP_POINTS,
} from '@calistenia/core/hooks/useReferrals'

/**
 * Explica en producto qué cuenta como referido válido y cuándo llegan los puntos.
 * Los importes salen de las constantes del core, que son las mismas que aplica
 * `pb_hooks/referral_side_effects.pb.js`, para que la copy no pueda prometer
 * una cifra distinta a la que acredita el servidor.
 */
export function ReferralHowItWorks() {
  const { t } = useTranslation()

  const steps = [
    t('referrals.howItWorksStep1'),
    t('referrals.howItWorksStep2'),
    t('referrals.howItWorksStep3', {
      referrerPoints: REFERRAL_SIGNUP_POINTS,
      referredPoints: REFERRAL_BONUS_POINTS,
    }),
  ]

  return (
    <div className="mb-6 p-4 rounded-xl border border-border bg-card">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3">
        {t('referrals.howItWorksTitle')}
      </div>
      <ol className="space-y-2">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span className="mt-0.5 size-5 shrink-0 rounded-full bg-[hsl(var(--lime))]/15 text-[hsl(var(--lime))] font-bebas text-xs flex items-center justify-center">
              {i + 1}
            </span>
            <span className="text-xs text-muted-foreground leading-relaxed">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
