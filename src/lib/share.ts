import i18n from './i18n'

const BASE_URL = 'https://gym.guille.tech'

export type ShareMethod = 'native' | 'whatsapp' | 'copy'

interface ShareContentOptions {
  title: string
  text: string
  url: string
}

/**
 * Share a link with customized text via native share, WhatsApp, or clipboard.
 * Returns true if shared successfully, false if cancelled/failed.
 */
export async function shareContent(opts: ShareContentOptions, method: ShareMethod = 'native'): Promise<boolean> {
  const fullMessage = `${opts.text}\n${opts.url}`

  if (method === 'whatsapp') {
    window.open(`https://wa.me/?text=${encodeURIComponent(fullMessage)}`, '_blank')
    return true
  }

  if (method === 'native' && navigator.share) {
    try {
      await navigator.share({ title: opts.title, text: opts.text, url: opts.url })
      return true
    } catch {
      // User cancelled
      return false
    }
  }

  // Fallback: copy to clipboard
  try {
    await navigator.clipboard.writeText(fullMessage)
    return true
  } catch {
    return false
  }
}

// ── Pre-built share messages per content type ──────────────────────────────

export function shareProfile(displayName: string, userId: string, method?: ShareMethod) {
  return shareContent({
    title: i18n.t('share.profileTitle', { name: displayName }),
    text: i18n.t('share.profileText', { name: displayName }),
    url: `${BASE_URL}/u/${userId}`,
  }, method)
}

export function shareRoutine(userName: string, programName: string, userId: string, method?: ShareMethod) {
  return shareContent({
    title: i18n.t('share.routineTitle', { user: userName, program: programName }),
    text: i18n.t('share.routineText', { user: userName, program: programName }),
    url: `${BASE_URL}/u/${userId}/routine`,
  }, method)
}

export function shareProgram(programName: string, programId: string, method?: ShareMethod) {
  return shareContent({
    title: programName,
    text: i18n.t('share.programText', { name: programName }),
    url: `${BASE_URL}/shared/${programId}`,
  }, method)
}

export function shareChallenge(challengeTitle: string, challengeId: string, method?: ShareMethod) {
  return shareContent({
    title: challengeTitle,
    text: i18n.t('share.challengeText', { title: challengeTitle }),
    url: `${BASE_URL}/challenges/${challengeId}`,
  }, method)
}

export function shareWorkoutSession(userName: string, workoutTitle: string, date: string, workoutKey: string, method?: ShareMethod) {
  return shareContent({
    title: i18n.t('share.sessionTitle', { user: userName, workout: workoutTitle }),
    text: i18n.t('share.sessionText', { user: userName, workout: workoutTitle }),
    url: `${BASE_URL}/session/${date}/${workoutKey}`,
  }, method)
}

export function shareReferralInvite(displayName: string, referralCode: string, method?: ShareMethod) {
  return shareContent({
    title: i18n.t('share.referralTitle', { name: displayName }),
    text: i18n.t('share.referralText', { name: displayName }),
    url: `${BASE_URL}/invite/${referralCode}`,
  }, method)
}

export function shareApp(method?: ShareMethod) {
  return shareContent({
    title: 'Calistenia App',
    text: i18n.t('share.appText'),
    url: BASE_URL,
  }, method)
}

/**
 * Share an image blob via Web Share API with proper canShare check,
 * falling back to download if file sharing is not supported.
 */
export async function shareImage(blob: Blob, filename: string, title?: string, text?: string): Promise<void> {
  const file = new File([blob], filename, { type: 'image/png' })

  // Check if the browser supports sharing files specifically
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text })
      return
    } catch {
      // User cancelled or share failed — fall through to download
    }
  }

  // Fallback: download the image
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Convert a canvas to blob (promisified).
 */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
}

/** Cached logo for share cards */
let _logoCache: HTMLImageElement | null = null

/**
 * Load the app logo image for use in share card canvases.
 * Caches after first load.
 */
export function loadLogo(): Promise<HTMLImageElement | null> {
  if (_logoCache) return Promise.resolve(_logoCache)
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => { _logoCache = img; resolve(img) }
    img.onerror = () => resolve(null)
    img.src = '/logo.png'
  })
}
