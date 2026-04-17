const ONBOARDING_KEY_PREFIX = 'calistenia_onboarding_done'

function getOnboardingKey(userId?: string): string {
  return userId ? `${ONBOARDING_KEY_PREFIX}_${userId}` : ONBOARDING_KEY_PREFIX
}

export function isOnboardingDone(userId?: string): boolean {
  return localStorage.getItem(getOnboardingKey(userId)) === 'true'
}

export function markOnboardingDone(userId?: string): void {
  localStorage.setItem(getOnboardingKey(userId), 'true')
}
