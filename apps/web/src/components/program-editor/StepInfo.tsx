/**
 * Paso 1 del editor de programas web (#223/#478): información básica.
 * Extraído de ProgramEditorPage.tsx:237-320, sin cambios de markup.
 */
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import type { ProgramEditorState } from '@calistenia/core/hooks/useProgramEditor'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { Card, CardContent } from '../ui/card'

interface StepInfoProps {
  info: ProgramEditorState['info']
  updateInfo: (info: Partial<ProgramEditorState['info']>) => void
  redistributeWeeks: () => void
  canPublishOfficial: boolean
}

export function StepInfo({ info, updateInfo, redistributeWeeks, canPublishOfficial }: StepInfoProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5 md:p-6 space-y-4">
          <div className="font-bebas text-2xl tracking-wide">{t('programEditor.programInfo')}</div>

          <div>
            <label className="text-[11px] text-muted-foreground tracking-widest uppercase block mb-1.5">{t('programEditor.nameLabel')}</label>
            <Input
              value={info.name}
              onChange={e => updateInfo({ name: e.target.value })}
              placeholder={t('programEditor.namePlaceholder')}
              className="text-sm"
            />
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground tracking-widest uppercase block mb-1.5">{t('programEditor.descLabel')}</label>
            <Textarea
              value={info.description}
              onChange={e => updateInfo({ description: e.target.value })}
              placeholder={t('programEditor.descPlaceholder')}
              rows={3}
              className="text-sm"
            />
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground tracking-widest uppercase block mb-1.5">{t('programEditor.durationLabel')}</label>
            <Input
              type="number"
              min={1}
              max={104}
              value={info.durationWeeks}
              onChange={e => updateInfo({ durationWeeks: parseInt(e.target.value) || 1 })}
              onBlur={redistributeWeeks}
              className="text-sm w-32"
            />
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground tracking-widest uppercase block mb-1.5">{t('programEditor.difficultyLabel')}</label>
            <div className="flex gap-2">
              {(['beginner', 'intermediate', 'advanced'] as const).map(d => (
                <button
                  key={d}
                  onClick={() => updateInfo({ difficulty: d })}
                  className={cn(
                    'px-4 py-2 rounded-lg text-[11px] font-mono tracking-widest border transition-all uppercase',
                    info.difficulty === d
                      ? d === 'beginner' ? 'bg-emerald-400/10 border-emerald-400/30 text-emerald-400'
                        : d === 'intermediate' ? 'bg-amber-400/10 border-amber-400/30 text-amber-400'
                        : 'bg-red-400/10 border-red-400/30 text-red-400'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t(`difficulty.${d}`)}
                </button>
              ))}
            </div>
          </div>

          {canPublishOfficial && (
            <div className="pt-2 border-t border-border">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={info.isOfficial}
                  onChange={e => updateInfo({ isOfficial: e.target.checked })}
                  className="size-4 rounded accent-[hsl(var(--lime))]"
                />
                <div>
                  <div className="text-sm font-medium">{t('programEditor.publishOfficial')}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {t('programEditor.publishDesc')}
                  </div>
                </div>
              </label>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
