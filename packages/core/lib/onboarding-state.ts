import { storage } from '../platform'

const key = (userId: string) => `calistenia_onboarding_done_${userId}`

export function isOnboardingDone(userId: string): boolean {
  return storage.getItem(key(userId)) === 'true'
}

export function markOnboardingDone(userId: string): void {
  storage.setItem(key(userId), 'true')
}

export function resetOnboarding(userId: string): void {
  storage.removeItem(key(userId))
}
