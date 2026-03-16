/**
 * PocketBase admin URL helpers.
 * Generates deep links into the PB admin panel for quick editing.
 */

const PB_URL: string = import.meta.env.VITE_POCKETBASE_URL || (import.meta.env.DEV ? 'http://127.0.0.1:8090' : window.location.origin)

/** PocketBase admin dashboard */
export const PB_ADMIN_URL = `${PB_URL}/_/`

/** Collection IDs */
const COLLECTIONS = {
  program_exercises: 'pbc_3294601311',
  exercises_catalog: 'pbc_4000000001',
  programs: 'pbc_2970041692',
  users: '_pb_users_auth_',
} as const

/** Open PB admin for a specific collection */
export function pbCollectionUrl(collection: keyof typeof COLLECTIONS): string {
  return `${PB_URL}/_/#/collections?collection=${COLLECTIONS[collection]}`
}

/** Open PB admin for a specific record in a collection */
export function pbRecordUrl(collection: keyof typeof COLLECTIONS, recordId: string): string {
  return `${PB_URL}/_/#/collections?collection=${COLLECTIONS[collection]}&recordId=${recordId}`
}

/** Open PB admin for a program_exercises record */
export function pbExerciseEditUrl(recordId: string): string {
  return pbRecordUrl('program_exercises', recordId)
}

/** Open PB admin for an exercises_catalog record */
export function pbCatalogEditUrl(recordId: string): string {
  return pbRecordUrl('exercises_catalog', recordId)
}
