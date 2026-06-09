import { Redirect } from 'expo-router'
import { pb } from '@calistenia/core/lib/pocketbase'

export default function Index() {
  return <Redirect href={pb.authStore.isValid ? '/home' : '/login'} />
}
