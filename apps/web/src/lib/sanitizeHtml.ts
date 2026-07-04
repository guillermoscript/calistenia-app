import DOMPurify from 'dompurify'

/** Sanitize marked-generated HTML before dangerouslySetInnerHTML (GHSA-jpvm-fw3c-8xff). */
export function sanitizeBlogHtml(html: string): string {
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'rel'] })
}
