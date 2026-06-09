import { useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useFollows } from '../hooks/useFollows'

interface AddFriendPageProps {
  currentUserId: string
}

export default function AddFriendPage({ currentUserId }: AddFriendPageProps) {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const { follow } = useFollows(currentUserId)
  const executed = useRef(false)

  useEffect(() => {
    if (!userId || executed.current) return
    executed.current = true

    const doFollow = async () => {
      await follow(userId)
      navigate(`/u/${userId}`, { replace: true })
    }
    doFollow()
  }, [userId, follow, navigate])

  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="text-sm text-muted-foreground">Siguiendo...</div>
    </div>
  )
}
