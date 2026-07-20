import { useTranslation } from 'react-i18next'
import { Flag } from 'lucide-react-native'

import { OptionSheet } from '@/components/ui/option-sheet'
import { REPORT_REASONS, type ReportReason } from '@calistenia/core/hooks/useReports'

const REASON_KEY: Record<ReportReason, string> = {
  spam: 'reports.reasonSpam',
  harassment: 'reports.reasonHarassment',
  inappropriate: 'reports.reasonInappropriate',
  other: 'reports.reasonOther',
}

interface ReportReasonSheetProps {
  visible: boolean
  onClose: () => void
  /** Elegir motivo = enviar la denuncia (el caller crea el record). */
  onPick: (reason: ReportReason) => void
}

/** Selector de motivo de denuncia (#220), compartido por perfil y comentarios. */
export function ReportReasonSheet({ visible, onClose, onPick }: ReportReasonSheetProps) {
  const { t } = useTranslation()
  return (
    <OptionSheet
      visible={visible}
      kicker={t('reports.pickerKicker')}
      title={t('reports.pickerTitle')}
      cancelLabel={t('reports.cancel')}
      onClose={onClose}
      options={REPORT_REASONS.map(reason => ({
        key: reason,
        label: t(REASON_KEY[reason]),
        icon: Flag,
        onPress: () => onPick(reason),
      }))}
    />
  )
}
