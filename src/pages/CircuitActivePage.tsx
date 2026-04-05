import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCircuitSession } from '../contexts/CircuitSessionContext'
import CircuitView from '../components/circuit/CircuitView'

export default function CircuitActivePage() {
  const { isActive, circuit } = useCircuitSession()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isActive || !circuit) navigate('/circuit', { replace: true })
  }, [isActive, circuit, navigate])

  if (!circuit) return null

  return <CircuitView circuit={circuit} />
}
