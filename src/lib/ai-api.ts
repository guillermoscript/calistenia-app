/**
 * Resolved AI API base URL.
 *
 * Priority:
 *  1. VITE_AI_API_URL env var (set at build time)
 *  2. In dev mode → empty string (Vite proxy handles /api/*)
 *  3. In production → https://test.guille.tech
 */
export const AI_API_URL: string =
  import.meta.env.VITE_AI_API_URL ||
  (import.meta.env.DEV ? '' : 'https://test.guille.tech')
