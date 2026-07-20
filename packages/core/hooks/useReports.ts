import { useCallback, useRef, useState } from 'react'
import { pb } from '../lib/pocketbase'
import { op } from '../lib/analytics'

export type ReportTargetType = 'user' | 'comment'
export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'other'

/** Motivos en orden de presentación; las UIs los mapean a `reports.reason*`. */
export const REPORT_REASONS: ReportReason[] = ['spam', 'harassment', 'inappropriate', 'other']

export interface ReportInput {
  targetType: ReportTargetType
  /** Usuario denunciado (en comentarios, su autor). */
  targetUserId: string
  commentId?: string
  /** Snapshot del texto denunciado: la revisión sobrevive al borrado. */
  commentText?: string
  sessionId?: string
  reason: ReportReason
  details?: string
}

interface UseReportsReturn {
  report: (input: ReportInput) => Promise<boolean>
  reporting: boolean
}

/**
 * Denuncias de contenido (#220). Solo-escritura: crea el record en
 * content_reports para revisión manual; el usuario nunca lee denuncias.
 * El índice único (reporter, target_type, target_user, comment) hace la
 * denuncia repetida idempotente (400 → true, igual que useBlocks).
 */
export function useReports(userId: string | null): UseReportsReturn {
  const [reporting, setReporting] = useState(false)
  const pendingRef = useRef(false)

  const report = useCallback(async (input: ReportInput): Promise<boolean> => {
    if (!userId || input.targetUserId === userId) return false
    if (pendingRef.current) return false
    pendingRef.current = true
    setReporting(true)
    try {
      await pb.collection('content_reports').create({
        reporter: pb.authStore.record?.id ?? userId,
        target_type: input.targetType,
        target_user: input.targetUserId,
        comment: input.commentId ?? '',
        comment_text: input.commentText?.slice(0, 500) ?? '',
        session_id: input.sessionId ?? '',
        reason: input.reason,
        details: input.details?.slice(0, 500) ?? '',
      })
      op.track('content_reported', { target_type: input.targetType, reason: input.reason })
      return true
    } catch (e: any) {
      // 400 por índice único = ya lo había denunciado → idempotente
      if (e?.status === 400) return true
      console.warn('Report error:', e?.status, e?.message)
      return false
    } finally {
      pendingRef.current = false
      setReporting(false)
    }
  }, [userId])

  return { report, reporting }
}
